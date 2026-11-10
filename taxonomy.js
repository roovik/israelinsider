// Content taxonomy: categories, subcategories and tags. Editable in admin (stored in KV key "taxonomy").
// Items are classified at read time from their title, excerpt and the voice's topics.
export const DEFAULT_TAXONOMY = {
  cats: [
    { slug: 'security', name: 'Security & Defense', desc: 'The IDF, intelligence, terrorism, cyber and the threat from Iran.', kw: ['security', 'defense', 'defence'], subs: [
      { slug: 'idf', name: 'IDF & Military', kw: ['idf', 'army', 'military', 'soldier', 'reservist', 'air force', 'navy'] },
      { slug: 'intelligence', name: 'Intelligence', kw: ['mossad', 'shin bet', 'intelligence', 'espionage'] },
      { slug: 'terrorism', name: 'Terrorism', kw: ['terror', 'terrorism', 'hamas', 'hezbollah', 'houthi', 'islamic jihad'] },
      { slug: 'cyber', name: 'Cyber', kw: ['cyber', 'hacking', 'hackers'] },
      { slug: 'iran', name: 'Iran', kw: ['iran', 'iranian', 'tehran', 'nuclear program'] }] },
    { slug: 'politics', name: 'Politics & Diplomacy', desc: 'Israeli politics, relations with the United States and the region, and international law.', kw: ['politics', 'diplomacy', 'diplomatic'], subs: [
      { slug: 'israeli-politics', name: 'Israeli Politics', kw: ['knesset', 'prime minister', 'coalition', 'election', 'netanyahu'] },
      { slug: 'us-israel', name: 'US and Israel', kw: ['washington', 'white house', 'congress', 'u.s. israel', 'us-israel'] },
      { slug: 'abraham-accords', name: 'Abraham Accords', kw: ['abraham accords', 'normalization', 'saudi', 'uae', 'emirates', 'bahrain', 'morocco'] },
      { slug: 'un-and-law', name: 'UN and Law', kw: ['united nations', 'un general assembly', 'security council', 'icj', 'icc', 'international law'] }] },
    { slug: 'history', name: 'History & Land', desc: 'From the Bible to the present: the land, its wars and its cities.', kw: ['history', 'historical'], subs: [
      { slug: 'biblical-era', name: 'Biblical Era', kw: ['biblical', 'temple', 'david', 'solomon', 'archaeology', 'archaeological'] },
      { slug: 'mandate-era', name: 'Ottoman and Mandate Era', kw: ['ottoman', 'british mandate', 'mandate', 'balfour'] },
      { slug: 'wars', name: 'Wars and Peace', kw: ['1948', '1967', '1973', 'six-day war', 'six day war', 'yom kippur war', 'camp david', 'oslo'] },
      { slug: 'jerusalem', name: 'Jerusalem', kw: ['jerusalem', 'old city', 'temple mount', 'western wall'] },
      { slug: 'judea-samaria', name: 'Judea and Samaria', kw: ['judea', 'samaria', 'hebron', 'shiloh', 'settlement', 'settlements'] }] },
    { slug: 'culture', name: 'Society & Culture', desc: 'Arts, music, food, language and daily life.', kw: ['culture', 'society'], subs: [
      { slug: 'arts', name: 'Arts and Film', kw: ['film', 'cinema', 'art', 'artist', 'literature', 'novel', 'poet', 'theater', 'theatre'] },
      { slug: 'music', name: 'Music', kw: ['music', 'song', 'singer', 'concert'] },
      { slug: 'food', name: 'Food', kw: ['food', 'recipe', 'cuisine', 'restaurant', 'wine'] },
      { slug: 'language', name: 'Hebrew and Language', kw: ['hebrew', 'language', 'idiom', 'slang'] }] },
    { slug: 'faith', name: 'Faith & Zionism', desc: 'Jewish thought, practice and the Zionist idea.', kw: ['faith', 'religion'], subs: [
      { slug: 'judaism', name: 'Judaism', kw: ['judaism', 'torah', 'talmud', 'rabbi', 'shabbat', 'synagogue', 'jewish law'] },
      { slug: 'zionism', name: 'Zionism', kw: ['zionism', 'zionist', 'herzl', 'self-determination'] }] },
    { slug: 'business', name: 'Business & Tech', desc: 'The Israeli economy, startups, energy, water and agriculture.', kw: ['business', 'economy', 'economic'], subs: [
      { slug: 'startups', name: 'Startups and Tech', kw: ['startup', 'start-up', 'venture', 'tech', 'ai', 'artificial intelligence', 'unicorn'] },
      { slug: 'economy', name: 'Economy and Markets', kw: ['shekel', 'inflation', 'bank of israel', 'exports', 'stock', 'tase', 'gdp'] },
      { slug: 'energy-water', name: 'Energy and Water', kw: ['gas field', 'leviathan', 'desalination', 'solar', 'water', 'energy'] },
      { slug: 'agritech', name: 'Agritech', kw: ['agriculture', 'agritech', 'irrigation', 'farm', 'kibbutz'] }] },
    { slug: 'advocacy', name: 'Antisemitism & Advocacy', desc: 'Antisemitism, campus life, media coverage and boycotts.', kw: ['advocacy', 'hasbara'], subs: [
      { slug: 'antisemitism', name: 'Antisemitism', kw: ['antisemitism', 'anti-semitism', 'antisemitic', 'jew hatred'] },
      { slug: 'campus', name: 'Campus', kw: ['campus', 'university', 'students', 'sjp'] },
      { slug: 'media-bias', name: 'Media Coverage', kw: ['media bias', 'headline', 'coverage', 'journalist', 'press'] },
      { slug: 'boycotts', name: 'Boycotts', kw: ['bds', 'boycott', 'divestment', 'sanctions'] }] },
    { slug: 'diaspora', name: 'Diaspora & Aliyah', desc: 'Jewish life outside Israel and moving to Israel.', kw: ['diaspora'], subs: [
      { slug: 'aliyah', name: 'Aliyah', kw: ['aliyah', 'olim', 'immigrat', 'nefesh b'] },
      { slug: 'us-jewry', name: 'American Jewry', kw: ['american jews', 'american jewry', 'jewish federation', 'jewish community'] },
      { slug: 'europe-jewry', name: 'European Jewry', kw: ['european jews', 'france', 'germany', 'uk jews', 'jewish europe'] }] }
  ],
  tags: [
    { slug: 'gaza', name: 'Gaza', kw: ['gaza'] },
    { slug: 'hostages', name: 'Hostages', kw: ['hostage', 'hostages', 'abducted'] },
    { slug: 'iran', name: 'Iran', kw: ['iran', 'iranian'] },
    { slug: 'hezbollah', name: 'Hezbollah', kw: ['hezbollah', 'lebanon'] },
    { slug: 'ceasefire', name: 'Ceasefire', kw: ['ceasefire', 'truce'] },
    { slug: 'nuclear', name: 'Nuclear', kw: ['nuclear', 'enrichment'] },
    { slug: 'archaeology', name: 'Archaeology', kw: ['archaeology', 'archaeological', 'excavation'] },
    { slug: 'ai', name: 'AI', kw: ['artificial intelligence', ' ai '] },
    { slug: 'water', name: 'Water', kw: ['desalination', 'water'] },
    { slug: 'bds', name: 'BDS', kw: ['bds', 'boycott'] },
    { slug: 'unrwa', name: 'UNRWA', kw: ['unrwa'] },
    { slug: 'saudi-arabia', name: 'Saudi Arabia', kw: ['saudi'] },
    { slug: 'turkey', name: 'Turkey', kw: ['turkey', 'erdogan'] },
    { slug: 'europe', name: 'Europe', kw: ['europe', 'european union', 'eu '] }
  ]
};

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mcache = new WeakMap();
function matcher(kws) {
  const parts = (kws || []).map(k => String(k).toLowerCase()).filter(Boolean).map(k => (k.startsWith(' ') || k.endsWith(' ')) ? esc(k) : '(?<![a-z0-9])' + esc(k) + 's?(?![a-z0-9])');
  return parts.length ? new RegExp(parts.join('|')) : null;
}
function compiled(tax) {
  let c = mcache.get(tax); if (c) return c;
  c = { cats: tax.cats.map(ct => ({ slug: ct.slug, m: matcher(ct.kw), subs: (ct.subs || []).map(s => ({ slug: s.slug, m: matcher(s.kw) })) })), tags: (tax.tags || []).map(t => ({ slug: t.slug, m: matcher(t.kw) })) };
  mcache.set(tax, c); return c;
}
const tslug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function classify(item, voice, tax) {
  const c = compiled(tax), text = ' ' + (item.title || '') + ' ' + (item.excerpt || '') + ' ';
  const lower = text.toLowerCase(), topics = ((voice && voice.topics) || []).map(tslug);
  const cats = new Set(), subs = new Set(), tags = new Set();
  for (const ct of c.cats) {
    if (topics.includes(ct.slug) || (ct.m && ct.m.test(lower))) cats.add(ct.slug);
    for (const s of ct.subs) if (s.m && s.m.test(lower)) { subs.add(s.slug); cats.add(ct.slug); }
  }
  for (const t of c.tags) if (t.m && t.m.test(lower)) tags.add(t.slug);
  for (const t of topics) if (t && !cats.has(t)) tags.add(t);
  return { cats: [...cats].slice(0, 3), subs: [...subs].slice(0, 4), tags: [...tags].slice(0, 6) };
}

// Counts and relations over classified items.
export function buildTaxonomy(tax, items) {
  const catN = {}, subN = {}, tagN = {}, catCat = {}, catTag = {}, tagTag = {}, tagCat = {};
  const bump = (m, a, b) => { (m[a] || (m[a] = {}))[b] = (m[a][b] || 0) + 1; };
  for (const i of items) {
    const cs = i.cats || [], ss = i.subs || [], ts = i.tags || [];
    cs.forEach(c => { catN[c] = (catN[c] || 0) + 1; cs.forEach(d => { if (d !== c) bump(catCat, c, d); }); ts.forEach(t => { bump(catTag, c, t); bump(tagCat, t, c); }); });
    ss.forEach(s => { subN[s] = (subN[s] || 0) + 1; });
    ts.forEach(t => { tagN[t] = (tagN[t] || 0) + 1; ts.forEach(u => { if (u !== t) bump(tagTag, t, u); }); });
  }
  const top = (m, k, n) => Object.entries(m[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
  const names = Object.fromEntries((tax.tags || []).map(t => [t.slug, t.name]));
  const tagList = Object.keys(tagN).map(s => ({ slug: s, name: names[s] || s.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase()), count: tagN[s], related_tags: top(tagTag, s, 6), related_cats: top(tagCat, s, 4) })).sort((a, b) => b.count - a.count);
  const cats = tax.cats.map(c => ({ slug: c.slug, name: c.name, desc: c.desc || '', count: catN[c.slug] || 0, subs: (c.subs || []).map(s => ({ slug: s.slug, name: s.name, count: subN[s.slug] || 0 })), related_cats: top(catCat, c.slug, 4), related_tags: top(catTag, c.slug, 8) }));
  return { cats, tags: tagList };
}

export function validTaxonomy(t) {
  if (!t || !Array.isArray(t.cats) || !t.cats.length || t.cats.length > 24) return 'cats must be a list of 1 to 24 categories';
  const seen = new Set();
  for (const c of t.cats) {
    if (!c.slug || !c.name || !/^[a-z0-9-]+$/.test(c.slug)) return 'every category needs a name and a slug of lowercase letters, numbers and hyphens';
    if (seen.has(c.slug)) return 'duplicate slug ' + c.slug; seen.add(c.slug);
    for (const s of (c.subs || [])) { if (!s.slug || !s.name || !/^[a-z0-9-]+$/.test(s.slug)) return 'every subcategory needs a name and a valid slug'; if (seen.has(s.slug)) return 'duplicate slug ' + s.slug; seen.add(s.slug); }
  }
  for (const g of (t.tags || [])) if (!g.slug || !g.name || !/^[a-z0-9-]+$/.test(g.slug)) return 'every tag needs a name and a valid slug';
  return '';
}
