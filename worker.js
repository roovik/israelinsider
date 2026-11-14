// Israel Insider Worker: feed ingestion, JSON API, RSS output. Storage is KV (binding STORE).
import { parseFeed, toItems, feedFormat, youtubeFeedUrl, toRss, sectionOf, discoverFeed, SECTIONS, looksLikeFeed, feedGuesses, itunesFeed, isRelevant, channelImage, ogImage, fixFormat } from './lib.js';
import { DEFAULT_TAXONOMY, classify, buildTaxonomy, validTaxonomy } from './taxonomy.js';
import { traffic } from './cfstats.js';

const J = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120', 'access-control-allow-origin': '*', ...extra } });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const MAX_ITEMS = 1500;
// The freezer: listed voices with nothing new for QUIET_DAYS leave the public site (status frozen). Their feeds are still
// checked once a week, and a frozen voice that publishes again is listed again automatically.
const QUIET_DAYS = 90, FROZEN_CHECK_DAYS = 7;

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
  const allV = await listVoices(env), voices = allV.filter(v => v.status === 'listed' || v.status === 'frozen');
  const feeds = await listFeeds(env);
  const byId = Object.fromEntries(voices.map(v => [v.id, v])), weekAgo = new Date(Date.now() - FROZEN_CHECK_DAYS * 864e5).toISOString();
  const existing = await getJson(env, 'items', []);
  const seen = new Map(existing.map(i => [i.id, i]));
  let added = 0;
  // Free plans allow about 50 subrequests per call: take the feeds checked longest ago, 35 at a time.
  const due = feeds.filter(f => byId[f.voice_id] && f.status !== 'paused' && f.kind !== 'x' && (f.url || f.external_id) && (byId[f.voice_id].status === 'listed' || String(f.last_checked || '') < weekAgo)).sort((a, b) => String(a.last_checked || '').localeCompare(String(b.last_checked || '')));
  const batch = new Set(due.slice(0, 35).map(f => f.id));
  for (const f of feeds) {
    const v = byId[f.voice_id];
    if (!batch.has(f.id)) continue;
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
  const thawed = thaw(allV, feeds); if (thawed.length) await putJson(env, 'voices', allV);
  return { added, total: all.length, remaining: Math.max(0, due.length - batch.size), thawed };
}

// Newest item date for a voice: from its feeds (kept even after old items leave the store) and its stored items.
export function lastActivity(v, feeds, items) {
  let last = '';
  for (const f of feeds) if (f.voice_id === v.id && f.last_item_at && f.last_item_at > last) last = f.last_item_at;
  for (const i of items || []) if (i.voice_id === v.id && i.published_at > last) last = i.published_at;
  return last;
}
// A voice is quiet when nothing has appeared for QUIET_DAYS. Voices whose feeds have not been fetched even once are left alone until they have been.
export function quietVoices(voices, feeds, items, now = Date.now()) {
  const cut = new Date(now - QUIET_DAYS * 864e5).toISOString(), out = [];
  for (const v of voices) {
    if (v.status !== 'listed') continue;
    const vf = feeds.filter(f => f.voice_id === v.id && f.kind !== 'x' && (f.url || f.external_id) && f.status !== 'paused');
    const last = lastActivity(v, feeds, items);
    if (last && last >= cut) continue;
    if (vf.length && vf.some(f => !f.last_checked && !f.checked_at)) continue;
    out.push({ id: v.id, name: v.name, last, reason: !vf.length ? 'no feed' : last ? 'nothing new since ' + last.slice(0, 10) : 'no items found' });
  }
  return out;
}
export async function freezeQuiet(env, dry = false, now = Date.now()) {
  const voices = await listVoices(env), feeds = await listFeeds(env), items = await getJson(env, 'items', []);
  const q = quietVoices(voices, feeds, items, now);
  if (!dry && q.length) { const ids = new Set(q.map(x => x.id)), day = new Date(now).toISOString().slice(0, 10); for (const v of voices) if (ids.has(v.id)) { v.status = 'frozen'; v.frozen_on = day; } await putJson(env, 'voices', voices); }
  return { frozen: dry ? 0 : q.length, quiet: q };
}
function thaw(voices, feeds, now = Date.now()) {
  const cut = new Date(now - QUIET_DAYS * 864e5).toISOString(), out = [];
  for (const v of voices) if (v.status === 'frozen') { const last = lastActivity(v, feeds, null); if (last && last >= cut) { v.status = 'listed'; v.thawed_on = new Date(now).toISOString().slice(0, 10); delete v.frozen_on; out.push(v.id); } }
  return out;
}

const PER_VOICE = 3;
// A feed address is for machines. Anything shown to readers as "the site" must be a human page.
export function humanUrl(u) {
  try { const x = new URL(u); if (/(^|\/)(feed|feeds|rss|atom)(\/|\.|$)|\.(xml|rss|atom)$|posts\/default|videos\.xml/i.test(x.pathname + x.search)) return x.origin; return u; } catch { return u || ''; }
}
function filter(items, q, voicesById) {
  let out = items.map(i => ({ ...i, format: fixFormat(i.format, !!i.audio_url, !!i.embed_id) })).filter(i => !i.hidden && voicesById[i.voice_id]?.status === 'listed' && isRelevant(i)).sort((a, b) => b.published_at.localeCompare(a.published_at));
  if (!q.get('voice')) { const n = {}; out = out.filter(i => (n[i.voice_id] = (n[i.voice_id] || 0) + 1) <= PER_VOICE); } // diversity: newest 3 per source, except on a voice's own page
  if (q.get('id')) out = out.filter(i => i.id === q.get('id'));
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
    .filter(i => /^https?:\/\//.test(i.u)).sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 12);
}

const BOT = { 'user-agent': 'Mozilla/5.0 (compatible; IsraelInsiderBot/1.0; +https://israelinsider.org/bot)', cookie: 'CONSENT=YES+1', 'accept-language': 'en' };
const getOk = async u => { try { const r = await fetch(u, { headers: BOT, redirect: 'follow' }); return r.ok ? r : null; } catch { return null; } };
// Outreach: public contact details found on a voice's own pages (email, social profiles, contact page). Nothing is sent from here.
const NOTMAIL = /(example\.|sentry|wixpress|noreply|no-reply|donotreply|\.png|\.jpg|\.gif|\.webp|\.svg|@2x|domain\.com|email\.com|yourname|u003e)/i;
const NOTHANDLE = new Set(['share', 'intent', 'home', 'login', 'signup', 'i', 'hashtag', 'search', 'explore', 'sharer', 'sharer.php', 'dialog', 'plugins', 'tr', 'p', 'reel', 'reels', 'stories', 'watch', 'embed', 'shareArticle', 'privacy', 'about', 'legal', 'help', 'policies', 'accounts', 'settings', 'notifications', 'messages', 'compose', 'tos', 'joinchat', 'share.php', 'feed', 'groups', 'pages', 'events', 'profile.php', 'channel', 'c', 'user', 'playlist', 'results', 'substack', 'substackinc', 'wordpress', 'wordpressdotcom', 'jetpack', 'automattic', 'mailchimp', 'ghost', 'beehiiv', 'squarespace', 'wix', 'medium']);
export function findContacts(html, base) {
  const out = {}, h = String(html || '').replace(/&#64;|&#x40;|\[at\]|\(at\)/gi, '@').replace(/&amp;/g, '&');
  const mails = [...h.matchAll(/mailto:([^"'?\s<>]+)/gi)].map(m => decodeURIComponent(m[1])).concat(h.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
  const em = mails.map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x) && !NOTMAIL.test(x));
  if (em.length) out.email = [...new Set(em)].slice(0, 3).join(', ');
  const pick = (re, k, f = x => x) => { for (const m of h.matchAll(re)) { const v = m[1]; if (v && !NOTHANDLE.has(v) && !NOTHANDLE.has(v.toLowerCase()) && v.length > 1) { out[k] = f(v); return; } } };
  pick(/https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/(?:#!\/)?@?([A-Za-z0-9_]{2,15})(?=[\/"'?#\s<]|$)/g, 'x');
  pick(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})(?=[\/"'?#\s<]|$)/g, 'instagram');
  pick(/https?:\/\/(?:www\.|m\.)?(?:facebook|fb)\.com\/([A-Za-z0-9.\-]{3,60})(?=[\/"'?#\s<]|$)/g, 'facebook');
  pick(/https?:\/\/(?:www\.)?linkedin\.com\/((?:in|company)\/[A-Za-z0-9_\-%]{2,80})(?=[\/"'?#\s<]|$)/g, 'linkedin');
  pick(/https?:\/\/(?:www\.)?(?:t|telegram)\.me\/([A-Za-z0-9_]{4,32})(?=[\/"'?#\s<]|$)/g, 'telegram');
  pick(/https?:\/\/(?:www\.)?youtube\.com\/(@[A-Za-z0-9_.\-]{2,40}|channel\/UC[A-Za-z0-9_\-]{20,24})(?=[\/"'?#\s<]|$)/g, 'youtube');
  pick(/https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{8,15})/g, 'whatsapp');
  const c = h.match(/href=["']([^"']*\/(?:contact|contact-us|about|work-with-me|speaking|booking|media|press)\/?)["']/i);
  if (c) { try { out.contact_url = new URL(c[1], base).href; } catch {} }
  return out;
}
export async function contactBatch(env, ids, fetcher = getOk, force = false) {
  const voices = await listVoices(env), feeds = await listFeeds(env), O = await getJson(env, 'outreach', {});
  const want = (ids && ids.length ? voices.filter(v => ids.includes(v.id)) : voices.filter(v => v.status === 'listed'))
    .filter(v => force || !(O[v.id] && O[v.id].found_at));
  const todo = want.slice(0, 8); let found = 0;
  for (const v of todo) {
    const o = O[v.id] = O[v.id] || {}, got = {};
    for (const f of feeds.filter(x => x.voice_id === v.id)) {
      const u = [f.site, f.url].join(' ');
      if (f.kind === 'x' && f.external_id) got.x = got.x || String(f.external_id).replace(/^@/, '');
      if (f.kind === 'telegram' && f.external_id) got.telegram = got.telegram || String(f.external_id).replace(/^@/, '');
      const yt = u.match(/youtube\.com\/(@[A-Za-z0-9_.\-]+|channel\/UC[A-Za-z0-9_\-]{20,24})/); if (yt) got.youtube = got.youtube || yt[1];
      if (f.kind === 'youtube' && f.external_id && /^UC/.test(f.external_id)) got.youtube = got.youtube || 'channel/' + f.external_id;
    }
    const site = v.website;
    if (site) {
      const r = await fetcher(site); if (r) Object.assign(got, Object.fromEntries(Object.entries(findContacts(await r.text(), site)).filter(([k]) => !got[k])));
      if (!got.email && got.contact_url && got.contact_url !== site) { const r2 = await fetcher(got.contact_url); if (r2) { const c2 = findContacts(await r2.text(), got.contact_url); for (const k in c2) if (!got[k] && k !== 'contact_url') got[k] = c2[k]; } }
    }
    for (const k in got) if (!o[k]) { o[k] = got[k]; found++; }
    o.found_at = new Date().toISOString();
  }
  await putJson(env, 'outreach', O);
  return { checked: todo.length, found, remaining: Math.max(0, want.length - todo.length) };
}
// Spread first notes over working days, best pages first. No sends on Friday or Saturday.
export async function planOutreach(env, b = {}, now = Date.now()) {
  const voices = (await listVoices(env)).filter(v => v.status === 'listed'), O = await getJson(env, 'outreach', {}), items = await getJson(env, 'items', []);
  const n = {}, last = {}; for (const i of items) if (!i.hidden) { n[i.voice_id] = (n[i.voice_id] || 0) + 1; if ((i.published_at || '') > (last[i.voice_id] || '')) last[i.voice_id] = i.published_at; }
  const sc = v => Math.min(n[v.id] || 0, 20) + (v.avatar ? 6 : 0) + (v.short_bio ? 2 : 0) + (last[v.id] && now - Date.parse(last[v.id]) < 30 * 864e5 ? 6 : 0);
  const todo = voices.filter(v => !(O[v.id] && O[v.id].status)).sort((a, z) => sc(z) - sc(a) || a.name.localeCompare(z.name));
  const days = []; let d = new Date(b.start ? b.start + 'T12:00:00Z' : now + 864e5); const span = Math.max(1, Math.min(60, +b.days || 14));
  for (let k = 0; k < span; k++, d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
  const per = Math.max(1, Math.min(40, +b.per_day || Math.ceil(todo.length / Math.max(1, days.length))));
  const plan = {}; todo.forEach((v, i) => { const day = days[Math.floor(i / per)]; const o = O[v.id] = O[v.id] || {}; if (day) { if (o.plan !== day) olog(o, 'plan', 'first note planned for ' + day); o.plan = day; plan[day] = (plan[day] || 0) + 1; } else delete o.plan; });
  await putJson(env, 'outreach', O);
  return { planned: Object.values(plan).reduce((a, c) => a + c, 0), unplanned: Math.max(0, todo.length - per * days.length), per_day: per, days: plan };
}
const OSTAT = ['', 'contacted', 'replied', 'blessed', 'linked', 'guest', 'declined', 'no-contact'];
const OFIELDS = ['email', 'x', 'instagram', 'facebook', 'linkedin', 'telegram', 'whatsapp', 'youtube', 'contact_url', 'next', 'notes'];
// Small batches keep one request under the subrequest limit. Each feed is tried once unless retry is set.
export async function resolveBatch(env, retry) {
  const voices = await listVoices(env), feeds = await listFeeds(env), names = Object.fromEntries(voices.map(v => [v.id, v.name]));
  if (retry) for (const f of feeds) { if (f.section === 'podcast' && !f.audio && f.site) { f.url = ''; } if (!f.url && !f.external_id) delete f.resolved_at; }
  let found = 0; const missed = [];
  const todo = feeds.filter(f => !f.url && !f.external_id && f.site && !f.resolved_at);
  for (const f of todo.slice(0, 6)) {
    f.resolved_at = new Date().toISOString(); let d = null;
    if (f.section === 'podcast' || f.kind === 'podcast') { const r = await getOk('https://itunes.apple.com/search?media=podcast&limit=5&term=' + encodeURIComponent(f.term || names[f.voice_id] || '')); if (r) { const u2 = itunesFeed(await r.json().catch(() => null), f.term || names[f.voice_id] || ''); if (u2) { d = { url: u2, audio: true }; } } }
    const pg = d ? null : await getOk(f.site); if (pg) d = discoverFeed(await pg.text(), f.site);
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
// A voice belongs to an outlet's blog platform when its page or feed lives on the platform's author pages. The outlet's own staff, podcasts and channels stay ungrouped.
const GROUPS = [{ id: 'toi', re: /^https?:\/\/blogs\.timesofisrael\.com\//i }, { id: 'jj', re: /^https?:\/\/jewishjournal\.com\/(author|category\/blogs)\//i }];
export function groupOf(v, feeds) {
  const urls = [v.website].concat((feeds || []).filter(f => f.voice_id === v.id).flatMap(f => [f.site, f.url]));
  for (const g of GROUPS) if (urls.some(u => u && g.re.test(u))) return g.id;
  return v.group || '';
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
  try { const n = await discoverNowlej(env); added += n.added; checked += n.checked; remaining += n.remaining; } catch { /* next hour */ }
  return { added, checked, remaining };
}
// Opinion and blog writers who keep appearing in Israel NOWlej's views feed become pending voices.
// Three or more pieces, no staff or editorial bylines, and Haaretz is left out by editorial choice.
const NL_SKIP_SRC = new Set(['haaretz']), NL_STAFF = /\b(staff|editorial|editors?|team|desk|jns|jta|reuters|associated press)\b/i;
const NL_AUTHOR = { toi: s => ({ page: `https://blogs.timesofisrael.com/author/${s}/`, section: 'blog' }), ji: s => ({ page: `https://jewishinsider.com/author/${s}/`, section: 'oped' }) };
export async function discoverNowlej(env) {
  const r0 = await getOk('https://israelnowlej.com/api/news?views=1&v=2'); if (!r0) return { added: 0, checked: 0, remaining: 0 };
  const d = await r0.json().catch(() => null), tally = new Map();
  for (const i of (d && d.items) || []) {
    const nm = String(i.by || '').trim(); if (!nm || nm.length > 60 || !/\s/.test(nm) || NL_SKIP_SRC.has(i.s) || NL_STAFF.test(nm)) continue;
    const k = slug(nm), o = tally.get(k) || { nm, n: 0, s: i.s, src: i.src, u: i.u }; o.n++; tally.set(k, o);
  }
  const voices = await listVoices(env), feeds = await listFeeds(env), seen = new Set(await getJson(env, 'discovered', [])), have = new Set(voices.map(v => v.id));
  let added = 0, checked = 0, remaining = 0;
  for (const [sl, o] of tally) {
    if (o.n < 3 || have.has(sl) || seen.has('nl:' + sl)) continue;
    if (checked >= 12) { remaining++; continue; }
    checked++; seen.add('nl:' + sl);
    const a = (NL_AUTHOR[o.s] || (() => ({ page: '', section: 'oped' })))(sl); let fu = '';
    if (a.page) { const r = await getOk(a.page + 'feed/'); if (r && looksLikeFeed(await r.text())) fu = a.page + 'feed/'; }
    let site = a.page; if (!site) { try { site = new URL(o.u).origin; } catch { site = ''; } }
    voices.push({ id: sl, slug: sl, name: o.nm, short_bio: 'Writes for ' + o.src + '.', avatar: '', website: site, topics: [], position_tag: '', status: 'pending', listed_on: '', consent: { excerpt_ok: true, full_text_ok: false, date: '', note: 'Found in Israel NOWlej opinion and blog feeds (' + o.n + ' pieces). Not reviewed yet.' } });
    const kind = a.section === 'blog' ? 'blog' : 'oped';
    feeds.push({ id: slug(sl + '-' + a.section + '-nl'), voice_id: sl, kind, section: a.section, url: fu, external_id: '', site, term: '', format: feedFormat(kind), status: 'active', error_count: 0, unverified: true }); have.add(sl); added++;
  }
  await putJson(env, 'voices', voices); await putJson(env, 'feeds', feeds); await putJson(env, 'discovered', [...seen].slice(-5000));
  return { added, checked, remaining };
}

// ---------------------------------------------------------------- email: welcome, unsubscribe, weekly digest
// Needs the secret RESEND_KEY and the variable MAIL_FROM (an address on a domain verified with Resend). Without them nothing is sent.
const SITE = 'https://israelinsider.org';
async function sendBatch(env, msgs) {
  if (!env.RESEND_KEY || !env.MAIL_FROM) return { ok: false, sent: 0, note: 'Mail is not set up yet.' };
  let sent = 0, note = '';
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100).map(m => ({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text, ...(m.headers ? { headers: m.headers } : {}) }));
    try {
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(chunk) });
      if (r.ok) sent += chunk.length; else note = 'Mail service said ' + r.status;
    } catch (e) { note = String(e); }
  }
  return { ok: sent === msgs.length, sent, note };
}
// Unsubscribe links are signed with UNSUB_KEY, or with ADMIN_KEY when that is not set.
async function unsubToken(env, email) {
  const secret = env.UNSUB_KEY || env.ADMIN_KEY || '';
  if (!secret) return '';
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('unsub:' + email));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
async function unsubUrl(env, email) { const t = await unsubToken(env, email); return t ? SITE + '/unsubscribe?e=' + encodeURIComponent(email) + '&t=' + t : ''; }
async function unsubHeaders(env, email) { const u = await unsubUrl(env, email); return u ? { 'List-Unsubscribe': '<' + u + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined; }
async function mailTo(env, email, subject, body) {
  const uu = await unsubUrl(env, email);
  return { to: email, subject, text: body + '\n' + (uu ? 'To stop receiving these emails: ' + uu : 'To stop receiving these emails, reply and say so.') + '\n', headers: await unsubHeaders(env, email) };
}
const pageHtml = (title, body) => new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + title + ' | Israel Insider</title><style>body{font:18px/1.55 Georgia,serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1b2a3a}button{font:600 16px system-ui,sans-serif;background:#0b3d6b;color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer}a{color:#0b3d6b}</style></head><body><h1>' + title + '</h1>' + body + '</body></html>', { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
// ---------------------------------------------------------------- outreach replies
// Every outreach note carries a personal link, /r/<token>. Answers land in one store with a timestamp, update the voice's outreach
// status, and are emailed to the alert address so they can be processed with email replies in one place.
const RCHOICE = { yes: 'Happy to be included', changes: 'Please make changes', remove: 'Please remove me', question: 'A question or comment' };
const rtoken = () => [...crypto.getRandomValues(new Uint8Array(9))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
function olog(o, via, what) { o.log = (o.log || []).concat([{ at: new Date().toISOString(), via: String(via).slice(0, 30), what: String(what).slice(0, 160) }]).slice(-60); }
export async function recordResponse(env, voiceId, r) {
  const voices = await listVoices(env), v = voices.find(x => x.id === voiceId); if (!v) return { error: 'Unknown voice' };
  const O = await getJson(env, 'outreach', {}), o = O[voiceId] = O[voiceId] || {}, R = await getJson(env, 'responses', []);
  const rec = { id: crypto.randomUUID(), at: new Date().toISOString(), voice_id: voiceId, name: v.name, via: String(r.via || 'reply page').slice(0, 30), choice: RCHOICE[r.choice] ? r.choice : 'question', link: !!r.link, guest: !!r.guest, venture: !!r.venture, text: String(r.text || '').slice(0, 4000), contact: String(r.contact || '').slice(0, 200), handled: false };
  const before = o.status || '';
  if (rec.choice === 'yes') o.status = 'blessed';
  else if (rec.choice === 'remove') { o.status = 'declined'; if (v.status !== 'removed') { v.status = 'removed'; v.removed_on = rec.at.slice(0, 10); await putJson(env, 'voices', voices); } }
  else if (!before || before === 'contacted') o.status = 'replied';
  if (rec.link) o.wants_link = true; if (rec.guest) o.wants_guest = true; if (rec.venture) o.wants_venture = true;
  if (rec.choice === 'yes' && !rec.text && !rec.guest && !rec.venture) rec.handled = true; // a plain yes needs nothing from you
  olog(o, rec.via, 'Reply: ' + RCHOICE[rec.choice] + (rec.link ? ', will link' : '') + (rec.guest ? ', open to guest or topic' : '') + (rec.venture ? ', interested in a joint venture or sponsorship' : '') + (rec.text ? ', with a note' : ''));
  if (before !== (o.status || '')) olog(o, 'system', 'status: ' + (before || 'not contacted') + ' → ' + o.status);
  R.unshift(rec); await putJson(env, 'responses', R.slice(0, 2000)); await putJson(env, 'outreach', O);
  const set = await getJson(env, 'outreach_settings', {});
  if (set.alert) { try { await sendBatch(env, [{ to: set.alert, subject: '[Outreach reply] ' + v.name + ': ' + RCHOICE[rec.choice] + (rec.handled ? '' : ' (needs you)'), text: v.name + ' answered through ' + rec.via + ' at ' + rec.at.replace('T', ' ').slice(0, 16) + ' UTC.\n\nAnswer: ' + RCHOICE[rec.choice] + '\nWill link or mention us: ' + (rec.link ? 'yes' : 'no') + '\nOpen to a guest spot or topic: ' + (rec.guest ? 'yes' : 'no') + '\nInterested in a joint venture or sponsorship: ' + (rec.venture ? 'yes' : 'no') + (rec.contact ? '\nContact: ' + rec.contact : '') + '\n\nTheir note:\n' + (rec.text || '(none)') + '\n\nTheir page: ' + SITE + '/#/voice/' + v.slug + '\nOpen in the admin: ' + SITE + '/admin.html#o=' + v.id + '\n' }]); } catch { /* the reply is stored either way */ } }
  return { ok: true, response: rec, status: o.status };
}
async function replyRoute(req, env) {
  const tok = new URL(req.url).pathname.split('/')[2] || '', O = await getJson(env, 'outreach', {});
  const id = /^[a-z0-9]{8,20}$/.test(tok) && Object.keys(O).find(k => O[k].token === tok);
  const voices = id ? await listVoices(env) : [], v = id && voices.find(x => x.id === id);
  if (!v) return pageHtml('That link is not valid', '<p>Please reply to the email or message you received instead, and we will take care of it by hand.</p>');
  const e = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (req.method === 'POST') {
    const f = await req.formData(), day = new Date().toISOString().slice(0, 10), o = O[id];
    if (f.get('website_url')) return pageHtml('Thank you', '<p>Received.</p>'); // bots fill the hidden field
    if ((o.rday === day ? o.rcount || 0 : 0) >= 5) return pageHtml('Thank you', '<p>We already have your answers for today. Reply to our email if you need anything else.</p>');
    o.rday = day; o.rcount = (o.rday === day ? (o.rcount || 0) : 0) + 1; await putJson(env, 'outreach', O);
    const r = await recordResponse(env, id, { via: 'reply page', choice: f.get('choice'), link: f.get('link') === '1', guest: f.get('guest') === '1', venture: f.get('venture') === '1', text: f.get('text'), contact: f.get('contact') });
    const done = r.status === 'declined' ? '<p>We have taken your page down. Thank you for letting us know.</p>' : '<p>Your answer is with Richard, who reads every one himself.' + (f.get('text') ? ' He will get back to you about your note.' : '') + '</p><p><a href="' + SITE + '/#/voice/' + e(v.slug) + '">See your page</a></p>';
    return pageHtml('Thank you, ' + e(v.name), done);
  }
  const page = SITE + '/#/voice/' + v.slug;
  return pageHtml('Your page on Israel Insider', '<p><b>' + e(v.name) + '</b>, your page is at <a href="' + e(page) + '" target="_blank" rel="noopener">israelinsider.org</a>. Every item on it links back to your own site.</p>' +
    '<form method="post" style="font:16px/1.5 system-ui,sans-serif"><fieldset style="border:0;padding:0;margin:0 0 14px"><legend style="font-weight:700;margin-bottom:6px">Your answer</legend>' +
    [['yes', 'Happy to be included as it is'], ['changes', 'Happy to be included, with some changes (tell us below)'], ['question', 'I have a question or comment'], ['remove', 'Please remove my page']].map((x, i) => '<label style="display:block;margin:6px 0"><input type="radio" name="choice" value="' + x[0] + '"' + (i ? '' : ' checked') + '> ' + x[1] + '</label>').join('') + '</fieldset>' +
    '<label style="display:block;margin:6px 0"><input type="checkbox" name="link" value="1"> I’m glad to link to my page or mention Israel Insider or Israel NOWlej</label>' +
    '<label style="display:block;margin:6px 0"><input type="checkbox" name="guest" value="1"> I’d like to talk about having Richard Koret as a guest, or a topic</label>' +
    '<label style="display:block;margin:6px 0 14px"><input type="checkbox" name="venture" value="1"> I’m interested in a joint venture or sponsorship with Israel Insider’s news or Israel NOWlej’s maps, timelines and tours</label>' +
    '<label for="t" style="display:block;font-weight:700">Corrections, additions or a note (optional)</label><textarea id="t" name="text" rows="5" style="width:100%;font:16px system-ui;padding:8px;box-sizing:border-box" placeholder="A better photo or bio, a podcast or channel to add, anything else"></textarea>' +
    '<label for="c" style="display:block;font-weight:700;margin-top:10px">Best way to reach you (optional)</label><input id="c" name="contact" style="width:100%;font:16px system-ui;padding:8px;box-sizing:border-box" placeholder="Email or handle">' +
    '<input name="website_url" tabindex="-1" autocomplete="off" style="position:absolute;left:-5000px" aria-hidden="true">' +
    '<p><button type="submit">Send my answer</button></p><p style="font-size:14px;color:#556">Only Richard sees your answer. Your contact details are never published.</p></form>');
}
async function unsubscribeRoute(req, env) {
  const u = new URL(req.url), email = String(u.searchParams.get('e') || '').trim().toLowerCase().slice(0, 200), tok = u.searchParams.get('t') || '';
  const safe = email.replace(/[<>&"]/g, '');
  if (!email || !tok || tok !== await unsubToken(env, email)) return pageHtml('That link is not valid', '<p>Reply to any email from us and we will remove you by hand, or use the contact page at <a href="/#/contact">israelinsider.org</a>.</p>');
  if (req.method === 'POST') {
    const s = await getJson(env, 'subscribers', []), r = s.find(x => x.email === email);
    if (r) { r.status = 'unsubscribed'; r.unsubscribed_at = new Date().toISOString(); await putJson(env, 'subscribers', s); }
    return pageHtml('You are unsubscribed', '<p>We have removed <b>' + safe + '</b> from the digest. You will not hear from us again unless you subscribe again.</p><p><a href="/">Back to Israel Insider</a></p>');
  }
  return pageHtml('Unsubscribe', '<p>Stop sending the Israel Insider digest to <b>' + safe + '</b>?</p><form method="post"><button>Yes, unsubscribe me</button></form><p><a href="/">No, take me back</a></p>');
}
// Weekly digest of the newest items from listed voices. Off until the variable DIGEST is set to "on".
// DIGEST_DAY is the UTC weekday (0 is Sunday, the default) and DIGEST_HOUR the UTC hour (default 6).
async function digestContent(env) {
  const voices = (await listVoices(env)).filter(v => v.status === 'listed'), vb = Object.fromEntries(voices.map(v => [v.id, v]));
  const cutoff = Date.now() - 8 * 86400000, seen = new Set(), pick = [];
  const items = (await getJson(env, 'items', [])).filter(i => !i.hidden && vb[i.voice_id] && i.published_at && new Date(i.published_at).getTime() >= cutoff);
  items.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  for (const i of items) { const k = (i.title || '').toLowerCase().slice(0, 60); if (seen.has(k)) continue; seen.add(k); pick.push(i); if (pick.length >= 20) break; }
  if (pick.length < 3) return null;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
  return { subject: 'Israel Insider, new voices this week (' + date + ')', body: 'New from the voices on Israel Insider, week of ' + date + '.\n\n' + pick.map(i => '* ' + i.title + ' (' + vb[i.voice_id].name + ')\n  ' + i.url).join('\n\n') + '\n\nMore at ' + SITE + '/\n' };
}
export async function runDigest(env, opts = {}) {
  const day = new Date().toISOString().slice(0, 10);
  if (!opts.force) {
    if (env.DIGEST !== 'on') return { ok: false, note: 'digest is off' };
    const n = new Date();
    if (n.getUTCDay() !== (env.DIGEST_DAY === undefined ? 0 : parseInt(env.DIGEST_DAY, 10)) || n.getUTCHours() !== (parseInt(env.DIGEST_HOUR || '6', 10) || 6)) return { ok: false, note: 'not the digest time' };
    if ((await env.STORE.get('digest_last')) === day) return { ok: false, note: 'already sent today' };
  }
  const c = await digestContent(env);
  if (!c) return { ok: false, note: 'not enough fresh items' };
  if (opts.previewOnly) return { ok: true, preview: c };
  const people = opts.testTo ? [{ email: opts.testTo }] : (await getJson(env, 'subscribers', [])).filter(p => p.status !== 'unsubscribed' && p.email);
  if (!opts.testTo) await env.STORE.put('digest_last', day);
  const msgs = []; for (const p of people) msgs.push(await mailTo(env, p.email, c.subject, c.body));
  const res = msgs.length ? await sendBatch(env, msgs) : { ok: true, sent: 0, note: '' };
  if (!opts.testTo) await env.STORE.put('digest_log', JSON.stringify({ day, recipients: msgs.length, sent: res.sent, note: res.note }));
  return { ok: res.ok, recipients: msgs.length, sent: res.sent, note: res.note };
}

const W = {
  async route(req, env, ctx) {
    const u = new URL(req.url); const p = u.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' } });
    if (p === '/unsubscribe') return unsubscribeRoute(req, env);
    if (p.startsWith('/r/')) return replyRoute(req, env);
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    const voices = await listVoices(env); const vb = Object.fromEntries(voices.map(v => [v.id, v]));

    if (p === '/api/items') { const items = filter(await itemsC(env, vb), u.searchParams, vb); return J({ items: items.map(i => publicItem(i, vb[i.voice_id])) }); }
    if (p === '/api/voices') {
      const fs = await listFeeds(env), sec = {}, last = {};
      for (const f of fs) { const s = sectionOf(f); if (s) (sec[f.voice_id] = sec[f.voice_id] || new Set()).add(s); }
      const its = (await getJson(env, 'items', [])).filter(i => !i.hidden && isRelevant(i)).sort((a, b) => b.published_at.localeCompare(a.published_at));
      for (const i of its) { const l = (last[i.voice_id] = last[i.voice_id] || []); if (l.length < 2) l.push({ t: i.title, u: i.url, d: i.published_at }); }
      return J({ voices: voices.filter(v => v.status === 'listed').map(({ consent, ...v }) => ({ ...v, website: humanUrl(v.website), sections: SECTIONS.filter(s => sec[v.id]?.has(s)), group: groupOf(v, fs), latest: last[v.id] || [] })) });
    }
    if (p.startsWith('/api/voice/')) {
      const v = voices.find(x => x.slug === p.slice(11) && x.status === 'listed'); if (!v) return J({ error: 'not found' }, 404);
      const feeds = (await listFeeds(env)).filter(f => f.voice_id === v.id).map(f => {
        // Link people to the readable page. The raw feed address is offered separately as RSS.
        const yt = f.external_id ? 'https://www.youtube.com/channel/' + f.external_id : '';
        let page = humanUrl(f.site || '') || yt;
        if (!page && f.url) { try { page = new URL(f.url).origin; } catch { /* none */ } }
        return { kind: f.kind, section: sectionOf(f), url: page || humanUrl(v.website) || humanUrl(f.url), feed: f.url && !yt ? f.url : '', format: f.format };
      });
      const items = filter(await itemsC(env, vb), new URLSearchParams({ voice: v.slug, limit: '60' }), vb);
      const { consent, ...pub0 } = v, pub = { ...pub0, website: humanUrl(pub0.website) }; return J({ voice: pub, feeds, items: items.map(i => publicItem(i, v)) });
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
      if (b.website) return J({ ok: true, name: '', returning: false }, 201, { 'cache-control': 'no-store' });   // honeypot
      const em = String(b.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(em) || em.length > 200 || !b.consent) return J({ error: 'A valid email and your consent are required' }, 422);
      const rk = 'rl_' + (req.headers.get('CF-Connecting-IP') || 'x') + '_' + new Date().toISOString().slice(0, 13), hits = parseInt(await env.STORE.get(rk) || '0', 10);
      if (hits >= 8) return J({ error: 'That is enough for this hour. Try again later.' }, 429);
      await env.STORE.put(rk, String(hits + 1), { expirationTtl: 3700 });
      const s = await getJson(env, 'subscribers', []);
      if (s.length > 20000) return J({ error: 'list full' }, 429);
      const name = String(b.name || '').replace(/[<>\n\r]/g, '').trim().slice(0, 40), had = s.find(x => x.email === em);
      const wasOut = !!had && had.status === 'unsubscribed';
      if (!had) { s.push({ email: em, name, at: new Date().toISOString(), status: 'active' }); await putJson(env, 'subscribers', s); }
      else if ((name && !had.name) || wasOut) { if (name && !had.name) had.name = name; if (wasOut) { had.status = 'active'; had.resubscribed_at = new Date().toISOString(); } await putJson(env, 'subscribers', s); }
      if (!had || wasOut) {
        const hello = (name || (had && had.name)) ? 'Hello ' + (name || had.name) + ',' : 'Hello,';
        const job = (async () => { const m = await mailTo(env, em, 'Welcome to Israel Insider', hello + '\n\nThank you for subscribing to Israel Insider. Once a week we send the newest items from the writers, podcasters and video creators we list, each linking to their own page.\n\nBrowse the voices at ' + SITE + '/\n'); await sendBatch(env, [m]); })();
        if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
      }
      return J({ ok: true, name: name || (had && had.name) || '', returning: !!had && !wasOut }, 201, { 'cache-control': 'no-store' });
    }
    // Admin routes
    if (p.startsWith('/api/admin/')) {
      if (!env.ADMIN_KEY) return J({ error: 'No ADMIN_KEY secret is set on this Worker yet. Add it in Cloudflare under Settings, Variables and Secrets, then try again.' }, 503, { 'cache-control': 'no-store' });
      if (!admin(req, env)) return J({ error: 'Wrong key. It must match the ADMIN_KEY secret exactly, with no spaces.' }, 401, { 'cache-control': 'no-store' });
      if (p === '/api/admin/traffic') return J(await traffic(env, u.searchParams.get('site') || 'insider', u.searchParams.get('days')), 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/voices') return J({ voices }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/outreach' && req.method !== 'POST') {
        const its = await getJson(env, 'items', []), st = {};
        for (const i of its) { if (i.hidden) continue; const x = st[i.voice_id] = st[i.voice_id] || { items: 0, last: '', title: '', url: '' }; x.items++; if ((i.published_at || '') > x.last) { x.last = i.published_at || ''; x.title = i.title || ''; x.url = i.url || ''; } }
        const O = await getJson(env, 'outreach', {}); let nt = 0;
        for (const v of voices) if (v.status === 'listed') { const o = O[v.id] = O[v.id] || {}; if (!o.token) { o.token = rtoken(); nt++; } }
        if (nt) await putJson(env, 'outreach', O);
        return J({ outreach: O, stats: st, settings: await getJson(env, 'outreach_settings', {}) }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/outreach' && req.method === 'POST') {
        const b = await req.json(); if (!b.id || !voices.some(v => v.id === b.id)) return J({ error: 'Unknown voice' }, 422);
        const O = await getJson(env, 'outreach', {}), o = O[b.id] = O[b.id] || {};
        for (const k of OFIELDS) if (b[k] !== undefined) { const nv = String(b[k] || '').trim().slice(0, k === 'notes' ? 4000 : 300); if ((o[k] || '') !== nv) { if (k !== 'notes') olog(o, 'edit', k + ': ' + (o[k] || '–') + ' → ' + (nv || '–')); else olog(o, 'edit', 'notes changed'); } o[k] = nv; }
        if (b.status !== undefined && OSTAT.includes(b.status) && (o.status || '') !== b.status) { olog(o, 'edit', 'status: ' + (o.status || 'not contacted') + ' → ' + (b.status || 'not contacted')); o.status = b.status; }
        if (b.log) { olog(o, b.log.via || '', b.log.what || ''); if (!o.status) { o.status = 'contacted'; olog(o, 'system', 'status: not contacted → contacted'); } if (b.log.sent) { o.sent = (o.sent || 0) + 1; delete o.plan; } }
        await putJson(env, 'outreach', O); return J({ ok: true, outreach: o }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/responses') return J({ responses: await getJson(env, 'responses', []) }, 200, { 'cache-control': 'no-store' });
      if (p === '/api/admin/response' && req.method === 'POST') { const b = await req.json(); const R = await getJson(env, 'responses', []), x = R.find(r => r.id === b.id); if (!x) return J({ error: 'Not found' }, 404); x.handled = b.handled !== false; x.handled_at = new Date().toISOString(); await putJson(env, 'responses', R); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/response/log' && req.method === 'POST') { const b = await req.json(); const r = await recordResponse(env, b.voice_id, b); return J(r, r.error ? 422 : 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/outreach/settings' && req.method === 'POST') { const b = await req.json(); const a = String(b.alert || '').trim().slice(0, 200); if (a && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)) return J({ error: 'That alert address does not look like an email address' }, 422); await putJson(env, 'outreach_settings', { alert: a, at: new Date().toISOString() }); return J({ ok: true }, 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/outreach/plan' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J(await planOutreach(env, b), 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/freeze' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J(await freezeQuiet(env, b.dry === true), 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/probe' && req.method === 'POST') {
        // Media check: what this server actually gets from a feed or page address. Admin only, nothing is stored.
        const b = await req.json(); const urls = (b.urls || []).slice(0, 12), ua = b.ua === 'browser' ? { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en' } : BOT;
        const out = await Promise.all(urls.map(async x => {
          try {
            const r = await fetch(x, { headers: ua, redirect: 'follow' }), t = await r.text(), ty = r.headers.get('content-type') || '';
            const items = looksLikeFeed(t) ? parseFeed(t) : [], newest = items.map(i => i.date || '').filter(Boolean).map(d => { try { return new Date(d).toISOString(); } catch { return ''; } }).sort().pop() || '';
            const ch = (t.match(/"channelId":"(UC[\w-]{22})"/) || t.match(/channel\/(UC[\w-]{22})/) || [])[1] || '';
            return { url: x, status: r.status, final: r.url, type: ty.split(';')[0], feed: items.length > 0, n: items.length, newest, title: ((t.match(/<title[^>]*>([^<]{0,140})/i) || [])[1] || '').trim(), channel_id: ch, alt: (discoverFeed(t, r.url) || '') };
          } catch (e) { return { url: x, error: String(e).slice(0, 120) }; }
        }));
        return J({ results: out }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/outreach/find' && req.method === 'POST') { const b = await req.json().catch(() => ({})); return J(await contactBatch(env, b.ids, getOk, b.force === true && Array.isArray(b.ids) && b.ids.length <= 3), 200, { 'cache-control': 'no-store' }); }
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
        const rec = { id, slug: slug(b.slug || b.name), name: b.name, short_bio: b.short_bio || '', bio: String(b.bio || '').slice(0, 2000), avatar: b.avatar || '', website: b.website || '', topics: b.topics || [], position_tag: b.position_tag || '', status: b.status || 'pending', listed_on: b.status === 'listed' ? (voices[i]?.listed_on || new Date().toISOString().slice(0, 10)) : '', consent: { excerpt_ok: b.consent?.excerpt_ok !== false, full_text_ok: b.consent?.full_text_ok === true, date: b.consent?.date || '', note: b.consent?.note || '' } };
        if (i >= 0) voices[i] = { ...voices[i], ...rec }; else voices.push(rec);
        await putJson(env, 'voices', voices); return J({ ok: true, voice: rec }, 200, { 'cache-control': 'no-store' });
      }
      if (p === '/api/admin/import' && req.method === 'POST') {
        const b = await req.json(); const feeds = await listFeeds(env); let nv = 0, nf = 0;
        for (const x of (b.voices || []).slice(0, 200)) {
          if (!x.name) continue; const id = slug(x.name); const i = voices.findIndex(v => v.id === id);
          const rec = { id, slug: id, name: String(x.name).slice(0, 120), short_bio: String(x.short_bio || '').slice(0, 300), avatar: x.avatar || (i >= 0 ? voices[i].avatar || '' : ''), website: humanUrl(x.website || ''), topics: x.topics || [], position_tag: x.position_tag || '', status: i >= 0 ? voices[i].status : 'pending', listed_on: i >= 0 ? voices[i].listed_on : '', consent: i >= 0 ? voices[i].consent : { excerpt_ok: true, full_text_ok: false, date: '', note: 'Candidate. Not contacted yet.' } };
          if (i >= 0) voices[i] = { ...voices[i], ...rec }; else { voices.push(rec); nv++; }
          for (const c of (x.channels || [])) {
            const fid = slug(id + '-' + c.section + '-' + (c.feed || c.external_id || c.site || '').slice(-14));
            if (feeds.some(f => f.id === fid)) continue;
            const kind = c.kind || ({ substack: 'newsletter', blog: 'blog', oped: 'oped', editorial: 'editorial', podcast: 'podcast', vlog: 'vlog' }[c.section] || 'blog');
            feeds.push({ id: fid, voice_id: id, kind, section: c.section, url: c.feed || '', external_id: c.external_id || '', site: c.site || '', term: c.term || '', format: feedFormat(kind), status: 'active', error_count: 0, unverified: true }); nf++;
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
        for (const v of voices) if (v.status !== 'listed' && v.status !== 'removed' && v.status !== 'frozen') { v.status = 'listed'; v.listed_on = day; v.consent = { ...(v.consent || {}), excerpt_ok: true, full_text_ok: false, note: ((v.consent && v.consent.note) || '') + ' Listed in bulk ' + day + ' on public feeds. Link-out and excerpts only. Opt-out honored within 48 hours.' }; n++; }
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
      if (p === '/api/admin/digest') { const q = u.searchParams; if (q.get('log')) return J(JSON.parse((await env.STORE.get('digest_log')) || '{"note":"no digest has been sent yet"}'), 200, { 'cache-control': 'no-store' }); if (q.get('test')) return J(await runDigest(env, { force: true, testTo: env.NOTIFY_TO || 'rkoret@gmail.com' }), 200, { 'cache-control': 'no-store' }); return J(await runDigest(env, { force: true, previewOnly: true }), 200, { 'cache-control': 'no-store' }); }
      if (p === '/api/admin/ingest' && req.method === 'POST') return J(await runIngest(env), 200, { 'cache-control': 'no-store' });
    }
    return J({ error: 'not found' }, 404);
  },
  async scheduled(_evt, env, ctx) { ctx.waitUntil(runDigest(env).catch(() => { })); ctx.waitUntil((async () => { await runIngest(env); if (new Date().getUTCHours() === 3) { try { await freezeQuiet(env); } catch { /* tomorrow */ } } for (const f of [resolveBatch, avatarBatch, discoverBatch]) { try { await f(env); } catch { /* next hour */ } } })()); },
};

// Edge cache for the public read endpoints. Visitors get a stored copy at once, and any copy older than 45 seconds is rebuilt in the background.
const CACHEABLE = /^\/api\/(items|voices|voice\/[^/]+|taxonomy|nowlej|rss)$/;
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method !== 'GET' || !CACHEABLE.test(u.pathname) || typeof caches === 'undefined') return W.route(req, env, ctx);
    const cache = caches.default, ck = new Request(u.origin + u.pathname + u.search);
    const pub = h => { h.set('cache-control', 'public, max-age=60, stale-while-revalidate=300'); return h; };
    const build = async () => {
      const r = await W.route(req, env, ctx);
      if (r.status !== 200) return r;
      const body = await r.arrayBuffer(), h = new Headers(r.headers);
      try { const sh = new Headers(h); sh.set('cache-control', 'public, max-age=300'); sh.set('x-built', String(Date.now())); await cache.put(ck, new Response(body, { status: 200, headers: sh })); } catch { /* cache unavailable */ }
      return new Response(body, { status: 200, headers: pub(h) });
    };
    let hit = null; try { hit = await cache.match(ck); } catch { /* none */ }
    if (hit) {
      if (Date.now() - Number(hit.headers.get('x-built') || 0) > 45000) ctx.waitUntil(build().catch(() => { }));
      return new Response(hit.body, { status: 200, headers: pub(new Headers(hit.headers)) });
    }
    return build();
  },
  scheduled(evt, env, ctx) { return W.scheduled(evt, env, ctx); },
};
