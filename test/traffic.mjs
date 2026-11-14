import assert from 'node:assert';
import { traffic, shapeDaily, SITES } from '../cfstats.js';

// no token: friendly setup message, no network
let r = await traffic({}, 'insider', 7);
assert.ok(r.setup && /CF_API_TOKEN/.test(r.error));
assert.equal((await traffic({ CF_API_TOKEN: 'x' }, 'nope', 7)).error, 'Unknown site');
assert.equal(SITES.nowlej, 'israelnowlej.com');

// shape daily rows
const s = shapeDaily([
  { dimensions: { date: '2026-11-13' }, sum: { requests: 100, pageViews: 40, bytes: 5000, cachedRequests: 60, threats: 2, countryMap: [{ clientCountryName: 'US', requests: 70 }, { clientCountryName: 'IL', requests: 30 }], responseStatusMap: [{ edgeResponseStatus: 200, requests: 90 }, { edgeResponseStatus: 404, requests: 10 }], browserMap: [{ uaBrowserFamily: 'Chrome', pageViews: 30 }] }, uniq: { uniques: 25 } },
  { dimensions: { date: '2026-11-14' }, sum: { requests: 50, pageViews: 20, bytes: 1000, cachedRequests: 10, threats: 0, countryMap: [{ clientCountryName: 'US', requests: 50 }], responseStatusMap: [{ edgeResponseStatus: 200, requests: 50 }], browserMap: [{ uaBrowserFamily: 'Chrome', pageViews: 20 }] }, uniq: { uniques: 15 } },
]);
assert.equal(s.totals.requests, 150); assert.equal(s.totals.visitors, 40); assert.equal(s.countries.US, 120); assert.equal(s.browsers.Chrome, 50);

// full call with a mocked Cloudflare
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  const ok = b => new Response(JSON.stringify(b), { status: 200 });
  if (String(url).includes('/zones?name=')) return ok({ success: true, result: [{ id: 'zone1' }] });
  const q = JSON.parse(init.body).query;
  if (q.includes('httpRequests1dGroups')) return ok({ success: true, data: { viewer: { zones: [{ days: [{ dimensions: { date: '2026-11-14' }, sum: { requests: 10, pageViews: 4, bytes: 100, cachedRequests: 5, threats: 0, countryMap: [{ clientCountryName: 'IL', requests: 10 }], responseStatusMap: [], browserMap: [] }, uniq: { uniques: 3 } }] }] } } });
  return ok({ success: true, data: { viewer: { zones: [{ paths: [{ count: 9, dimensions: { clientRequestPath: '/' } }], refs: [{ count: 4, dimensions: { clientRefererHost: 'google.com' } }] }] } } });
};
r = await traffic({ CF_API_TOKEN: 'tok' }, 'nowlej', 7);
assert.equal(r.totals.pageViews, 4); assert.equal(r.totals.cacheRate, 0.5); assert.equal(r.paths[0].name, '/'); assert.equal(r.referrers[0].name, 'google.com'); assert.equal(r.domain, 'israelnowlej.com');
console.log('traffic ok');
