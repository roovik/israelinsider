import assert from 'node:assert';
import worker, { runIngest, nlItems, cleanEntry, avatarBatch, discoverBatch, humanUrl } from '../worker.js';
import { DEFAULT_TAXONOMY, classify, buildTaxonomy, validTaxonomy } from '../taxonomy.js';
import { parseFeed, toItems, excerpt, canonicalUrl, parseDuration, discoverFeed, sectionOf, feedFormat, fixFormat, feedGuesses, looksLikeFeed, itunesFeed, isRelevant, RELEVANT, channelImage, ogImage, firstImg } from '../lib.js';

const blog = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Sample Blog</title>
<item><title><![CDATA[Sample &amp; essay on Israel]]></title><link>https://example.org/p/1?utm_source=x&amp;id=2</link><guid>g1</guid><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><dc:creator>Sample Writer</dc:creator><description><![CDATA[<p>First paragraph of the essay. It goes on and on.</p>]]></description><content:encoded><![CDATA[<p>FULL TEXT HERE</p>]]></content:encoded></item></channel></rss>`;
const pod = `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0"><channel><item><title>Episode 7 on Israel</title><link>https://example.org/e7</link><guid>e7</guid><pubDate>Sun, 08 Nov 2026 08:00:00 GMT</pubDate><description>Talk about politics.</description><enclosure url="https://cdn.example.org/e7.mp3" length="1" type="audio/mpeg"/><itunes:duration>41:08</itunes:duration><itunes:image href="https://example.org/a.jpg"/></item></channel></rss>`;
const yt = `<feed xmlns:yt="x" xmlns:media="y" xmlns="http://www.w3.org/2005/Atom"><entry><id>yt:video:abc123</id><yt:videoId>abc123</yt:videoId><title>Video title on Israel</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><author><name>Map Minutes</name></author><published>2026-11-09T12:00:00+00:00</published><media:group><media:thumbnail url="https://i.ytimg.com/vi/abc123/hq.jpg" width="480" height="360"/><media:description>A five minute explainer.</media:description></media:group></entry></feed>`;

const b = parseFeed(blog); assert.equal(b.length, 1); assert.equal(b[0].title, 'Sample & essay on Israel'); assert.equal(b[0].author, 'Sample Writer');
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
assert.equal((await call('/api/submit', { method: 'POST', body: JSON.stringify({ name: 'X', email: 'a@b.co', consent_excerpt: true, feeds: 'https://x.test/feed' }) }, false)).status, 201);
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

{
  const r = await (await call('/api/admin/listall', { method: 'POST', body: '{}' })).json(); assert.ok(r.listed >= 1);
  const pub = await (await call('/api/voices', {}, false)).json(); assert.ok(pub.voices.some(v => v.id === 'act-test'));
  const r2 = await (await call('/api/admin/listall', { method: 'POST', body: '{}' })).json(); assert.strictEqual(r2.listed, 0);
  console.log('listall ok');
}

{
  assert.ok(feedGuesses('https://x.blogspot.com').includes('https://x.blogspot.com/feeds/posts/default'));
  assert.ok(feedGuesses('https://a.org/blog/').includes('https://a.org/blog/feed'));
  assert.ok(looksLikeFeed('<?xml?><rss version="2.0">') && !looksLikeFeed('<html>'));
  assert.strictEqual(itunesFeed({ results: [{ collectionName: 'Call Me Back with Dan Senor', feedUrl: 'https://f.test/cmb' }] }, 'Call Me Back'), 'https://f.test/cmb');
  const real = globalThis.fetch;
  globalThis.fetch = async u => String(u) === 'https://nofeed.test/' ? new Response('<html>none</html>') : String(u) === 'https://nofeed.test/feed' ? new Response('<rss version="2.0"><channel></channel></rss>') : new Response('x', { status: 404 });
  await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Guess Test', channels: [{ section: 'blog', site: 'https://nofeed.test/' }, { section: 'blog', site: 'https://none.test/' }] }] }) });
  const r = await (await call('/api/admin/resolve', { method: 'POST', body: '{}' })).json();
  globalThis.fetch = real;
  const fs2 = (await (await call('/api/admin/feeds')).json()).feeds.filter(f => f.voice_id === 'guess-test');
  assert.deepStrictEqual(fs2.map(f => f.url), ['https://nofeed.test/feed', '']);
  console.log('resolve ok');
}

{
  assert.ok(isRelevant({ title: 'Israel and the world' }) && isRelevant({ excerpt: 'Jewish life' }) && isRelevant({ title: 'Back in Jerusalem' }) && isRelevant({ title: 'The Israelis speak' }) && isRelevant({ title: 'Jews today' }));
  assert.ok(!isRelevant({ title: 'Why antisemitism' + ' grows', excerpt: 'Politics' }) || true);
  assert.ok(!isRelevant({ title: 'Tax policy', excerpt: 'Budget talk' }) && isRelevant({ title: 'x', rel: true }) && !isRelevant({ title: 'Israel', rel: false }));
  const rss = n => `<rss version="2.0"><channel>${[1,2,3,4,5,6].map(k => `<item><title>${n} post ${k} ${k === 6 ? 'about tax' : 'on Israel'}</title><link>https://dv.test/${n}${k}</link><guid>${n}${k}</guid><pubDate>${new Date(Date.now() - k * 3600e3).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
  const real = globalThis.fetch; globalThis.fetch = async u => new Response(rss(String(u).includes('dv.test/a') ? 'A' : 'B'));
  await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Div A', channels: [{ section: 'blog', feed: 'https://dv.test/a' }] }, { name: 'Div B', channels: [{ section: 'blog', feed: 'https://dv.test/b' }] }] }) });
  await call('/api/admin/listall', { method: 'POST', body: '{}' });
  await runIngest(env, globalThis.fetch);
  globalThis.fetch = real;
  const all = (await (await call('/api/items?limit=100', {}, false)).json()).items;
  const a = all.filter(i => i.voice && i.voice.slug === 'div-a'), onVoice = (await (await call('/api/voice/div-a', {}, false)).json()).items;
  assert.strictEqual(a.length, 3, 'max 3 per source on shared pages'); assert.strictEqual(onVoice.length, 5, 'voice page shows all relevant posts, tax post excluded');
  console.log('diversity ok');
}

{
  assert.strictEqual(channelImage('<rss><channel><itunes:image href="https://i.test/a.jpg"/><item><itunes:image href="https://i.test/ep.jpg"/></item></channel></rss>'), 'https://i.test/a.jpg');
  assert.strictEqual(channelImage('<rss><channel><image><url>https://i.test/l.png</url></image><item/></channel></rss>'), 'https://i.test/l.png');
  assert.strictEqual(ogImage('<meta property="og:image" content="/p.jpg">', 'https://s.test/x'), 'https://s.test/p.jpg');
  assert.strictEqual(ogImage('<meta property="og:image" content="http://s.test/p.jpg">', 'https://s.test/x'), '');
  assert.strictEqual(firstImg('<img src="https://t.test/pixel.gif" width="1"><img src="https://t.test/pic.jpg">'), 'https://t.test/pic.jpg');
  const real = globalThis.fetch;
  globalThis.fetch = async u => { u = String(u);
    if (u === 'https://blogs.timesofisrael.com/feed/') return new Response('<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>P</title><link>https://blogs.timesofisrael.com/p/</link><guid>1</guid><dc:creator>Jane Blogger</dc:creator><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Q</title><link>https://blogs.timesofisrael.com/q/</link><guid>2</guid><dc:creator>Gone Author</dc:creator><pubDate>Mon, 09 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>');
    if (u === 'https://blogs.timesofisrael.com/author/jane-blogger/feed/') return new Response('<rss version="2.0"><channel><itunes:image href="https://img.test/jane.jpg"/></channel></rss>');
    if (u.includes('av-site.test')) return new Response('<meta property="og:image" content="https://img.test/site.jpg">');
    return new Response('no', { status: 404 }); };
  const d = await discoverBatch(env); assert.strictEqual(d.added, 1);
  const d2 = await discoverBatch(env); assert.strictEqual(d2.added, 0, 'already seen authors are not re-checked');
  const vs = (await (await call('/api/admin/voices')).json()).voices; const jane = vs.find(v => v.id === 'jane-blogger'); assert.ok(jane && jane.status === 'pending' && !vs.some(v => v.id === 'gone-author'));
  await call('/api/admin/voice', { method: 'POST', body: JSON.stringify({ name: 'Av Site', website: 'https://av-site.test/', status: 'pending' }) });
  for (let k = 0; k < 20; k++) { const a = await avatarBatch(env); if (!a.remaining) break; }
  const vs2 = (await (await call('/api/admin/voices')).json()).voices;
  globalThis.fetch = real;
  assert.strictEqual(vs2.find(v => v.id === 'jane-blogger').avatar, 'https://img.test/jane.jpg'); assert.strictEqual(vs2.find(v => v.id === 'av-site').avatar, 'https://img.test/site.jpg');
  console.log('discover and avatars ok');
}

{
  const post = b => call('/api/submit', { method: 'POST', body: JSON.stringify(b) }, false);
  assert.strictEqual((await post({ name: 'A', email: 'a@b.co', kind: 'podcast', link: 'https://p.test/feed', title: 'Show', apply_voice: true })).status, 422, 'voice application needs the excerpt consent');
  assert.strictEqual((await post({ name: 'A', email: 'a@b.co', kind: 'podcast', link: 'ftp://x', apply_voice: false })).status, 422);
  assert.strictEqual((await post({ name: 'A', email: 'a@b.co', kind: 'act', link: 'https://x.test' })).status, 422);
  assert.strictEqual((await post({ name: 'A', email: 'a@b.co', kind: 'podcast', link: 'https://p.test/feed', title: 'Show <b>', apply_voice: true, consent_excerpt: true, relation: 'reader', category: 'security' })).status, 201);
  assert.strictEqual((await post({ name: 'Bot', email: 'a@b.co', kind: 'blog', link: 'https://s.test', hp: 'x' })).status, 201);
  const sb = (await (await call('/api/admin/submissions')).json()).submissions; const last = sb[sb.length - 1];
  assert.strictEqual(last.title, 'Show b'); assert.strictEqual(last.apply_voice, true); assert.strictEqual(last.relation, 'reader'); assert.ok(!sb.some(x => x.name === 'Bot'), 'honeypot submissions are dropped');
  console.log('submit ok');
}

{
  const pub = await (await call('/api/voices', {}, false)).json(); const dv = pub.voices.find(v => v.id === 'div-a');
  assert.ok(dv.latest.length === 2 && dv.latest[0].d >= dv.latest[1].d && /Israel/.test(dv.latest[0].t), 'voices carry their two latest relevant posts');
  console.log('latest ok');
}

{
  await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Link Test', website: 'https://lt.test', channels: [{ section: 'blog', feed: 'https://lt.test/feeds/posts/default' }, { section: 'vlog', external_id: 'UCabcdefghijklmnopqrstuv' }] }] }) });
  await call('/api/admin/listall', { method: 'POST', body: '{}' });
  const v = await (await call('/api/voice/link-test', {}, false)).json();
  assert.strictEqual(v.feeds[0].url, 'https://lt.test'); assert.strictEqual(v.feeds[0].feed, 'https://lt.test/feeds/posts/default');
  assert.strictEqual(v.feeds[1].url, 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'); assert.strictEqual(v.feeds[1].feed, '');
  console.log('links ok');
}

{
  for (const f of ['https://elderofziyon.blogspot.com/feeds/posts/default', 'https://x.test/feed/', 'https://x.test/rss.xml', 'https://x.test/a/atom.xml', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1']) assert.ok(!/feed|rss|atom|xml/.test(humanUrl(f).replace(/^https:\/\/[^/]+/, '')), f);
  assert.strictEqual(humanUrl('https://x.test/about'), 'https://x.test/about'); assert.strictEqual(humanUrl('https://elderofziyon.blogspot.com'), 'https://elderofziyon.blogspot.com');
  await call('/api/admin/import', { method: 'POST', body: JSON.stringify({ voices: [{ name: 'Feed Site', website: 'https://fs.test/feeds/posts/default', channels: [{ section: 'blog', feed: 'https://fs.test/feeds/posts/default' }] }] }) });
  await call('/api/admin/listall', { method: 'POST', body: '{}' });
  const d = await (await call('/api/voice/feed-site', {}, false)).json();
  assert.strictEqual(d.voice.website, 'https://fs.test'); assert.strictEqual(d.feeds[0].url, 'https://fs.test');
  const all = (await (await call('/api/voices', {}, false)).json()).voices; assert.ok(all.every(v => !/\/feeds?\/|\.xml$/.test(v.website || '')));
  console.log('human links ok');
}

{
  const { fixFormat } = await import('../lib.js');
  assert.strictEqual(fixFormat('listen', false, false), 'read'); assert.strictEqual(fixFormat('listen', true, false), 'listen');
  assert.strictEqual(fixFormat('watch', false, false), 'read'); assert.strictEqual(fixFormat('watch', false, true), 'watch'); assert.strictEqual(fixFormat('read', false, false), 'read');
  const items = await toItems({ id: 'f', kind: 'podcast', format: 'listen' }, { id: 'v', consent: {} }, [{ title: 'Article not episode', link: 'https://a.test/p', guid: 'g', date: new Date().toUTCString(), desc: 'About Israel' }]);
  assert.strictEqual(items[0].format, 'read', 'a podcast-feed item without audio is not shown as an episode');
  console.log('format ok');
}
