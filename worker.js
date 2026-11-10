// Israel Insider Worker: feed ingestion, JSON API, RSS output. Storage is KV (binding STORE).
import { parseFeed, toItems, feedFormat, youtubeFeedUrl, toRss } from './lib.js';

const J = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120', 'access-control-allow-origin': '*', ...extra } });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const MAX_ITEMS = 1500;

async function getJson(env, key, dflt) { const v = await env.STORE.get(key, 'json'); return v ?? dflt; }
const putJson = (env, key, v) => env.STORE.put(key, JSON.stringify(v));

async function listVoices(env) { return getJson(env, 'voices', []); }
async function listFeeds(env) { return getJson(env, 'feeds', []); }

export async function ingestFeed(env, feed, voice, fetcher = fetch) {
  const headers = { 'user-agent': 'IsraelInsiderBot/1.0 (+https://israelinsider.org/bot)', accept: 'application/rss+xml, application/atom+xml, text/xml, */*' };
  if (feed.etag) headers['if-none-match'] = feed.etag;
  if (feed.last_modified) headers['if-modified-since'] = feed.last_modified;
  const url = feed.kind === 'youtube' && feed.external_id && !feed.url ? youtubeFeedUrl(feed.external_id) : feed.url;
  const res = await fetcher(url, { headers });
  feed.last_checked = new Date().toISOString();
  if (res.status === 304) { feed.error_count = 0; return []; }
  if (!res.ok) { feed.error_count = (feed.error_count || 0) + 1; feed.status = feed.error_count >= 7 * 24 ? 'failing' : feed.status; return []; }
  feed.etag = res.headers.get('etag') || ''; feed.last_modified = res.headers.get('last-modified') || '';
  const raw = parseFeed(await res.text()).slice(0, feed.backfilled ? 30 : 20);
  feed.backfilled = true; feed.error_count = 0;
  const items = await toItems(feed, voice, raw);
  if (items.length) feed.last_item_at = items.map(i => i.published_at).sort().pop();
  return items;
}

export async function runIngest(env, fetcher = fetch) {
  const voices = (await listVoices(env)).filter(v => v.status === 'listed');
  const feeds = await listFeeds(env);
  const byId = Object.fromEntries(voices.map(v => [v.id, v]));
  const existing = await getJson(env, 'items', []);
  const seen = new Map(existing.map(i => [i.id, i]));
  let added = 0;
  for (const f of feeds) {
    const v = byId[f.voice_id];
    if (!v || f.status === 'paused' || f.kind === 'x') continue; // X handled by embeds and a separate job
    try {
      for (const it of await ingestFeed(env, f, v, fetcher)) {
        const old = seen.get(it.id);
        if (old) { it.hidden = old.hidden; it.featured = old.featured; } else added++;
        seen.set(it.id, it);
      }
    } catch (e) { f.error_count = (f.error_count || 0) + 1; }
  }
  const all = [...seen.values()].sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, MAX_ITEMS);
  await putJson(env, 'items', all);
  await putJson(env, 'feeds', feeds);
  return { added, total: all.length };
}

function filter(items, q, voicesById) {
  let out = items.filter(i => !i.hidden && voicesById[i.voice_id]?.status === 'listed');
  if (q.get('format')) out = out.filter(i => i.format === q.get('format'));
  if (q.get('voice')) out = out.filter(i => voicesById[i.voice_id]?.slug === q.get('voice'));
  if (q.get('topic')) out = out.filter(i => (i.topics || []).includes(q.get('topic')));
  if (q.get('q')) { const k = q.get('q').toLowerCase(); out = out.filter(i => (i.title + ' ' + i.excerpt).toLowerCase().includes(k)); }
  const limit = Math.min(+q.get('limit') || 30, 100), offset = +q.get('offset') || 0;
  return out.slice(offset, offset + limit);
}
const publicItem = (i, v) => ({ ...i, full_text: undefined, voice: v ? { slug: v.slug, name: v.name, avatar: v.avatar } : null });

function admin(req, env) { return env.ADMIN_KEY && req.headers.get('authorization') === `Bearer ${env.ADMIN_KEY}`; }

export function nlItems(list) {
  return (list || []).filter(i => i && i.t && (i.u || i.k) && i.d).map(i => ({ t: String(i.t).slice(0, 200), u: i.k ? 'https://israelnowlej.com/news/item/' + i.k + '/?s=' + encodeURIComponent(i.s || '') + (i.ch ? '&c=' + encodeURIComponent(i.ch) : '') : i.u, src: String(i.src || ''), d: i.d }))
    .filter(i => /^https?:\/\//.test(i.u)).sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 8);
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url); const p = u.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' } });
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    const voices = await listVoices(env); const vb = Object.fromEntries(voices.map(v => [v.id, v]));

    if (p === '/api/items') { const items = filter(await getJson(env, 'items', []), u.searchParams, vb); return J({ items: items.map(i => publicItem(i, vb[i.voice_id])) }); }
    if (p === '/api/voices') return J({ voices: voices.filter(v => v.status === 'listed').map(({ consent, ...v }) => v) });
    if (p.startsWith('/api/voice/')) {
      const v = voices.find(x => x.slug === p.slice(11) && x.status === 'listed'); if (!v) return J({ error: 'not found' }, 404);
      const feeds = (await listFeeds(env)).filter(f => f.voice_id === v.id).map(f => ({ kind: f.kind, url: f.url, format: f.format }));
      const items = filter(await getJson(env, 'items', []), new URLSearchParams({ voice: v.slug, limit: '60' }), vb);
      const { consent, ...pub } = v; return J({ voice: pub, feeds, items: items.map(i => publicItem(i, v)) });
    }
    if (p === '/api/rss') {
      const items = filter(await getJson(env, 'items', []), u.searchParams, vb);
      return new Response(toRss(items, 'Israel Insider ' + (u.searchParams.get('format') || 'all'), u.origin), { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (p === '/api/submit' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      if (!b.name || !/^\S+@\S+\.\S+$/.test(b.email || '') || !b.consent_excerpt) return J({ error: 'name, valid email and excerpt consent are required' }, 422);
      const s = await getJson(env, 'submissions', []);
      if (s.length > 500) return J({ error: 'queue full' }, 429);
      s.push({ id: crypto.randomUUID(), at: new Date().toISOString(), name: String(b.name).slice(0, 120), email: String(b.email).slice(0, 200), website: String(b.website || '').slice(0, 300), feeds: String(b.feeds || '').slice(0, 2000), social: String(b.social || '').slice(0, 300), formats: String(b.formats || '').slice(0, 100), bio: String(b.bio || '').slice(0, 500), topics: String(b.topics || '').slice(0, 200), consent_full_text: !!b.consent_full_text });
      await putJson(env, 'submissions', s); return J({ ok: true }, 201, { 'cache-control': 'no-store' });
    }
    if (p === '/api/nowlej') {
      const get = async path => { try { const r = await fetch('https://israelnowlej.com' + path, { headers: { 'user-agent': 'IsraelInsider/1.0' }, cf: { cacheTtl: 600, cacheEverything: true } }); if (!r.ok) return []; return nlItems((await r.json()).items); } catch { return []; } };
      const [news, views] = await Promise.all([get('/api/news?v=2'), get('/api/news?views=1&v=2')]);
      return J({ news, views }, 200, { 'cache-control': 'public, max-age=600' });
    }
    if (p === '/api/subscribe' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      const em = String(b.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(em) || em.length > 200 || !b.consent) return J({ error: 'A valid email and your consent are required' }, 422);
      const s = await getJson(env, 'subscribers', []);
      if (s.length > 20000) return J({ error: 'list full' }, 429);
      if (!s.some(x => x.email === em)) { s.push({ email: em, at: new Date().toISOString() }); await putJson(env, 'subscribers', s); }
      return J({ ok: true }, 201, { 'cache-control': 'no-store' });
    }
    // Admin routes
    if (p.startsWith('/api/admin/')) {
      if (!admin(req, env)) return J({ error: 'unauthorized' }, 401, { 'cache-control': 'no-store' });
      if (p === '/api/admin/voices') return J({ voices }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/feeds') return J({ feeds: await listFeeds(env) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/items') { const it = await getJson(env, 'items', []); return J({ items: it.slice(0, 200), total: it.length }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/feed/delete' && req.method === 'POST') { const b = await req.json(); const feeds = (await listFeeds(env)).filter(f => f.id !== b.id); await putJson(env, 'feeds', feeds); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/voice/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'voices', voices.filter(v => v.id !== b.id)); await putJson(env, 'feeds', (await listFeeds(env)).filter(f => f.voice_id !== b.id)); await putJson(env, 'items', (await getJson(env, 'items', [])).filter(i => i.voice_id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/submission/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'submissions', (await getJson(env, 'submissions', [])).filter(x => x.id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/subscribers') return J({ subscribers: await getJson(env, 'subscribers', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/submissions') return J({ submissions: await getJson(env, 'submissions', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/voice' && req.method === 'POST') {
        const b = await req.json(); const id = b.id || slug(b.name); const i = voices.findIndex(v => v.id === id);
        const rec = { id, slug: slug(b.slug || b.name), name: b.name, short_bio: b.short_bio || '', avatar: b.avatar || '', website: b.website || '', topics: b.topics || [], position_tag: b.position_tag || '', status: b.status || 'pending', listed_on: b.status === 'listed' ? (voices[i]?.listed_on || new Date().toISOString().slice(0, 10)) : '', consent: { excerpt_ok: b.consent?.excerpt_ok !== false, full_text_ok: b.consent?.full_text_ok === true, date: b.consent?.date || '', note: b.consent?.note || '' } };
        if (i >= 0) voices[i] = { ...voices[i], ...rec }; else voices.push(rec);
        await putJson(env, 'voices', voices); return J({ ok: true, voice: rec }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/feed' && req.method === 'POST') {
        const b = await req.json(); const feeds = await listFeeds(env);
        const f = { id: b.id || slug(b.voice_id + '-' + b.kind + '-' + (b.external_id || b.url || '').slice(-12)), voice_id: b.voice_id, kind: b.kind, url: b.url || '', external_id: b.external_id || '', format: feedFormat(b.kind), status: 'active', error_count: 0 };
        const i = feeds.findIndex(x => x.id === f.id); if (i >= 0) feeds[i] = { ...feeds[i], ...f }; else feeds.push(f);
        await putJson(env, 'feeds', feeds); return J({ ok: true, feed: f }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/item' && req.method === 'POST') {
        const b = await req.json(); const items = await getJson(env, 'items', []); const it = items.find(x => x.id === b.id);
        if (!it) return J({ error: 'not found' }, 404); if (typeof b.hidden === 'boolean') it.hidden = b.hidden; if (typeof b.featured === 'boolean') it.featured = b.featured;
        await putJson(env, 'items', items); return J({ ok: true }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/ingest' && req.method === 'POST') return J(await runIngest(env), 200, { 'cache-control': 'no-store' });
    }
    return J({ error: 'not found' }, 404);
  },
  async scheduled(_evt, env, ctx) { ctx.waitUntil(runIngest(env)); },
};
