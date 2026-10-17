import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { Readable } from 'stream';
import parser from 'iptv-playlist-parser';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    res.json({ status: 'ok', name: 'IPTVnator Web Server', time: new Date().toISOString() });
  });

  // Proxy endpoint to bypass CORS and stream content / playlists
  app.get('/api/proxy', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    const customUserAgent = (req.query.userAgent as string) || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 IPTVnator/0.25.0';
    const customReferer = req.query.referer as string;

    if (!targetUrl) {
      res.status(400).send('Missing target url query parameter');
      return;
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const headers: Record<string, string> = {
        'User-Agent': customUserAgent,
        'Accept': '*/*',
        'Connection': 'keep-alive',
      };

      if (customReferer) {
        headers['Referer'] = customReferer;
      } else {
        headers['Referer'] = parsedUrl.origin;
      }

      // Forward Range header if seeking or chunk streaming
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
      });

      if (!response.ok && response.status !== 206) {
        res.status(response.status).send(`Upstream server returned error: ${response.status} ${response.statusText}`);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      const finalUrl = response.url || targetUrl;
      const urlLower = targetUrl.toLowerCase();
      const finalUrlLower = finalUrl.toLowerCase();

      // Check whether this request is a video segment (.ts / .m4s / .mp4 / audio) vs an M3U8 manifest
      const isSegment =
        urlLower.includes('.ts') ||
        finalUrlLower.includes('.ts') ||
        urlLower.includes('.m4s') ||
        finalUrlLower.includes('.m4s') ||
        urlLower.includes('.mp4') ||
        finalUrlLower.includes('.mp4');

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
          const rewrittenLines = text.split('\n').map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
              // Check for URI inside #EXT-X-KEY or #EXT-X-MAP
              if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
                return line.replace(/URI="([^"]+)"/, (_match, uri) => {
                  try {
                    const resolvedUri = new URL(uri, finalUrl).toString();
                    return `URI="/api/proxy?url=${encodeURIComponent(resolvedUri)}&userAgent=${encodeURIComponent(customUserAgent)}"`;
                  } catch {
                    return line;
                  }
                });
              }
              return line;
            }

            // Relative or absolute stream URI
            try {
              const fullUri = new URL(trimmed, finalUrl).toString();
              return `/api/proxy?url=${encodeURIComponent(fullUri)}&userAgent=${encodeURIComponent(customUserAgent)}`;
            } catch {
              return line;
            }
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
      res.setHeader('Cache-Control', 'public, max-age=3600');

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
      console.error('Proxy request failed:', err?.message || err);
      if (!res.headersSent) {
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
          'User-Agent': userAgent || 'IPTVnator/0.25.0',
          'Accept-Encoding': 'gzip, deflate, br',
        };
        const response = await fetch(url, { headers: fetchHeaders, redirect: 'follow' });
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

      // Check if #EXTM3U header contains url-tvg or x-tvg-url
      const tvgUrlMatch = rawM3u.substring(0, 1000).match(/(?:url-tvg|x-tvg-url)="([^"]+)"/i);
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

  // Parse XMLTV EPG endpoint
  app.post('/api/parse-epg', async (req: Request, res: Response) => {
    try {
      const { url, content } = req.body;
      let rawXml = content;

      if (url && !content) {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'IPTVnator/0.25.0',
            'Accept-Encoding': 'gzip, deflate',
          },
          redirect: 'follow',
        });

        if (!response.ok) {
          res.status(response.status).json({ error: `Failed to fetch EPG: ${response.statusText}` });
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
          rawXml = zlib.gunzipSync(buffer).toString('utf-8');
        } else {
          rawXml = buffer.toString('utf-8');
        }
      }

      if (!rawXml) {
        res.status(400).json({ error: 'No EPG data provided' });
        return;
      }

      const xmlParser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });

      const parsedData = xmlParser.parse(rawXml);
      const tvData = parsedData.tv || {};

      // Normalize channels
      const rawChannels = Array.isArray(tvData.channel) ? tvData.channel : (tvData.channel ? [tvData.channel] : []);
      const channels = rawChannels.map((c: any) => ({
        id: c['@_id'] || '',
        name: typeof c['display-name'] === 'string' ? c['display-name'] : (c['display-name']?.[0] || c['display-name']?.['#text'] || c['@_id'] || ''),
        icon: c.icon?.['@_src'] || '',
      }));

      // Normalize programmes
      const rawProgrammes = Array.isArray(tvData.programme) ? tvData.programme : (tvData.programme ? [tvData.programme] : []);
      const programmes = rawProgrammes.slice(0, 1000).map((p: any) => ({
        channel: p['@_channel'] || '',
        start: p['@_start'] || '',
        stop: p['@_stop'] || '',
        title: typeof p.title === 'string' ? p.title : (p.title?.['#text'] || ''),
        desc: typeof p.desc === 'string' ? p.desc : (p.desc?.['#text'] || ''),
        category: typeof p.category === 'string' ? p.category : (p.category?.['#text'] || ''),
      }));

      res.json({
        channels,
        programmes,
        channelCount: channels.length,
        programmeCount: programmes.length,
      });
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
    console.log(`[IPTVnator] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[IPTVnator] Failed to start server:', err);
  process.exit(1);
});
