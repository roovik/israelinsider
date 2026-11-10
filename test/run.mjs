import assert from 'node:assert';
import worker, { runIngest, nlItems, cleanEntry } from '../worker.js';
import { DEFAULT_TAXONOMY, classify, buildTaxonomy, validTaxonomy } from '../taxonomy.js';
import { parseFeed, toItems, excerpt, canonicalUrl, parseDuration, discoverFeed, sectionOf, feedFormat } from '../lib.js';

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
assert.equal((await call('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'bad' }) }, false)).status, 422);
assert.equal((await call('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'S@Ex.org', consent: true }) }, false)).status, 201);
assert.equal((await call('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 's@ex.org', consent: true }) }, false)).status, 201);
{ const sl = await (await call('/api/admin/subscribers', {}, true)).json(); assert.equal(sl.subscribers.length, 1); }
console.log('all tests passed');

{ const o = nlItems([{ t: 'A', u: 'https://x.org/a', src: 'S', d: '2026-11-09T10:00:00Z' }, { t: 'B', k: 'k1', s: 'src', d: '2026-11-10T10:00:00Z' }, { t: 'no date', u: 'https://x.org/c' }, { t: 'bad', u: 'javascript:1', d: '2026-11-10T10:00:00Z' }]); assert.equal(o.length, 2); assert.equal(o[0].t, 'B'); assert.match(o[0].u, /^https:\/\/israelnowlej.com\/news\/item\/k1\//); }
console.log('nowlej ok');

{
  assert.ok(cleanEntry({ type: 'act', kind: 'event', title: 'T', url: 'https://x.org/e', date: '2999-01-01' }).rec);
  assert.ok(cleanEntry({ type: 'act', kind: 'event', title: 'T', url: 'http://x.org/e' }).error);
  assert.ok(cleanEntry({ type: 'monitor', kind: 'factcheck', title: 'T', url: 'https://x.org/e' }).error);
  assert.ok(cleanEntry({ type: 'monitor', kind: 'petition', title: 'T', url: 'https://x.org/e', date: '2026-01-01' }).error);
  const ok = { type: 'monitor', kind: 'factcheck', title: 'Claim X checked', url: 'https://x.org/s', date: '2026-11-01', email: 'a@b.co', consent: true };
  assert.equal((await call('/api/propose', { method: 'POST', body: JSON.stringify(ok) }, false)).status, 422);
  assert.equal((await call('/api/propose', { method: 'POST', body: JSON.stringify({ ...ok, scope_ok: true }) }, false)).status, 201);
  assert.equal((await (await call('/api/admin/proposals', {}, true)).json()).proposals.length, 1);
  const mk = b => call('/api/admin/entry', { method: 'POST', body: JSON.stringify(b) }, true);
  assert.equal((await mk({ type: 'act', kind: 'event', title: 'Future rally', url: 'https://x.org/f', date: '2999-05-01' })).status, 200);
  assert.equal((await mk({ type: 'act', kind: 'event', title: 'Old rally', url: 'https://x.org/o', date: '2000-05-01' })).status, 200);
  assert.equal((await mk({ type: 'act', kind: 'petition', title: 'Sign this', url: 'https://x.org/p' })).status, 200);
  const en = (await (await call('/api/entries?type=act', {}, false)).json()).entries; assert.deepEqual(en.map(e => e.title).sort(), ['Future rally', 'Sign this']);
  assert.equal((await (await call('/api/entries?type=monitor', {}, false)).json()).entries.length, 0);
}
console.log('entries ok');

{
  const c1 = classify({ title: 'IDF reservists return as Hezbollah threat grows', excerpt: 'A note on Lebanon and the army.' }, { topics: ['Security'] }, DEFAULT_TAXONOMY);
  assert.ok(c1.cats.includes('security') && c1.subs.includes('idf') && c1.subs.includes('terrorism') && c1.tags.includes('hezbollah'));
  const c2 = classify({ title: 'Startup funding in Tel Aviv', excerpt: '' }, { topics: ['culture'] }, DEFAULT_TAXONOMY);
  assert.ok(c2.cats.includes('business') && c2.cats.includes('culture'));
  const none = classify({ title: 'Plain title', excerpt: 'Nothing special' }, { topics: [] }, DEFAULT_TAXONOMY); assert.equal(none.cats.length, 0);
  const T = buildTaxonomy(DEFAULT_TAXONOMY, [{ ...c1 }, { ...c1 }, { ...c2 }]);
  assert.equal(T.cats.find(c => c.slug === 'security').count, 2);
  assert.ok(T.cats.find(c => c.slug === 'security').related_tags.includes('hezbollah'));
  assert.ok(T.tags.find(t => t.slug === 'hezbollah').count === 2);
  assert.equal(validTaxonomy(DEFAULT_TAXONOMY), '');
  assert.ok(validTaxonomy({ cats: [{ slug: 'a', name: 'A', subs: [{ slug: 'a', name: 'A2' }] }] }));
  assert.equal((await call('/api/contact', { method: 'POST', body: JSON.stringify({ message: 'hi' }) }, false)).status, 422);
  assert.equal((await call('/api/contact', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', message: 'hi', topic: 'Correction' }) }, false)).status, 201);
  assert.equal((await (await call('/api/admin/messages', {}, true)).json()).messages[0].topic, 'Correction');
  assert.equal((await call('/api/taxonomy', {}, false)).status, 200);
  assert.equal((await call('/api/admin/taxonomy', { method: 'POST', body: JSON.stringify({ taxonomy: { cats: [] } }) }, true)).status, 422);
}
console.log('taxonomy ok');

// ---- voices batch import, sections, feed discovery, welcome name
{
  assert.deepStrictEqual(discoverFeed('<html><link rel="alternate" type="application/rss+xml" href="/feed.xml"></html>', 'https://a.test/x'), { url: 'https://a.test/feed.xml' });
  assert.deepStrictEqual(discoverFeed('x "channelId":"UCabcdefghijklmnopqrstuv" y', 'https://youtube.com/@a'), { external_id: 'UCabcdefghijklmnopqrstuv' });
  assert.strictEqual(discoverFeed('<html></html>', 'https://a.test'), null);
  assert.strictEqual(sectionOf({ kind: 'newsletter' }), 'substack'); assert.strictEqual(sectionOf({ kind: 'blog', section: 'oped' }), 'oped');
  assert.strictEqual(feedFormat('vlog'), 'watch'); assert.strictEqual(feedFormat('oped'), 'read');
  const imp = await (await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Test Writer', short_bio: 'Bio', topics: ['politics'], channels: [{ section: 'oped', site: 'https://w.test/o' }, { section: 'vlog', site: 'https://www.youtube.com/@t' }] }] }) })).json();
  assert.strictEqual(imp.voices_added, 1); assert.strictEqual(imp.feeds_added, 2);
  const imp2 = await (await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Test Writer', channels: [{ section: 'oped', site: 'https://w.test/o' }] }] }) })).json();
  assert.strictEqual(imp2.voices_added, 0); assert.strictEqual(imp2.feeds_added, 0);
  let pub = await (await call('/api/voices', {}, false)).json(); assert.ok(!pub.voices.some(v => v.id === 'test-writer'), 'pending voices stay private');
  await call('/api/admin/voice', { method: 'POST', body: JSON.stringify({ name: 'Test Writer', status: 'listed' }) });
  pub = await (await call('/api/voices', {}, false)).json(); const tw = pub.voices.find(v => v.id === 'test-writer'); assert.deepStrictEqual(tw.sections, ['oped', 'vlog']);
  const sub = await (await call('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'dana@example.com', name: ' Dana <b> ', consent: true }) }, false)).json();
  assert.strictEqual(sub.name, 'Dana b'); assert.strictEqual(sub.returning, false);
  const sub2 = await (await call('/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'dana@example.com', consent: true }) }, false)).json(); assert.strictEqual(sub2.returning, true); assert.strictEqual(sub2.name, 'Dana b');
  assert.strictEqual(nlItems([{ t: 'A', u: 'https://x.org/a', d: '2026-11-09T10:00:00Z', i: 'https://img.org/a.jpg' }, { t: 'B', u: 'https://x.org/b', d: '2026-11-08T10:00:00Z', i: 'javascript:alert(1)' }])[1].i, '');
  console.log('batch ok');
}

// ---- activity check
{
  const rssOf = d => `<rss version="2.0"><channel><item><title>T</title><link>https://a.test/1</link><guid>g1</guid><pubDate>${new Date(d).toUTCString()}</pubDate></item></channel></rss>`;
  const real = globalThis.fetch;
  globalThis.fetch = async u => String(u).includes('fresh') ? new Response(rssOf(Date.now() - 5 * 86400e3)) : String(u).includes('old') ? new Response(rssOf(Date.now() - 400 * 86400e3)) : new Response('no', { status: 404 });
  const put = body => call('/api/admin/import', { method: 'POST', body: JSON.stringify(body) });
  await put({ voices: [{ name: 'Act Test', channels: [{ section: 'blog', feed: 'https://fresh.test/f' }, { section: 'oped', feed: 'https://old.test/f' }, { section: 'podcast', feed: 'https://gone.test/f' }, { section: 'vlog', site: 'https://yt.test/@x' }] }] });
  const r = await (await call('/api/admin/check', { method: 'POST', body: '{}' })).json();
  globalThis.fetch = real;
  const fs = (await (await call('/api/admin/feeds')).json()).feeds.filter(f => f.voice_id === 'act-test');
  assert.deepStrictEqual(fs.map(f => f.activity), ['active', 'stale', 'error', undefined]);
  assert.ok(fs.every(f => !f.etag), 'check must not leave etags behind');
  console.log('check ok');
}
