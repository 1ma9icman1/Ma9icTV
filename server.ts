import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { Readable } from 'stream';
import parser from 'iptv-playlist-parser';
import { XMLParser } from 'fast-xml-parser';
import { Agent } from 'undici';

const TLS_CERTIFICATE_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_REVOKED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function isTlsCertificateError(error: unknown): boolean {
  let current: any = error;
  const visited = new Set<unknown>();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (typeof current.code === 'string' && TLS_CERTIFICATE_ERROR_CODES.has(current.code)) return true;
    current = current.cause;
  }
  return false;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EPG_RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const epgResponseCache = new Map<string, { expiresAt: number; payload: any }>();

function parseXmltvTimestampMs(value: unknown): number {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?$/);
  if (!match) return Date.parse(raw);
  const [, year, month, day, hour, minute, second, zone] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zone ? `${zone.slice(0, 3)}:${zone.slice(3)}` : 'Z'}`;
  return Date.parse(iso);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Large playlist/XMLTV payloads are supported, but bounded to reduce memory-exhaustion risk.
  app.use(express.json({ limit: '20mb', strict: true }));
  app.use(express.urlencoded({ extended: true, limit: '20mb', parameterLimit: 2000 }));

  // Enable CORS for all internal API requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization, User-Agent');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', name: 'Ma9icTV Web Server', time: new Date().toISOString() });
  });

  // Proxy endpoint to bypass CORS and stream content / playlists
  app.get('/api/proxy', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    const customUserAgent =
      (req.query.userAgent as string) ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const customReferer = req.query.referer as string;

    if (!targetUrl) {
      res.status(400).send('Missing target url query parameter');
      return;
    }

    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        res.status(400).send('Only HTTP and HTTPS stream URLs are supported');
        return;
      }

      // Stop upstream downloads if the player navigates away or changes channels.
      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      const headers: Record<string, string> = {
        'User-Agent': customUserAgent,
        'Accept': '*/*',
        'Connection': 'keep-alive',
      };

      // Only pass Referer if specifically provided; sending fake origin triggers 403 on many CDNs
      if (customReferer) {
        headers['Referer'] = customReferer;
      }

      // Forward Range header if seeking or chunk streaming
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const startedAt = Date.now();
      const fetchOptions = {
        method: 'GET' as const,
        headers,
        redirect: 'follow' as const,
        signal: abortController.signal,
      };
      let response: globalThis.Response;
      let insecureTlsDispatcher: Agent | null = null;

      try {
        response = await fetch(targetUrl, fetchOptions);
      } catch (error) {
        // The older app disabled TLS verification globally. Keep secure HTTPS as the
        // default, but preserve compatibility with IPTV providers whose certificates
        // are broken by retrying only recognized certificate-validation failures.
        if (parsedUrl.protocol !== 'https:' || !isTlsCertificateError(error)) throw error;

        console.warn('[Ma9icTV proxy] TLS certificate validation failed; retrying this stream only with relaxed validation', {
          host: parsedUrl.host,
          path: parsedUrl.pathname,
          code: (() => {
            let current: any = error;
            while (current && !current.code) current = current.cause;
            return current?.code || 'unknown certificate error';
          })(),
        });

        insecureTlsDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
        try {
          response = await fetch(targetUrl, {
            ...fetchOptions,
            dispatcher: insecureTlsDispatcher,
          } as RequestInit & { dispatcher: Agent });
        } catch (retryError) {
          await insecureTlsDispatcher.close();
          insecureTlsDispatcher = null;
          throw retryError;
        }
      }

      if (insecureTlsDispatcher) {
        const dispatcherToClose = insecureTlsDispatcher;
        res.once('close', () => { void dispatcherToClose.close().catch(() => {}); });
      }

      const contentType = response.headers.get('content-type') || '';
      const safeTarget = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
      const finalUrl = response.url || targetUrl;
      const urlLower = targetUrl.toLowerCase();
      const finalUrlLower = finalUrl.toLowerCase();

      // Pluto and some IPTV CDNs serve binary AES keys (.key) with an
      // HLS playlist MIME type. Detect by URL before inspecting the MIME type.
      const isKeyPayload = /\.key(?:$|[?#/])/i.test(urlLower)
        || /\.key(?:$|[?#/])/i.test(finalUrlLower);
      const isManifestRequest = !isKeyPayload && (
        /\.m3u8(?:$|\/)/i.test(parsedUrl.pathname)
        || /\.m3u8(?:$|\/)/i.test(new URL(finalUrl).pathname)
        || /mpegurl/i.test(contentType)
      );

      if (!response.ok && response.status !== 206) {
        console.warn('[Ma9icTV proxy] upstream rejected stream', {
          host: parsedUrl.host,
          path: parsedUrl.pathname,
          status: response.status,
          statusText: response.statusText,
          elapsedMs: Date.now() - startedAt,
        });
        res.status(response.status).send(`Upstream server returned error: ${response.status} ${response.statusText}`);
        return;
      }

      if (isManifestRequest) {
        console.info('[Ma9icTV proxy] manifest response', {
          source: safeTarget,
          status: response.status,
          contentType,
          elapsedMs: Date.now() - startedAt,
        });
      }
      // AES keys are tiny binary resources, not HLS documents. Read the key
      // once, correct the CDN's misleading MIME type, and send exact bytes.
      // Key contents and URL query tokens are intentionally never logged.
      if (isKeyPayload) {
        const keyBytes = Buffer.from(await response.arrayBuffer());
        console.info('[Ma9icTV proxy] AES key response', {
          source: safeTarget,
          status: response.status,
          bytes: keyBytes.byteLength,
          contentType,
          elapsedMs: Date.now() - startedAt,
        });
        if (keyBytes.byteLength === 0) {
          console.warn('[Ma9icTV proxy] AES key response was empty', { source: safeTarget });
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(keyBytes.byteLength));
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.status(response.status).end(keyBytes);
        return;
      }

      // Classify common media segment extensions without MIME-type guesses.
      const isSegment =
        urlLower.includes('.ts') ||
        finalUrlLower.includes('.ts') ||
        urlLower.includes('.m4s') ||
        finalUrlLower.includes('.m4s') ||
        urlLower.includes('.mp4') ||
        finalUrlLower.includes('.mp4');

      const finalHostname = new URL(finalUrl).hostname;
      const isPlutoHost =
        /(^|\.)plutotv\.net$/i.test(finalHostname) ||
        /(^|\.)pluto\.tv$/i.test(finalHostname) ||
        /(^|\.)jmp2\.uk$/i.test(finalHostname);
      if (isPlutoHost && !isManifestRequest) {
        console.info('[Ma9icTV proxy] Pluto media response', {
          source: safeTarget,
          finalHost: finalHostname,
          status: response.status,
          contentType,
          contentLength: response.headers.get('content-length'),
          isSegment,
          elapsedMs: Date.now() - startedAt,
        });
      }

      const isM3u8 =
        !isSegment &&
        (urlLower.includes('.m3u8') ||
          finalUrlLower.includes('.m3u8') ||
          contentType.includes('application/vnd.apple.mpegurl') ||
          contentType.includes('application/x-mpegurl') ||
          contentType.includes('audio/x-mpegurl'));

      if (isM3u8) {
        const text = await response.text();
        if (text.trim().startsWith('#EXTM3U')) {
          const proxyParams = `userAgent=${encodeURIComponent(customUserAgent)}${customReferer ? `&referer=${encodeURIComponent(customReferer)}` : ''}`;
          const rewrittenLines = text.split('\n').map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
              // Proxy URI-bearing HLS tags generically, including EXT-X-SESSION-KEY.
              // Leave DRM and other non-HTTP URI schemes untouched.
              if (trimmed.startsWith('#EXT-X-') && /\bURI\s*=\s*(?:"[^"]+"|'[^']+')/i.test(line)) {
                return line.replace(/\bURI\s*=\s*(?:"([^"]+)"|'([^']+)')/i, (match, doubleQuoted, singleQuoted) => {
                  try {
                    const uri = doubleQuoted ?? singleQuoted;
                    const resolved = new URL(uri, finalUrl);
                    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return match;
                    const proxiedUri = `/api/proxy?url=${encodeURIComponent(resolved.toString())}&${proxyParams}`;
                    return match.replace(uri, proxiedUri);
                  } catch {
                    return match;
                  }
                });
              }
              return line;
            }
            // Relative or absolute stream URI
            try {
              const fullUri = new URL(trimmed, finalUrl).toString();
              return `/api/proxy?url=${encodeURIComponent(fullUri)}&${proxyParams}`;
            } catch {
              return line;
            }
          });

          console.info('[Ma9icTV proxy] manifest rewritten', {
            source: safeTarget,
            lines: rewrittenLines.length,
            mediaUris: rewrittenLines.filter((line) => line.startsWith('/api/proxy?')).length,
          });
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.send(rewrittenLines.join('\n'));
          return;
        }
      }

      // Pass through headers for media segments / TS chunks
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentLength = response.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = response.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const acceptRanges = response.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Access-Control-Allow-Origin', '*');
      // IPTV segments are frequently replaced at the same live URL. Caching them
      // for an hour can replay stale chunks and cause freezes or repeated buffering.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.status(response.status);

      // Stream binary body via stream.Readable to avoid byte corruption
      if (response.body) {
        const stream = Readable.fromWeb(response.body as any);
        stream.on('error', (err) => {
          console.warn('Stream pipe warning:', err?.message);
        });
        stream.pipe(res);
      } else {
        res.end();
      }
    } catch (err: any) {
      const safeTarget = (() => {
        try {
          const url = new URL(String(req.query.url || ''));
          return `${url.protocol}//${url.host}${url.pathname}`;
        } catch {
          return '[invalid stream URL]';
        }
      })();
      console.error('[Ma9icTV proxy] request failed', {
        source: safeTarget,
        error: err?.message || String(err),
        aborted: err?.name === 'AbortError',
      });
      if (!res.headersSent && !res.destroyed) {
        res.status(502).json({ error: 'Proxy request failed', details: err?.message });
      }
    }
  });

  // Parse playlist from URL or text
  app.post('/api/parse-playlist', async (req: Request, res: Response) => {
    try {
      const { url, content, userAgent } = req.body;
      let rawM3u = content;

      if (url && !content) {
        const fetchHeaders: Record<string, string> = {
          'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br',
        };
        const response = await fetch(url, { headers: fetchHeaders, redirect: 'follow', signal: AbortSignal.timeout(20000) });
        if (!response.ok) {
          res.status(response.status).json({ error: `Failed to fetch playlist: ${response.statusText}` });
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Check if gzipped (magic bytes 0x1f 0x8b)
        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
          rawM3u = zlib.gunzipSync(buffer).toString('utf-8');
        } else {
          rawM3u = buffer.toString('utf-8');
        }
      }

      if (!rawM3u || typeof rawM3u !== 'string') {
        res.status(400).json({ error: 'No playlist content or URL provided' });
        return;
      }

      // Parse with iptv-playlist-parser with robust fallback
      let header: any = {};
      let items: any[] = [];

      try {
        const parsed = parser.parse(rawM3u);
        header = parsed.header;
        items = parsed.items;
      } catch (parserErr) {
        console.warn('iptv-playlist-parser threw error, using fallback regex parser:', parserErr);
        // Fallback line-by-line regex
        const lines = rawM3u.split(/\r?\n/);
        let curr: any = null;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('#EXTINF:')) {
            const comma = trimmed.indexOf(',');
            const info = comma !== -1 ? trimmed.substring(0, comma) : trimmed;
            const name = comma !== -1 ? trimmed.substring(comma + 1).trim() : 'Channel';
            const tvgId = info.match(/tvg-id="([^"]*)"/i)?.[1] || '';
            const tvgName = info.match(/tvg-name="([^"]*)"/i)?.[1] || '';
            const tvgLogo = info.match(/tvg-logo="([^"]*)"/i)?.[1] || '';
            const group = info.match(/group-title="([^"]*)"/i)?.[1] || 'General';
            const isRadio = /radio="(true|1)"/i.test(info);
            curr = { name, tvg: { id: tvgId, name: tvgName, logo: tvgLogo }, group: { title: group }, radio: isRadio };
          } else if (!trimmed.startsWith('#') && curr && trimmed.length > 5) {
            curr.url = trimmed;
            items.push(curr);
            curr = null;
          }
        }
      }

      // Preserve per-stream headers used by many public IPTV sources.
      // Without these, a stream can work in an IPTV app but fail in a browser proxy.
      const streamHeaders = new Map<string, { httpUserAgent?: string; httpReferrer?: string }>();
      let pendingHeaders: { httpUserAgent?: string; httpReferrer?: string } = {};
      for (const rawLine of rawM3u.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF:')) {
          pendingHeaders = {};
          const uaAttr = line.match(/(?:http-user-agent|user-agent)\s*=\s*["']([^"']+)["']/i);
          const refAttr = line.match(/(?:http-referrer|http-referer|referer|referrer)\s*=\s*["']([^"']+)["']/i);
          if (uaAttr) pendingHeaders.httpUserAgent = uaAttr[1].trim();
          if (refAttr) pendingHeaders.httpReferrer = refAttr[1].trim();
        } else if (line.startsWith('#EXTVLCOPT:')) {
          const ua = line.match(/http-user-agent\s*=\s*(.+)$/i);
          const ref = line.match(/http-referrer\s*=\s*(.+)$/i);
          if (ua) pendingHeaders.httpUserAgent = ua[1].trim();
          if (ref) pendingHeaders.httpReferrer = ref[1].trim();
        } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
          if (pendingHeaders.httpUserAgent || pendingHeaders.httpReferrer) {
            streamHeaders.set(line, { ...pendingHeaders });
          }
          pendingHeaders = {};
        }
      }
      for (const item of items) {
        const headers = streamHeaders.get(String(item.url || '').trim());
        if (headers) {
          if (headers.httpUserAgent) item.httpUserAgent = headers.httpUserAgent;
          if (headers.httpReferrer) item.httpReferrer = headers.httpReferrer;
        }
      }

      // Check if #EXTM3U header contains url-tvg or x-tvg-url
      const m3uHeaderLine = rawM3u.split(/\r?\n/, 1)[0] || '';
      const tvgUrlMatch = m3uHeaderLine.match(/(?:url-tvg|x-tvg-url|tvg-url)\s*=\s*["']([^"']+)["']/i);
      if (tvgUrlMatch) {
        header = { ...header, urlTvg: tvgUrlMatch[1] };
      }

      res.json({
        header,
        items,
        count: items.length,
      });
    } catch (err: any) {
      console.error('Playlist parse error:', err);
      res.status(500).json({ error: 'Failed to parse playlist', details: err?.message });
    }
  });

  // Parse XMLTV EPG endpoint. M3U headers can advertise one guide URL or a
  // comma-separated list of guides (the Free-TV curated playlist uses many).
  app.post('/api/parse-epg', async (req: Request, res: Response) => {
    try {
      const { url, content } = req.body;
      if (!url && !content) {
        res.status(400).json({ error: 'No EPG URL or XML data provided' });
        return;
      }

      const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });

      const readXmlText = (value: any): string => {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(readXmlText).filter(Boolean).join(' ');
        return typeof value?.['#text'] === 'string' ? value['#text'] : '';
      };

      const urls: string[] = typeof url === 'string'
        ? url.split(/,\s*(?=https?:\/\/)/i).map((item: string) => item.trim()).filter(Boolean)
        : [];
      // Genre playlists can span many countries. Allow a broader guide bundle,
      // while parsing in small concurrent batches to protect Render memory/CPU.
      // URLs are deduplicated so repeated regional feeds are not downloaded twice.
      const uniqueUrls = Array.from(new Set(urls));
      const sources = content
        ? [{ url: 'inline XMLTV', content: String(content) }]
        : uniqueUrls.slice(0, 32).map((sourceUrl) => ({ url: sourceUrl }));
      if (sources.length === 0) {
        res.status(400).json({ error: 'No valid EPG URLs were found' });
        return;
      }

      // Genre lists reuse the same guide feeds. Cache their parsed schedules for
      // five minutes to avoid repeatedly downloading and parsing large XMLTV files.
      const cacheKey = content ? null : sources.map((source) => source.url).sort().join('\n');
      if (cacheKey) {
        const cached = epgResponseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          res.setHeader('X-Ma9icTV-EPG-Cache', 'HIT');
          res.json(cached.payload);
          return;
        }
        if (cached) epgResponseCache.delete(cacheKey);
      }

      const nowMs = Date.now();
      // EpgGuide indexes programmes from two hours back to eight hours ahead.
      // Keep a one-hour margin on either side so the five-minute cache stays useful
      // as the clock advances, while returning far fewer records than a full XMLTV day.
      const programmeWindowStartMs = nowMs - 3 * 60 * 60 * 1000;
      const programmeWindowEndMs = nowMs + 9 * 60 * 60 * 1000;
      const channelsById = new Map<string, any>();
      const programmeByKey = new Map<string, any>();
      const failedSources: string[] = [];
      let loadedSources = 0;

      const parseSource = async (source: { url: string; content?: string }) => {
        try {
          let rawXml = source.content;
          if (!rawXml) {
            const response = await fetch(source.url, {
              headers: {
                'User-Agent': 'Ma9icTV/1.0 XMLTV',
                'Accept-Encoding': 'gzip, deflate',
              },
              redirect: 'follow',
              signal: AbortSignal.timeout(20000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const buffer = Buffer.from(await response.arrayBuffer());
            rawXml = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
              ? zlib.gunzipSync(buffer).toString('utf-8')
              : buffer.toString('utf-8');
          }

          const parsedData = xmlParser.parse(rawXml);
          const tvData = parsedData.tv || {};
          const rawChannels = Array.isArray(tvData.channel) ? tvData.channel : (tvData.channel ? [tvData.channel] : []);
          const rawProgrammes = Array.isArray(tvData.programme) ? tvData.programme : (tvData.programme ? [tvData.programme] : []);

          for (const channel of rawChannels) {
            const id = String(channel['@_id'] || '').trim();
            if (!id) continue;
            const displayNames = Array.isArray(channel['display-name']) ? channel['display-name'] : [channel['display-name']];
            const names = displayNames.map(readXmlText).filter(Boolean);
            const existing = channelsById.get(id);
            channelsById.set(id, {
              id,
              name: names[0] || id,
              names: Array.from(new Set([...(existing?.names || []), ...names])),
              icon: channel.icon?.['@_src'] || existing?.icon || '',
            });
          }

          for (const programme of rawProgrammes) {
            const channel = String(programme['@_channel'] || '').trim();
            const start = String(programme['@_start'] || '').trim();
            const stop = String(programme['@_stop'] || '').trim();
            const showTitle = readXmlText(programme.title).trim();
            const episodeTitle = readXmlText(programme['sub-title']).trim();
            const title = showTitle && episodeTitle && episodeTitle.toLocaleLowerCase() !== showTitle.toLocaleLowerCase()
              ? `${showTitle} — ${episodeTitle}`
              : (showTitle || episodeTitle);
            if (!channel || !start || !stop || !title) continue;
            const startMs = parseXmltvTimestampMs(start);
            const stopMs = parseXmltvTimestampMs(stop);
            if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) continue;
            if (stopMs < programmeWindowStartMs || startMs > programmeWindowEndMs) continue;
            const key = `${channel}| ${start}| ${stop}| ${title}`;
            if (!programmeByKey.has(key)) {
              programmeByKey.set(key, {
                channel,
                start,
                stop,
                title,
                desc: readXmlText(programme.desc),
                category: readXmlText(programme.category),
              });
            }
          }
          loadedSources += 1;
        } catch (error: any) {
          failedSources.push(`${source.url}: ${error?.message || 'fetch/parse failed'}`);
        }
      };

      // Limit concurrent downloads so large multi-guide headers don't overwhelm Render.
      const concurrency = 4;
      for (let index = 0; index < sources.length; index += concurrency) {
        await Promise.all(sources.slice(index, index + concurrency).map(parseSource));
      }

      const channels = Array.from(channelsById.values());
      const programmes = Array.from(programmeByKey.values());
      if (loadedSources === 0 || programmes.length === 0) {
        res.status(502).json({
          error: 'No valid XMLTV programme data could be loaded',
          sourceCount: uniqueUrls.length,
          loadedSourceCount: loadedSources,
          failedSourceCount: failedSources.length,
          failedSources: failedSources.slice(0, 10),
        });
        return;
      }

      const payload = {
        channels,
        programmes,
        channelCount: channels.length,
        programmeCount: programmes.length,
        sourceCount: uniqueUrls.length,
        loadedSourceCount: loadedSources,
        failedSourceCount: failedSources.length,
        failedSources: failedSources.slice(0, 10),
      };

      if (cacheKey) {
        // Bound memory if different user-supplied guide URLs are loaded.
        if (epgResponseCache.size >= 12) {
          const oldestKey = epgResponseCache.keys().next().value;
          if (oldestKey) epgResponseCache.delete(oldestKey);
        }
        epgResponseCache.set(cacheKey, {
          expiresAt: Date.now() + EPG_RESPONSE_CACHE_TTL_MS,
          payload,
        });
        res.setHeader('X-Ma9icTV-EPG-Cache', 'MISS');
      }
      res.json(payload);
    } catch (err: any) {
      console.error('EPG parse error:', err);
      res.status(500).json({ error: 'Failed to parse XMLTV EPG', details: err?.message });
    }
  });

  // Xtream Codes API Proxy
  app.post('/api/xtream', async (req: Request, res: Response) => {
    try {
      const { serverUrl, username, password, action, params } = req.body;

      if (!serverUrl || !username || !password) {
        res.status(400).json({ error: 'Missing Xtream serverUrl, username, or password' });
        return;
      }

      const cleanServerUrl = serverUrl.replace(/\/+$/, '');
      let targetUrl = `${cleanServerUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

      if (action) {
        targetUrl += `&action=${encodeURIComponent(action)}`;
      }

      if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null) {
            targetUrl += `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
          }
        }
      }

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'IPTVnator/0.25.0',
          'Accept': 'application/json',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        res.status(response.status).json({ error: `Xtream API returned ${response.statusText}` });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      console.error('Xtream proxy error:', err);
      res.status(500).json({ error: 'Xtream request failed', details: err?.message });
    }
  });

  // Mount Vite development middlewares or serve static build
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ma9icTV] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Ma9icTV] Failed to start server:', err);
  process.exit(1);
});
