// Israel Insider Worker: feed ingestion, JSON API, RSS output. Storage is KV (binding STORE).
import { parseFeed, toItems, feedFormat, youtubeFeedUrl, toRss, sectionOf, discoverFeed, SECTIONS, looksLikeFeed, feedGuesses, itunesFeed, isRelevant, channelImage, ogImage } from './lib.js';
import { DEFAULT_TAXONOMY, classify, buildTaxonomy, validTaxonomy } from './taxonomy.js';

const J = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120', 'access-control-allow-origin': '*', ...extra } });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const MAX_ITEMS = 1500;

async function getJson(env, key, dflt) { const v = await env.STORE.get(key, 'json'); return v ?? dflt; }
const putJson = (env, key, v) => env.STORE.put(key, JSON.stringify(v));

async function getTax(env) { return (await getJson(env, 'taxonomy', null)) || DEFAULT_TAXONOMY; }
async function itemsC(env, vb) { const [items, tax] = await Promise.all([getJson(env, 'items', []), getTax(env)]); return items.map(i => ({ ...i, ...classify(i, vb[i.voice_id], tax) })); }

async function listVoices(env) { return getJson(env, 'voices', []); }
async function listFeeds(env) { return getJson(env, 'feeds', []); }

export async function ingestFeed(env, feed, voice, fetcher = fetch) {
  const headers = { 'user-agent': 'IsraelInsiderBot/1.0 (+https://israelinsider.org/bot)', accept: 'application/rss+xml, application/atom+xml, text/xml, */*' };
  if (feed.etag) headers['if-none-match'] = feed.etag;
  if (feed.last_modified) headers['if-modified-since'] = feed.last_modified;
  const url = (feed.kind === 'youtube' || feed.kind === 'vlog') && feed.external_id && !feed.url ? youtubeFeedUrl(feed.external_id) : feed.url;
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
    if (!v || f.status === 'paused' || f.kind === 'x' || (!f.url && !f.external_id)) continue; // X handled by embeds and a separate job
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

const PER_VOICE = 3;
function filter(items, q, voicesById) {
  let out = items.filter(i => !i.hidden && voicesById[i.voice_id]?.status === 'listed' && isRelevant(i)).sort((a, b) => b.published_at.localeCompare(a.published_at));
  if (!q.get('voice')) { const n = {}; out = out.filter(i => (n[i.voice_id] = (n[i.voice_id] || 0) + 1) <= PER_VOICE); } // diversity: newest 3 per source, except on a voice's own page
  if (q.get('format')) out = out.filter(i => i.format === q.get('format'));
  if (q.get('section')) out = out.filter(i => i.section === q.get('section'));
  if (q.get('voice')) out = out.filter(i => voicesById[i.voice_id]?.slug === q.get('voice'));
  if (q.get('cat')) out = out.filter(i => (i.cats || []).includes(q.get('cat')) || (i.subs || []).includes(q.get('cat')));
  if (q.get('tag')) out = out.filter(i => (i.tags || []).includes(q.get('tag')));
  if (q.get('topic')) out = out.filter(i => (i.topics || []).includes(q.get('topic')));
  if (q.get('q')) { const k = q.get('q').toLowerCase(); out = out.filter(i => (i.title + ' ' + i.excerpt).toLowerCase().includes(k)); }
  const limit = Math.min(+q.get('limit') || 30, 100), offset = +q.get('offset') || 0;
  return out.slice(offset, offset + limit);
}
const publicItem = (i, v) => ({ ...i, full_text: undefined, voice: v ? { slug: v.slug, name: v.name, avatar: v.avatar } : null });

function admin(req, env) { return env.ADMIN_KEY && req.headers.get('authorization') === `Bearer ${env.ADMIN_KEY}`; }

const ACT_KINDS = ['petition', 'event', 'donate', 'campus', 'volunteer'], MON_KINDS = ['factcheck', 'correction', 'tracker'];
export function cleanEntry(b) {
  const type = b.type === 'monitor' ? 'monitor' : b.type === 'act' ? 'act' : '';
  if (!type) return { error: 'type must be act or monitor' };
  const kind = String(b.kind || ''); if (!(type === 'act' ? ACT_KINDS : MON_KINDS).includes(kind)) return { error: 'unknown kind for ' + type };
  const title = String(b.title || '').trim().slice(0, 200); if (!title) return { error: 'title is required' };
  const url = String(b.url || '').trim(); if (!/^https:\/\/\S+$/i.test(url) || url.length > 500) return { error: 'a https link is required' };
  const date = String(b.date || '').trim(); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };
  if (type === 'monitor' && !date) return { error: 'monitor entries need the date of the source' };
  return { rec: { type, kind, title, url, org: String(b.org || '').trim().slice(0, 120), summary: String(b.summary || '').trim().slice(0, 300), date, location: String(b.location || '').trim().slice(0, 120), topics: (Array.isArray(b.topics) ? b.topics : String(b.topics || '').split(',')).map(s => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 6) } };
}
export function nlItems(list) {
  return (list || []).filter(i => i && i.t && (i.u || i.k) && i.d).map(i => ({ t: String(i.t).slice(0, 200), u: i.k ? 'https://israelnowlej.com/news/item/' + i.k + '/?s=' + encodeURIComponent(i.s || '') + (i.ch ? '&c=' + encodeURIComponent(i.ch) : '') : i.u, src: String(i.src || ''), d: i.d, i: /^https:\/\//.test(i.i || '') ? String(i.i).slice(0, 500) : '' }))
    .filter(i => /^https?:\/\//.test(i.u)).sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 8);
}

const BOT = { 'user-agent': 'Mozilla/5.0 (compatible; IsraelInsiderBot/1.0; +https://israelinsider.org/bot)', cookie: 'CONSENT=YES+1', 'accept-language': 'en' };
const getOk = async u => { try { const r = await fetch(u, { headers: BOT, redirect: 'follow' }); return r.ok ? r : null; } catch { return null; } };
// Small batches keep one request under the subrequest limit. Each feed is tried once unless retry is set.
export async function resolveBatch(env, retry) {
  const voices = await listVoices(env), feeds = await listFeeds(env), names = Object.fromEntries(voices.map(v => [v.id, v.name]));
  if (retry) for (const f of feeds) if (!f.url && !f.external_id) delete f.resolved_at;
  let found = 0; const missed = [];
  const todo = feeds.filter(f => !f.url && !f.external_id && f.site && !f.resolved_at);
  for (const f of todo.slice(0, 6)) {
    f.resolved_at = new Date().toISOString(); let d = null;
    const pg = await getOk(f.site); if (pg) d = discoverFeed(await pg.text(), f.site);
    if (!d && !/youtube\.com/.test(f.site)) for (const g of feedGuesses(f.site).slice(0, 4)) { const r = await getOk(g); if (r && looksLikeFeed(await r.text())) { d = { url: g }; break; } }
    if (!d && (f.section === 'podcast' || f.kind === 'podcast')) { const r = await getOk('https://itunes.apple.com/search?media=podcast&limit=5&term=' + encodeURIComponent(names[f.voice_id] || '')); if (r) { const u2 = itunesFeed(await r.json().catch(() => null), names[f.voice_id] || ''); if (u2) d = { url: u2 }; } }
    if (d) { Object.assign(f, d); found++; } else missed.push(f.id);
  }
  await putJson(env, 'feeds', feeds); return { found, missed, remaining: Math.max(0, todo.length - 6) };
}
// Photos: feed artwork first, then the page's social image (a YouTube channel page gives the channel picture).
export async function avatarBatch(env) {
  const voices = await listVoices(env), feeds = await listFeeds(env);
  const todo = voices.filter(v => !v.avatar && !v.avatar_tried); let got = 0;
  for (const v of todo.slice(0, 8)) {
    v.avatar_tried = new Date().toISOString(); let img = '';
    for (const f of feeds.filter(x => x.voice_id === v.id && x.url && x.kind !== 'youtube' && x.kind !== 'vlog').slice(0, 1)) { const r = await getOk(f.url); if (r) img = channelImage(await r.text()); }
    if (!img) { const page = v.website || (feeds.find(x => x.voice_id === v.id && x.site) || {}).site; if (page) { const r = await getOk(page); if (r) img = ogImage(await r.text(), page); } }
    if (img) { v.avatar = img; got++; }
  }
  await putJson(env, 'voices', voices); return { found: got, remaining: Math.max(0, todo.length - 8) };
}
const PLATFORMS = [
  { id: 'toi', label: 'The Times of Israel blogs', feeds: ['https://blogs.timesofisrael.com/feed/', 'https://blogs.timesofisrael.com/feed/?paged=2', 'https://blogs.timesofisrael.com/feed/?paged=3'], author: s => `https://blogs.timesofisrael.com/author/${s}/`, bio: 'Blogger on The Times of Israel platform.' },
  { id: 'jj', label: 'Jewish Journal', feeds: ['https://jewishjournal.com/category/blogs/feed/', 'https://jewishjournal.com/feed/'], author: s => `https://jewishjournal.com/author/${s}/`, bio: 'Writer at the Jewish Journal.', firstOnly: true },
];
// Finds new blogger candidates on the big blog platforms. They arrive PENDING for an editor to list.
export async function discoverBatch(env) {
  const voices = await listVoices(env), feeds = await listFeeds(env), seen = new Set(await getJson(env, 'discovered', []));
  const have = new Set(voices.map(v => v.id)); let added = 0, checked = 0, remaining = 0;
  for (const P of PLATFORMS) {
    const authors = new Map();
    for (const fu of P.feeds) {
      const r = await getOk(fu); if (!r) { if (P.firstOnly && authors.size === 0) continue; else if (P.firstOnly) break; continue; }
      const raw = parseFeed(await r.text());
      for (const it of raw) { const nm = String(it.author || '').trim(); if (nm && nm.length < 60 && /\s/.test(nm) && !authors.has(slug(nm))) authors.set(slug(nm), nm); }
      if (P.firstOnly && authors.size) break;
    }
    for (const [sl, nm] of authors) {
      const key = P.id + ':' + sl; if (seen.has(key)) continue;
      if (checked >= 12) { remaining++; continue; }
      checked++; seen.add(key);
      if (have.has(sl)) continue;
      const fe = P.author(sl) + 'feed/', r = await getOk(fe);
      if (!r || !looksLikeFeed(await r.text())) continue;
      voices.push({ id: sl, slug: sl, name: nm, short_bio: P.bio, avatar: '', website: P.author(sl), topics: [], position_tag: '', status: 'pending', listed_on: '', consent: { excerpt_ok: true, full_text_ok: false, date: '', note: 'Found on ' + P.label + '. Not reviewed yet.' } });
      feeds.push({ id: slug(sl + '-blog-' + fe.slice(-14)), voice_id: sl, kind: 'blog', section: 'blog', url: fe, external_id: '', site: P.author(sl), format: 'read', status: 'active', error_count: 0, unverified: true }); have.add(sl); added++;
    }
  }
  await putJson(env, 'voices', voices); await putJson(env, 'feeds', feeds); await putJson(env, 'discovered', [...seen].slice(-5000));
  return { added, checked, remaining };
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url); const p = u.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' } });
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    const voices = await listVoices(env); const vb = Object.fromEntries(voices.map(v => [v.id, v]));

    if (p === '/api/items') { const items = filter(await itemsC(env, vb), u.searchParams, vb); return J({ items: items.map(i => publicItem(i, vb[i.voice_id])) }); }
    if (p === '/api/voices') {
      const fs = await listFeeds(env), sec = {};
      for (const f of fs) { const s = sectionOf(f); if (s) (sec[f.voice_id] = sec[f.voice_id] || new Set()).add(s); }
      return J({ voices: voices.filter(v => v.status === 'listed').map(({ consent, ...v }) => ({ ...v, sections: SECTIONS.filter(s => sec[v.id]?.has(s)) })) });
    }
    if (p.startsWith('/api/voice/')) {
      const v = voices.find(x => x.slug === p.slice(11) && x.status === 'listed'); if (!v) return J({ error: 'not found' }, 404);
      const feeds = (await listFeeds(env)).filter(f => f.voice_id === v.id).map(f => ({ kind: f.kind, url: f.url, format: f.format }));
      const items = filter(await itemsC(env, vb), new URLSearchParams({ voice: v.slug, limit: '60' }), vb);
      const { consent, ...pub } = v; return J({ voice: pub, feeds, items: items.map(i => publicItem(i, v)) });
    }
    if (p === '/api/rss') {
      const items = filter(await itemsC(env, vb), u.searchParams, vb);
      return new Response(toRss(items, 'Israel Insider ' + (u.searchParams.get('format') || 'all'), u.origin), { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    if (p === '/api/submit' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      if (b.hp) return J({ ok: true }, 201, { 'cache-control': 'no-store' }); // honeypot: bots fill hidden fields
      const KINDS = ['blog', 'substack', 'oped', 'editorial', 'podcast', 'vlog', 'item'], kind = KINDS.includes(b.kind) ? b.kind : (b.kind ? '' : 'blog'), link = String(b.link || b.feeds || '').trim();
      if (!b.name || !/^\S+@\S+\.\S+$/.test(b.email || '')) return J({ error: 'Your name and a valid email are required' }, 422);
      if (!kind) return J({ error: 'Choose what you are submitting' }, 422);
      if (!/^https?:\/\/\S+/i.test(link.split(/\s/)[0] || '')) return J({ error: 'Add a link that starts with http or https' }, 422);
      const apply = b.apply_voice === true || (b.apply_voice === undefined && !!b.consent_excerpt);
      if (apply && !b.consent_excerpt) return J({ error: 'To be listed as a voice, please agree to the excerpt permission' }, 422);
      const s = await getJson(env, 'submissions', []);
      if (s.length > 500) return J({ error: 'queue full' }, 429);
      const clip = (x, n) => String(x || '').replace(/[<>]/g, '').slice(0, n);
      s.push({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, link: clip(link, 2000), title: clip(b.title, 160), category: clip(b.category, 60), relation: b.relation === 'reader' ? 'reader' : 'creator', apply_voice: apply, name: clip(b.name, 120), email: clip(b.email, 200), website: clip(b.website, 300), feeds: clip(link, 2000), social: clip(b.social, 300), formats: kind, bio: clip(b.bio, 500), topics: clip(b.category || b.topics, 200), consent_excerpt: !!b.consent_excerpt, consent_full_text: !!b.consent_full_text });
      await putJson(env, 'submissions', s); return J({ ok: true }, 201, { 'cache-control': 'no-store' });
    }
    if (p === '/api/nowlej') {
      const get = async path => { try { const r = await fetch('https://israelnowlej.com' + path, { headers: { 'user-agent': 'IsraelInsider/1.0' }, cf: { cacheTtl: 600, cacheEverything: true } }); if (!r.ok) return []; return nlItems((await r.json()).items); } catch { return []; } };
      const [news, views] = await Promise.all([get('/api/news?v=2'), get('/api/news?views=1&v=2')]);
      return J({ news, views }, 200, { 'cache-control': 'public, max-age=600' });
    }
    if (p === '/api/taxonomy') {
      const tax = await getTax(env), all = (await itemsC(env, vb)).filter(i => !i.hidden && vb[i.voice_id]?.status === 'listed' && isRelevant(i));
      return J({ ...buildTaxonomy(tax, all) }, 200, { 'cache-control': 'public, max-age=300' });
    }
    if (p === '/api/contact' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      const topics = ['General', 'Correction', 'Opt out', 'Sponsorship and advertising', 'Press', 'Technical problem'];
      if (!String(b.message || '').trim() || !/^\S+@\S+\.\S+$/.test(b.email || '')) return J({ error: 'A valid email and a message are required' }, 422);
      const m = await getJson(env, 'messages', []); if (m.length > 500) return J({ error: 'inbox full' }, 429);
      m.push({ id: crypto.randomUUID(), at: new Date().toISOString(), name: String(b.name || '').slice(0, 120), email: String(b.email).slice(0, 200), topic: topics.includes(b.topic) ? b.topic : 'General', message: String(b.message).slice(0, 3000) });
      await putJson(env, 'messages', m); return J({ ok: true }, 201, { 'cache-control': 'no-store' });
    }
    if (p === '/api/entries') {
      const type = u.searchParams.get('type'), kind = u.searchParams.get('kind'), lim = Math.min(+u.searchParams.get('limit') || 30, 100), today = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      let e = (await getJson(env, 'entries', [])).filter(x => !x.hidden && (!type || x.type === type) && (!kind || x.kind === kind) && !(x.kind === 'event' && x.date && x.date < today));
      e = e.sort((a, b) => a.kind === 'event' && b.kind === 'event' ? (a.date || '9').localeCompare(b.date || '9') : b.created.localeCompare(a.created));
      return J({ entries: e.slice(0, lim) }, 200, { 'cache-control': 'public, max-age=120' });
    }
    if (p === '/api/propose' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      const c = cleanEntry(b); if (c.error) return J({ error: c.error }, 422);
      if (!/^\S+@\S+\.\S+$/.test(b.email || '') || !b.consent) return J({ error: 'A valid contact email and consent are required' }, 422);
      if (c.rec.type === 'monitor' && !b.scope_ok) return J({ error: 'Monitor entries must concern a public organization, outlet, statement or campaign, not a private individual' }, 422);
      const s = await getJson(env, 'proposals', []); if (s.length > 500) return J({ error: 'queue full' }, 429);
      s.push({ id: crypto.randomUUID(), at: new Date().toISOString(), email: String(b.email).slice(0, 200), ...c.rec }); await putJson(env, 'proposals', s);
      return J({ ok: true }, 201, { 'cache-control': 'no-store' });
    }
    if (p === '/api/subscribe' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
      const em = String(b.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(em) || em.length > 200 || !b.consent) return J({ error: 'A valid email and your consent are required' }, 422);
      const s = await getJson(env, 'subscribers', []);
      if (s.length > 20000) return J({ error: 'list full' }, 429);
      const name = String(b.name || '').replace(/[<>\n\r]/g, '').trim().slice(0, 40), had = s.find(x => x.email === em);
      if (!had) { s.push({ email: em, name, at: new Date().toISOString() }); await putJson(env, 'subscribers', s); }
      else if (name && !had.name) { had.name = name; await putJson(env, 'subscribers', s); }
      return J({ ok: true, name: name || (had && had.name) || '', returning: !!had }, 201, { 'cache-control': 'no-store' });
    }
    // Admin routes
    if (p.startsWith('/api/admin/')) {
      if (!env.ADMIN_KEY) return J({ error: 'No ADMIN_KEY secret is set on this Worker yet. Add it in Cloudflare under Settings, Variables and Secrets, then try again.' }, 503, { 'cache-control': 'no-store' });
      if (!admin(req, env)) return J({ error: 'Wrong key. It must match the ADMIN_KEY secret exactly, with no spaces.' }, 401, { 'cache-control': 'no-store' });
      if (p === '/api/admin/voices') return J({ voices }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/feeds') return J({ feeds: await listFeeds(env) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/items') { const it = await getJson(env, 'items', []); return J({ items: it.slice(0, 200), total: it.length }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/feed/delete' && req.method === 'POST') { const b = await req.json(); const feeds = (await listFeeds(env)).filter(f => f.id !== b.id); await putJson(env, 'feeds', feeds); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/voice/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'voices', voices.filter(v => v.id !== b.id)); await putJson(env, 'feeds', (await listFeeds(env)).filter(f => f.voice_id !== b.id)); await putJson(env, 'items', (await getJson(env, 'items', [])).filter(i => i.voice_id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/submission/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'submissions', (await getJson(env, 'submissions', [])).filter(x => x.id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/messages') return J({ messages: await getJson(env, 'messages', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/message/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'messages', (await getJson(env, 'messages', [])).filter(x => x.id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/taxonomy' && req.method !== 'POST') return J({ taxonomy: await getTax(env), is_default: !(await getJson(env, 'taxonomy', null)) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/taxonomy' && req.method === 'POST') {
        const b = await req.json();
        if (b.reset) { await env.STORE.delete('taxonomy'); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
        const err = validTaxonomy(b.taxonomy); if (err) return J({ error: err }, 422);
        await putJson(env, 'taxonomy', b.taxonomy); return J({ ok: true }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/entries') return J({ entries: await getJson(env, 'entries', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/proposals') return J({ proposals: await getJson(env, 'proposals', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/entry' && req.method === 'POST') {
        const b = await req.json(); const c = cleanEntry(b); if (c.error) return J({ error: c.error }, 422);
        const all = await getJson(env, 'entries', []); const old = b.id && all.find(x => x.id === b.id);
        if (old) Object.assign(old, c.rec, { hidden: b.hidden === true }); else all.unshift({ id: crypto.randomUUID(), created: new Date().toISOString(), hidden: false, ...c.rec });
        await putJson(env, 'entries', all.slice(0, 2000)); return J({ ok: true }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/entry/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'entries', (await getJson(env, 'entries', [])).filter(x => x.id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/proposal/delete' && req.method === 'POST') { const b = await req.json(); await putJson(env, 'proposals', (await getJson(env, 'proposals', [])).filter(x => x.id !== b.id)); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/subscribers') return J({ subscribers: await getJson(env, 'subscribers', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/submissions') return J({ submissions: await getJson(env, 'submissions', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/voice' && req.method === 'POST') {
        const b = await req.json(); const id = b.id || slug(b.name); const i = voices.findIndex(v => v.id === id);
        const rec = { id, slug: slug(b.slug || b.name), name: b.name, short_bio: b.short_bio || '', avatar: b.avatar || '', website: b.website || '', topics: b.topics || [], position_tag: b.position_tag || '', status: b.status || 'pending', listed_on: b.status === 'listed' ? (voices[i]?.listed_on || new Date().toISOString().slice(0, 10)) : '', consent: { excerpt_ok: b.consent?.excerpt_ok !== false, full_text_ok: b.consent?.full_text_ok === true, date: b.consent?.date || '', note: b.consent?.note || '' } };
        if (i >= 0) voices[i] = { ...voices[i], ...rec }; else voices.push(rec);
        await putJson(env, 'voices', voices); return J({ ok: true, voice: rec }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/import' && req.method === 'POST') {
        const b = await req.json(); const feeds = await listFeeds(env); let nv = 0, nf = 0;
        for (const x of (b.voices || []).slice(0, 200)) {
          if (!x.name) continue; const id = slug(x.name); const i = voices.findIndex(v => v.id === id);
          const rec = { id, slug: id, name: String(x.name).slice(0, 120), short_bio: String(x.short_bio || '').slice(0, 300), avatar: '', website: x.website || '', topics: x.topics || [], position_tag: x.position_tag || '', status: i >= 0 ? voices[i].status : 'pending', listed_on: i >= 0 ? voices[i].listed_on : '', consent: i >= 0 ? voices[i].consent : { excerpt_ok: true, full_text_ok: false, date: '', note: 'Candidate. Not contacted yet.' } };
          if (i >= 0) voices[i] = { ...voices[i], ...rec }; else { voices.push(rec); nv++; }
          for (const c of (x.channels || [])) {
            const fid = slug(id + '-' + c.section + '-' + (c.feed || c.external_id || c.site || '').slice(-14));
            if (feeds.some(f => f.id === fid)) continue;
            const kind = c.kind || ({ substack: 'newsletter', blog: 'blog', oped: 'oped', editorial: 'editorial', podcast: 'podcast', vlog: 'vlog' }[c.section] || 'blog');
            feeds.push({ id: fid, voice_id: id, kind, section: c.section, url: c.feed || '', external_id: c.external_id || '', site: c.site || '', format: feedFormat(kind), status: 'active', error_count: 0, unverified: true }); nf++;
          }
        }
        await putJson(env, 'voices', voices); await putJson(env, 'feeds', feeds); return J({ ok: true, voices_added: nv, feeds_added: nf }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/check' && req.method === 'POST') {
        // Activity check: fetch each feed once, record the newest item date, never store items.
        const feeds = await listFeeds(env), vb2 = Object.fromEntries(voices.map(v => [v.id, v])), cut = Date.now() - 12 * 3600e3, day = 90 * 86400e3;
        const todo = feeds.filter(f => (f.url || f.external_id) && f.kind !== 'x' && (!f.checked_at || Date.parse(f.checked_at) < cut));
        for (const f of todo.slice(0, 25)) {
          const saved = { etag: f.etag, lm: f.last_modified, bf: f.backfilled, ec: f.error_count, st: f.status };
          f.etag = ''; f.last_modified = '';
          try {
            const its = await ingestFeed(env, f, vb2[f.voice_id] || { id: f.voice_id, consent: {} }, fetch);
            const last = its.map(i => Date.parse(i.published_at)).sort((x, y) => y - x)[0];
            f.last_item_at = last ? new Date(last).toISOString() : ''; f.item_count = its.length;
            f.activity = (f.error_count || 0) > 0 ? 'error' : !last ? 'empty' : (Date.now() - last <= day ? 'active' : 'stale');
          } catch { f.activity = 'error'; }
          f.etag = ''; f.last_modified = ''; f.backfilled = saved.bf; f.error_count = saved.ec; f.status = saved.st; f.checked_at = new Date().toISOString();
        }
        await putJson(env, 'feeds', feeds);
        const c = {}; for (const f of feeds) c[f.activity || (f.url || f.external_id ? 'unchecked' : 'no-feed')] = (c[f.activity || (f.url || f.external_id ? 'unchecked' : 'no-feed')] || 0) + 1;
        return J({ ok: true, checked: Math.min(25, todo.length), remaining: Math.max(0, todo.length - 25), counts: c }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/listall' && req.method === 'POST') {
        // Bulk publish. Lists every pending voice, stamps the listing date, and keeps the consent note honest.
        const b = await req.json().catch(() => ({})); const day = new Date().toISOString().slice(0, 10); let n = 0;
        for (const v of voices) if (v.status !== 'listed' && v.status !== 'removed') { v.status = 'listed'; v.listed_on = day; v.consent = { ...(v.consent || {}), excerpt_ok: true, full_text_ok: false, note: ((v.consent && v.consent.note) || '') + ' Listed in bulk ' + day + ' on public feeds. Link-out and excerpts only. Opt-out honored within 48 hours.' }; n++; }
        await putJson(env, 'voices', voices); return J({ ok: true, listed: n }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/resolve' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J({ ok: true, ...(await resolveBatch(env, !!b.retry)) }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/avatars' && req.method === 'POST') return J({ ok: true, ...(await avatarBatch(env)) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/discover' && req.method === 'POST') return J({ ok: true, ...(await discoverBatch(env)) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/feed' && req.method === 'POST') {
        const b = await req.json(); const feeds = await listFeeds(env);
        const f = { id: b.id || slug(b.voice_id + '-' + b.kind + '-' + (b.external_id || b.url || '').slice(-12)), voice_id: b.voice_id, kind: b.kind, url: b.url || '', external_id: b.external_id || '', format: feedFormat(b.kind), section: SECTIONS.includes(b.section) ? b.section : '', site: b.site || '', status: 'active', error_count: 0 };
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
  async scheduled(_evt, env, ctx) { ctx.waitUntil((async () => { await runIngest(env); for (const f of [resolveBatch, avatarBatch, discoverBatch]) { try { await f(env); } catch { /* next hour */ } } })()); },
};
