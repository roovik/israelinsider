import assert from 'node:assert';
import worker, { runIngest } from '../worker.js';
import { parseFeed, toItems, excerpt, canonicalUrl, parseDuration } from '../lib.js';

const blog = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Sample Blog</title>
<item><title><![CDATA[Sample &amp; essay]]></title><link>https://example.org/p/1?utm_source=x&amp;id=2</link><guid>g1</guid><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><dc:creator>Sample Writer</dc:creator><description><![CDATA[<p>First paragraph of the essay. It goes on and on.</p>]]></description><content:encoded><![CDATA[<p>FULL TEXT HERE</p>]]></content:encoded></item></channel></rss>`;
const pod = `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0"><channel><item><title>Episode 7</title><link>https://example.org/e7</link><guid>e7</guid><pubDate>Sun, 08 Nov 2026 08:00:00 GMT</pubDate><description>Talk about politics.</description><enclosure url="https://cdn.example.org/e7.mp3" length="1" type="audio/mpeg"/><itunes:duration>41:08</itunes:duration><itunes:image href="https://example.org/a.jpg"/></item></channel></rss>`;
const yt = `<feed xmlns:yt="x" xmlns:media="y" xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:abc123</id><yt:videoId>abc123</yt:videoId><title>Video title</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><author><name>Map Minutes</name></author><published>2026-11-09T12:00:00+00:00</published><media:group><media:thumbnail url="https://i.ytimg.com/vi/abc123/hq.jpg" width="480" height="360"/><media:description>A five minute explainer.</media:description></media:group></entry></feed>`;

const b = parseFeed(blog); assert.equal(b.length, 1); assert.equal(b[0].title, 'Sample & essay'); assert.equal(b[0].author, 'Sample Writer');
const voice = { id: 'v1', slug: 'v1', name: 'V1', status: 'listed', topics: ['security'], consent: {} };
let items = await toItems({ id: 'f1', kind: 'blog', format: 'read' }, voice, b, Date.parse('2026-11-10'));
assert.equal(items[0].url, 'https://example.org/p/1?id=2'); assert.ok(!('full_text' in items[0])); assert.match(items[0].excerpt, /^First paragraph/);
items = await toItems({ id: 'f1', kind: 'blog', format: 'read' }, { ...voice, consent: { full_text_ok: true } }, b);
assert.match(items[0].full_text, /FULL TEXT/);
const p = await toItems({ id: 'f2', kind: 'podcast', format: 'listen' }, voice, parseFeed(pod));
assert.equal(p[0].audio_url, 'https://cdn.example.org/e7.mp3'); assert.equal(p[0].duration_seconds, 2468); assert.equal(p[0].thumbnail_url, 'https://example.org/a.jpg');
const y = await toItems({ id: 'f3', kind: 'youtube', format: 'watch' }, voice, parseFeed(yt));
assert.equal(y[0].embed_id, 'abc123'); assert.equal(y[0].format, 'watch'); assert.equal(y[0].excerpt, 'A five minute explainer.');
assert.equal(parseDuration('1:02:11'), 3731); assert.equal(canonicalUrl('https://a.b/c?utm_x=1&fbclid=2&k=3#z'), 'https://a.b/c?k=3');
assert.ok(excerpt('word '.repeat(200)).length <= 303);

// Worker end to end with in memory KV
const kv = new Map();
const env = { ADMIN_KEY: 'k', ASSETS: { fetch: () => new Response('asset') }, STORE: { get: async (k, t) => kv.has(k) ? (t === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null, put: async (k, v) => kv.set(k, v) } };
const call = (path, o = {}, auth = true) => worker.fetch(new Request('https://x.test' + path, { ...o, headers: { ...(auth ? { authorization: 'Bearer k' } : {}), 'content-type': 'application/json' } }), env);
assert.equal((await call('/api/admin/voice', { method: 'POST', body: '{}' }, false)).status, 401);
await call('/api/admin/voice', { method: 'POST', body: JSON.stringify({ name: 'Sample Writer', topics: ['security'], status: 'listed' }) });
await call('/api/admin/voice', { method: 'POST', body: JSON.stringify({ name: 'Pending One', status: 'pending' }) });
await call('/api/admin/feed', { method: 'POST', body: JSON.stringify({ voice_id: 'sample-writer', kind: 'blog', url: 'https://example.org/feed' }) });
await call('/api/admin/feed', { method: 'POST', body: JSON.stringify({ voice_id: 'sample-writer', kind: 'podcast', url: 'https://example.org/pod' }) });
await call('/api/admin/feed', { method: 'POST', body: JSON.stringify({ voice_id: 'sample-writer', kind: 'youtube', external_id: 'UC123' }) });
await call('/api/admin/feed', { method: 'POST', body: JSON.stringify({ voice_id: 'pending-one', kind: 'blog', url: 'https://example.org/feed2' }) });
const fake = async (url) => new Response(url.includes('pod') ? pod : url.includes('youtube.com') ? yt : blog, { status: 200, headers: { etag: '"e1"' } });
const r = await runIngest(env, fake); assert.equal(r.added, 3);
const list = await (await call('/api/items', {}, false)).json(); assert.equal(list.items.length, 3);
assert.deepEqual((await (await call('/api/items?format=listen', {}, false)).json()).items.map(i => i.format), ['listen']);
assert.equal((await (await call('/api/items?q=explainer', {}, false)).json()).items.length, 1);
const vr = await (await call('/api/voice/sample-writer', {}, false)).json(); assert.equal(vr.feeds.length, 3); assert.ok(!('consent' in vr.voice));
assert.equal((await call('/api/voice/pending-one', {}, false)).status, 404);
assert.match(await (await call('/api/rss?format=read', {}, false)).text(), /<item>/);
// hide persists across re-ingest
await call('/api/admin/item', { method: 'POST', body: JSON.stringify({ id: list.items[0].id, hidden: true }) });
await runIngest(env, fake);
assert.equal((await (await call('/api/items', {}, false)).json()).items.length, 2);
// 304 path keeps items
const r304 = await runIngest(env, async () => new Response(null, { status: 304 })); assert.equal(r304.added, 0);
// submit
assert.equal((await call('/api/submit', { method: 'POST', body: JSON.stringify({ name: 'X' }) }, false)).status, 422);
assert.equal((await call('/api/submit', { method: 'POST', body: JSON.stringify({ name: 'X', email: 'a@b.co', consent_excerpt: true }) }, false)).status, 201);
console.log('all tests passed');
