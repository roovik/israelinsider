// Local dev server: serves public/ and the Worker API with an in-memory store seeded from sample feeds.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import worker, { runIngest } from '../worker.js';
const kv = new Map();
const env = { ADMIN_KEY: 'dev', ASSETS: null, STORE: { get: async (k, t) => kv.has(k) ? (t === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null, put: async (k, v) => kv.set(k, v) } };
const now = Date.now(), rfc = h => new Date(now - h * 3600e3).toUTCString(), iso = h => new Date(now - h * 3600e3).toISOString();
const blog = `<rss version="2.0"><channel>${[1, 5, 9, 20].map((h, n) => `<item><title>Sample essay ${n + 1}: a placeholder headline for layout testing</title><link>https://example.org/p/${n}</link><guid>b${n}</guid><pubDate>${rfc(h)}</pubDate><description>A short placeholder excerpt used only to test the layout. It is not a real item.</description></item>`).join('')}</channel></rss>`;
const pod = `<rss xmlns:itunes="x" version="2.0"><channel>${[2, 30, 70].map((h, n) => `<item><title>Sample episode ${n + 1}</title><link>https://example.org/e${n}</link><guid>e${n}</guid><pubDate>${rfc(h)}</pubDate><description>Placeholder description for a test episode.</description><enclosure url="https://example.org/e${n}.mp3" type="audio/mpeg"/><itunes:duration>${41 + n}:08</itunes:duration></item>`).join('')}</channel></rss>`;
const yt = `<feed xmlns:yt="x" xmlns:media="y" xmlns="http://www.w3.org/2005/Atom">${[3, 28, 60].map((h, n) => `<entry><id>yt:video:vid${n}</id><yt:videoId>vid${n}</yt:videoId><title>Sample video ${n + 1}</title><link rel="alternate" href="https://www.youtube.com/watch?v=vid${n}"/><author><name>Sample Channel</name></author><published>${iso(h)}</published><media:group><media:description>A placeholder video description.</media:description></media:group></entry>`).join('')}</feed>`;
const call = (p, body) => worker.fetch(new Request('http://x' + p, { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
await call('/api/admin/voice', { name: 'Sample Writer', short_bio: 'Placeholder bio used for local layout tests.', topics: ['security'], status: 'listed' });
await call('/api/admin/voice', { name: 'Sample Show', short_bio: 'Placeholder show.', topics: ['diplomacy'], status: 'listed' });
await call('/api/admin/feed', { voice_id: 'sample-writer', kind: 'blog', url: 'https://t/blog' });
await call('/api/admin/feed', { voice_id: 'sample-show', kind: 'podcast', url: 'https://t/pod' });
await call('/api/admin/feed', { voice_id: 'sample-show', kind: 'youtube', external_id: 'UC1' });
await runIngest(env, async u => new Response(u.includes('pod') ? pod : u.includes('youtube') ? yt : blog));
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
    const r = await worker.fetch(new Request('http://x' + req.url, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let f = path.join('public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  const ext = path.extname(f); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[ext] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8787, () => console.log('http://localhost:8787'));
