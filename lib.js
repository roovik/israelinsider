// Feed parsing and normalization for Israel Insider. No dependencies, runs in Workers and Node.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
function unwrap(s) {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1] : decode(s);
}
export function stripHtml(s) {
  return decode(String(s || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
export function excerpt(s, max = 300) {
  const t = stripHtml(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '...';
}
function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = []; let m; while ((m = re.exec(xml))) out.push(m[1]); return out;
}
function tag(xml, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? unwrap(m[1]).trim() : '';
}
function attr(xml, name, a) {
  const m = new RegExp(`<${name}\\b([^>]*)/?>`, 'i').exec(xml);
  if (!m) return '';
  const am = new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"|\\b${a}\\s*=\\s*'([^']*)'`, 'i').exec(m[1]);
  return am ? decode(am[1] ?? am[2]) : '';
}
export function parseDuration(s) {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return +s;
  const p = s.split(':').map(Number);
  if (p.some(isNaN)) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
export function canonicalUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString();
  } catch { return u; }
}
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
}
// Parse RSS 2.0 or Atom into raw entries.
export function parseFeed(xml) {
  const items = [];
  const rss = blocks(xml, 'item');
  if (rss.length) {
    for (const it of rss) {
      const enc = attr(it, 'enclosure', 'url');
      const encType = attr(it, 'enclosure', 'type');
      items.push({
        guid: tag(it, 'guid') || tag(it, 'link'),
        title: stripHtml(tag(it, 'title')),
        link: tag(it, 'link'),
        date: tag(it, 'pubDate') || tag(it, 'dc:date'),
        author: stripHtml(tag(it, 'dc:creator') || tag(it, 'author')),
        desc: tag(it, 'description') || tag(it, 'itunes:summary'),
        encoded: tag(it, 'content:encoded'),
        audio: /audio/i.test(encType) || /\.(mp3|m4a|aac|ogg)(\?|$)/i.test(enc) ? enc : '',
        duration: parseDuration(tag(it, 'itunes:duration')),
        thumb: attr(it, 'itunes:image', 'href') || attr(it, 'media:thumbnail', 'url') || (/image/i.test(encType) ? enc : ''),
      });
    }
    return items;
  }
  for (const e of blocks(xml, 'entry')) {
    const alt = /<link\b[^>]*rel="alternate"[^>]*>/i.exec(e) || /<link\b[^>]*>/i.exec(e);
    const href = alt ? (/href="([^"]*)"/i.exec(alt[0]) || [])[1] : '';
    items.push({
      guid: tag(e, 'id') || href,
      title: stripHtml(tag(e, 'title')),
      link: decode(href || ''),
      date: tag(e, 'published') || tag(e, 'updated'),
      author: stripHtml(tag(e.match(/<author>[\s\S]*?<\/author>/i)?.[0] || '', 'name')),
      desc: tag(e, 'media:description') || tag(e, 'summary') || tag(e, 'content'),
      encoded: '',
      audio: '',
      duration: 0,
      thumb: attr(e, 'media:thumbnail', 'url'),
      videoId: tag(e, 'yt:videoId'),
    });
  }
  return items;
}
// Turn raw entries into Item records for a feed. Never stores full text unless allowed.
export async function toItems(feed, voice, raw, now = Date.now()) {
  const out = [];
  for (const r of raw) {
    const url = canonicalUrl(r.link || r.guid);
    if (!url || !r.title) continue;
    const t = Date.parse(r.date);
    const published = isNaN(t) ? now : Math.min(t, now);
    const full = voice?.consent?.full_text_ok === true;
    const src = r.desc || r.encoded;
    const item = {
      id: await sha(feed.id + '|' + (r.guid || url)),
      voice_id: voice.id, feed_id: feed.id, format: feed.format,
      title: r.title, url, published_at: new Date(published).toISOString(),
      excerpt: excerpt(src, 300),
      thumbnail_url: r.thumb || '',
      duration_seconds: r.duration || 0,
      audio_url: feed.format === 'listen' ? r.audio : '',
      embed_id: feed.kind === 'youtube' ? (r.videoId || '') : '',
      topics: voice.topics || [],
      hidden: false, featured: false,
    };
    if (full && r.encoded) item.full_text = r.encoded;
    out.push(item);
  }
  return out;
}
export function feedFormat(kind) {
  return { blog: 'read', newsletter: 'read', podcast: 'listen', youtube: 'watch', x: 'social', bluesky: 'social', threads: 'social', telegram: 'social' }[kind] || 'read';
}
export function youtubeFeedUrl(channelId) { return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`; }
export function toRss(items, title, site) {
  const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>${e(title)}</title><link>${e(site)}</link><description>${e(title)}</description>` +
    items.map(i => `<item><title>${e(i.title)}</title><link>${e(i.url)}</link><guid>${e(i.id)}</guid><pubDate>${new Date(i.published_at).toUTCString()}</pubDate><description>${e(i.excerpt)}</description></item>`).join('') + '</channel></rss>';
}
