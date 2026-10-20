#!/usr/bin/env node
'use strict';

// Ma9icTV M3U availability checker, inspired by ghokun/m3u-checker (Apache-2.0).
// Safe by default: writes a report only. Pass --apply to remove confirmed-dead
// streams and exact duplicate URLs within each playlist. Timeouts/403/5xx are
// classified as unknown and are never removed automatically.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LIST_DIR = path.join(ROOT, 'm3u_lists');
const REPORT_PATH = path.join(ROOT, 'm3u-check-report.json');
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = Math.max(1, Math.min(64, Number(process.env.M3U_CHECK_CONCURRENCY) || 24));
const TIMEOUT_MS = Math.max(1500, Math.min(20000, Number(process.env.M3U_CHECK_TIMEOUT_MS) || 6000));
const ATTEMPTS = 2;
const USER_AGENT = 'Ma9icTV-M3U-Checker/1.0 (+https://github.com/1ma9icman1/Ma9icTV)';

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function parsePlaylist(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = [];
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (line.trimStart().startsWith('#EXTINF:')) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      header.push(line);
    }
  }
  if (current) blocks.push(current);

  return { header, blocks };
}

function getBlockUrl(block) {
  const line = block.find((entry) => entry.trim() && !entry.trim().startsWith('#'));
  return line ? line.trim() : '';
}

async function singleProbe(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { status: 'unknown', reason: 'invalid-url' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { status: 'unknown', reason: 'unsupported-protocol' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        Range: 'bytes=0-4095',
      },
    });

    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel().catch(() => {});
      return { status: 'dead', reason: `http-${response.status}`, httpStatus: response.status };
    }

    // Access denial may be caused by geo-blocking, required headers, or hotlink
    // protection. It is not sufficient evidence to delete a stream.
    if ([401, 403, 408, 425, 429].includes(response.status) || response.status >= 500) {
      await response.body?.cancel().catch(() => {});
      return { status: 'unknown', reason: `http-${response.status}`, httpStatus: response.status };
    }

    if (!response.ok && response.status !== 206) {
      await response.body?.cancel().catch(() => {});
      return { status: 'unknown', reason: `http-${response.status}`, httpStatus: response.status };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const finalUrl = response.url || rawUrl;
    const looksLikeManifest = /\.m3u8(?:$|[?#])/i.test(parsed.pathname)
      || /\.m3u8(?:$|[?#])/i.test(new URL(finalUrl).pathname)
      || /mpegurl/i.test(contentType);

    if (looksLikeManifest) {
      const body = (await response.text()).replace(/^\uFEFF/, '').trimStart();
      if (body.startsWith('#EXTM3U')) return { status: 'alive', reason: 'valid-hls-manifest', httpStatus: response.status };
      if (/^<!doctype\s+html|^<html|^<\?xml/i.test(body)) {
        return { status: 'dead', reason: 'html-instead-of-manifest', httpStatus: response.status };
      }
      return { status: 'dead', reason: 'invalid-hls-manifest', httpStatus: response.status };
    }

    if (contentType.includes('text/html')) {
      await response.body?.cancel().catch(() => {});
      return { status: 'dead', reason: 'html-instead-of-media', httpStatus: response.status };
    }

    const reader = response.body?.getReader();
    if (!reader) return { status: 'unknown', reason: 'empty-response', httpStatus: response.status };
    const { value } = await reader.read();
    await reader.cancel().catch(() => {});
    return value?.byteLength
      ? { status: 'alive', reason: 'media-bytes-received', httpStatus: response.status }
      : { status: 'unknown', reason: 'empty-response', httpStatus: response.status };
  } catch (error) {
    return {
      status: 'unknown',
      reason: error?.name === 'AbortError' ? 'timeout' : 'network-error',
      detail: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUrl(url) {
  const results = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    results.push(await singleProbe(url));
    if (results[results.length - 1].status === 'alive') break;
    if (attempt + 1 < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (results.some((result) => result.status === 'alive')) return { status: 'alive', attempts: results };
  // Only delete when both attempts independently returned a definitive failure.
  if (results.length === ATTEMPTS && results.every((result) => result.status === 'dead')) {
    return { status: 'dead', attempts: results };
  }
  return { status: 'unknown', attempts: results };
}

async function runPool(items, workerCount, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  if (!fs.existsSync(LIST_DIR)) throw new Error(`Playlist directory not found: ${LIST_DIR}`);
  const files = fs.readdirSync(LIST_DIR)
    .filter((name) => /\.m3u8?$/i.test(name))
    .sort()
    .map((name) => ({ name, path: path.join(LIST_DIR, name) }));
  if (!files.length) throw new Error('No .m3u or .m3u8 files found in m3u_lists.');

  const parsedFiles = files.map((file) => ({
    ...file,
    ...parsePlaylist(fs.readFileSync(file.path, 'utf8')),
  }));
  const uniqueUrls = new Set();
  const occurrences = new Map();
  for (const file of parsedFiles) {
    for (const block of file.blocks) {
      const rawUrl = getBlockUrl(block);
      if (!rawUrl) continue;
      const key = normalizeUrl(rawUrl);
      uniqueUrls.add(key);
      occurrences.set(key, (occurrences.get(key) || 0) + 1);
    }
  }

  const urls = [...uniqueUrls];
  const results = new Map();
  let checked = 0;
  console.log(`Checking ${urls.length} unique stream URLs from ${files.length} playlists (concurrency ${CONCURRENCY}, ${ATTEMPTS} attempts for failures)...`);
  await runPool(urls, CONCURRENCY, async (url) => {
    results.set(url, await checkUrl(url));
    checked += 1;
    if (checked % 100 === 0 || checked === urls.length) {
      console.log(`Checked ${checked}/${urls.length}`);
    }
  });

  const perFile = [];
  let removedDead = 0;
  let removedDuplicates = 0;
  let aliveCount = 0;
  let deadCount = 0;
  let unknownCount = 0;
  for (const file of parsedFiles) {
    const seenInFile = new Set();
    const keptBlocks = [];
    let duplicates = 0;
    let dead = 0;
    let alive = 0;
    let unknown = 0;

    for (const block of file.blocks) {
      const rawUrl = getBlockUrl(block);
      if (!rawUrl) {
        keptBlocks.push(block);
        continue;
      }
      const key = normalizeUrl(rawUrl);
      const result = results.get(key) || { status: 'unknown', attempts: [] };
      if (result.status === 'dead') {
        dead += 1;
        if (APPLY) continue;
      } else if (result.status === 'alive') {
        alive += 1;
      } else {
        unknown += 1;
      }

      if (seenInFile.has(key)) {
        duplicates += 1;
        if (APPLY) continue;
      } else {
        seenInFile.add(key);
      }
      keptBlocks.push(block);
    }

    aliveCount += alive;
    deadCount += dead;
    unknownCount += unknown;
    removedDead += APPLY ? dead : 0;
    removedDuplicates += APPLY ? duplicates : 0;
    perFile.push({
      file: file.name,
      originalEntries: file.blocks.length,
      alive,
      confirmedDead: dead,
      unknownRetained: unknown,
      duplicateUrlsWithinFile: duplicates,
      resultingEntries: APPLY ? keptBlocks.length : file.blocks.length,
    });

    if (APPLY && (dead > 0 || duplicates > 0)) {
      const output = [...file.header, ...keptBlocks.flat()].join('\n').replace(/\n*$/, '\n');
      const temporaryPath = `${file.path}.tmp`;
      fs.writeFileSync(temporaryPath, output, 'utf8');
      fs.renameSync(temporaryPath, file.path);
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'report-only',
    checker: 'Ma9icTV M3U checker, inspired by ghokun/m3u-checker (Apache-2.0)',
    uniqueUrlsChecked: urls.length,
    totalPlaylistEntries: parsedFiles.reduce((sum, file) => sum + file.blocks.length, 0),
    aliveEntries: aliveCount,
    confirmedDeadEntries: deadCount,
    unknownEntriesRetained: unknownCount,
    removedDeadEntries: removedDead,
    removedDuplicateEntries: removedDuplicates,
    files: perFile,
    urlResults: Object.fromEntries(results),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({
    mode: report.mode,
    uniqueUrlsChecked: report.uniqueUrlsChecked,
    totalPlaylistEntries: report.totalPlaylistEntries,
    aliveEntries: report.aliveEntries,
    confirmedDeadEntries: report.confirmedDeadEntries,
    unknownEntriesRetained: report.unknownEntriesRetained,
    removedDeadEntries: report.removedDeadEntries,
    removedDuplicateEntries: report.removedDuplicateEntries,
    report: path.relative(ROOT, REPORT_PATH),
    files: perFile,
  }, null, 2));
  if (!APPLY && deadCount > 0) console.log('Review the report, then run npm run m3u:check:apply to remove confirmed-dead entries and within-file duplicates.');
}

main().catch((error) => {
  console.error(`M3U check failed: ${error.message || error}`);
  process.exitCode = 1;
});
