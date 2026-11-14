// Traffic numbers for the admin dashboards. Reads Cloudflare's own edge analytics through the GraphQL API.
// Needs one Worker secret, CF_API_TOKEN, a read-only API token with Zone > Analytics > Read and Zone > Zone > Read.
// The same file is used by israelinsider.org and israelnowlej.com, so one token serves both sites.
const API = 'https://api.cloudflare.com/client/v4';
export const SITES = { nowlej: 'israelnowlej.com', insider: 'israelinsider.org' };
const zones = {};
const accts = {};
const memo = {};

async function cf(token, path, init) {
  const r = await fetch(API + path, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
  let j = null;
  try { j = await r.json(); } catch { }
  if (!r.ok || !j || j.success === false) {
    const m = (j && j.errors && j.errors[0] && j.errors[0].message) || ('HTTP ' + r.status);
    throw new Error(m);
  }
  return j;
}

async function zoneId(token, domain) {
  if (zones[domain]) return zones[domain];
  const j = await cf(token, '/zones?name=' + encodeURIComponent(domain));
  const z = j.result && j.result[0];
  if (!z) throw new Error('This token cannot see the zone ' + domain + '. Give it access to that zone.');
  zones[domain] = z.id; accts[domain] = z.account && z.account.id;
  return z.id;
}

async function gql(token, query, variables) {
  const j = await cf(token, '/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  const body = j;
  if (body.errors && body.errors.length) throw new Error(body.errors[0].message);
  return body.data;
}

const day = d => d.toISOString().slice(0, 10);
const addTo = (map, key, n) => { if (key == null || key === '') key = 'Unknown'; map[key] = (map[key] || 0) + (n || 0); };
const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

const DAILY = `query($z:string!,$s:Date!,$e:Date!){viewer{zones(filter:{zoneTag:$z}){
  days:httpRequests1dGroups(limit:120,filter:{date_geq:$s,date_leq:$e},orderBy:[date_ASC]){
    dimensions{date}
    sum{requests pageViews bytes cachedRequests threats countryMap{clientCountryName requests} responseStatusMap{edgeResponseStatus requests} browserMap{uaBrowserFamily pageViews}}
    uniq{uniques}
  }}}}`;

const PATHS = `query($z:string!,$a:Time!,$b:Time!){viewer{zones(filter:{zoneTag:$z}){
  paths:httpRequestsAdaptiveGroups(limit:15,filter:{datetime_geq:$a,datetime_leq:$b,requestSource:"eyeball",edgeResponseContentTypeName:"html",edgeResponseStatus:200},orderBy:[count_DESC]){count dimensions{clientRequestPath}}
}}}`;
const REFS = `query($z:string!,$a:Time!,$b:Time!){viewer{zones(filter:{zoneTag:$z}){
  refs:httpRequestsAdaptiveGroups(limit:15,filter:{datetime_geq:$a,datetime_leq:$b,requestSource:"eyeball",edgeResponseContentTypeName:"html",edgeResponseStatus:200,clientRefererHost_neq:""},orderBy:[count_DESC]){count dimensions{clientRefererHost}}
}}}`;

// Cloudflare Web Analytics (free on every plan). Used only when the edge table is restricted. Needs Account > Account Analytics > Read on the token and Web Analytics switched on for the site.
const RUM = (dim) => `query($c:string!,$a:Time!,$b:Time!,$h:string!){viewer{accounts(filter:{accountTag:$c}){
  rows:rumPageloadEventsAdaptiveGroups(limit:15,filter:{datetime_geq:$a,datetime_leq:$b,requestHost:$h,bot:0},orderBy:[count_DESC]){count dimensions{${dim}}}
}}}`;

export function shapeDaily(rows) {
  const out = { daily: [], totals: { requests: 0, pageViews: 0, bytes: 0, cached: 0, threats: 0, visitors: 0 }, countries: {}, statuses: {}, browsers: {} };
  for (const g of rows || []) {
    const s = g.sum || {}, u = (g.uniq || {}).uniques || 0;
    out.daily.push({ date: g.dimensions.date, requests: s.requests || 0, pageViews: s.pageViews || 0, visitors: u });
    out.totals.requests += s.requests || 0; out.totals.pageViews += s.pageViews || 0; out.totals.bytes += s.bytes || 0;
    out.totals.cached += s.cachedRequests || 0; out.totals.threats += s.threats || 0; out.totals.visitors += u;
    for (const c of s.countryMap || []) addTo(out.countries, c.clientCountryName, c.requests);
    for (const c of s.responseStatusMap || []) addTo(out.statuses, String(c.edgeResponseStatus), c.requests);
    for (const c of s.browserMap || []) addTo(out.browsers, c.uaBrowserFamily, c.pageViews);
  }
  return out;
}

export async function traffic(env, site, daysIn) {
  const domain = SITES[site];
  if (!domain) return { error: 'Unknown site' };
  if (!env.CF_API_TOKEN) return { setup: true, error: 'CF_API_TOKEN is not set yet. In Cloudflare, create an API token with Zone Analytics Read and Zone Read, then add it to this Worker as a secret named CF_API_TOKEN.' };
  const days = Math.max(1, Math.min(90, parseInt(daysIn, 10) || 7));
  const mk = site + ':' + days;
  if (memo[mk] && Date.now() - memo[mk].t < 5 * 60 * 1000) return memo[mk].v;
  const token = env.CF_API_TOKEN;
  try {
    const z = await zoneId(token, domain);
    const end = new Date(), start = new Date(end.getTime() - (days - 1) * 86400000);
    const d1 = await gql(token, DAILY, { z, s: day(start), e: day(end) });
    const shaped = shapeDaily((((d1 || {}).viewer || {}).zones || [{}])[0].days);
    const res = {
      site, domain, days, updated: new Date().toISOString(),
      totals: { ...shaped.totals, cacheRate: shaped.totals.requests ? shaped.totals.cached / shaped.totals.requests : 0, avgVisitors: shaped.daily.length ? Math.round(shaped.totals.visitors / shaped.daily.length) : 0 },
      daily: shaped.daily, countries: top(shaped.countries, 12), statuses: top(shaped.statuses, 8), browsers: top(shaped.browsers, 8),
      paths: [], referrers: [], pagesNote: '', refNote: '',
    };
    // Pages and referrers come from a finer table that some plans keep briefly or restrict by field, so each is fetched on its own: try a week, fall back to one day.
    const part = async (query, key, dim, noteKey, label) => {
      let last = '';
      for (const hrs of [Math.min(days, 7) * 24, 24]) {
        try {
          const b = new Date(), a = new Date(b.getTime() - hrs * 3600000);
          const d2 = await gql(token, query, { z, a: a.toISOString(), b: b.toISOString() });
          const zz = (((d2 || {}).viewer || {}).zones || [{}])[0];
          return { rows: (zz[key] || []).map(x => ({ name: x.dimensions[dim], count: x.count })), note: hrs >= 48 ? 'Last ' + Math.round(hrs / 24) + ' days' : 'Last 24 hours' };
        } catch (e) { last = label + ' is not available on this Cloudflare plan or token.'; }
      }
      // fall back to Web Analytics page loads, if the token and the site allow it
      try {
        const acc = accts[domain];
        if (!acc) throw new Error('no account');
        const b = new Date(), a = new Date(b.getTime() - Math.min(days, 7) * 86400000);
        const rdim = key === 'paths' ? 'requestPath' : 'refererHost';
        const d3 = await gql(token, RUM(rdim), { c: acc, a: a.toISOString(), b: b.toISOString(), h: domain });
        const rr = ((((d3 || {}).viewer || {}).accounts || [{}])[0].rows || []).filter(x => x.dimensions[rdim]);
        if (rr.length) return { rows: rr.map(x => ({ name: x.dimensions[rdim], count: x.count })), note: 'Last ' + Math.min(days, 7) + ' days, from Web Analytics' };
        last = label + ': Web Analytics has no data yet. Switch it on for this site in Cloudflare.';
      } catch (e2) { last = label + ' is not on this plan. Switch on Web Analytics (free) and add Account Analytics Read to the token.'; }
      return { rows: [], note: last };
    };
    const [pg, rf] = await Promise.all([part(PATHS, 'paths', 'clientRequestPath', 'pagesNote', 'Top pages'), part(REFS, 'refs', 'clientRefererHost', 'refNote', 'Referrer data')]);
    res.paths = pg.rows; res.pagesNote = pg.note; res.referrers = rf.rows; res.refNote = rf.note;
    memo[mk] = { t: Date.now(), v: res };
    return res;
  } catch (e) {
    return { error: String(e.message || e).slice(0, 300) };
  }
}
