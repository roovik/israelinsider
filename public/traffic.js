/* Traffic dashboard. Used by the Israel Insider admin and by the Israel NOWlej admin, identical in both.
   TrafficUI.mount(element, { get: function (site, days) { return Promise<json> } }) */
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { n = n || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n); };
  var bytes = function (b) { b = b || 0; return b >= 1e12 ? (b / 1e12).toFixed(1) + ' TB' : b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.round(b / 1e3) + ' KB'; };
  var CSS = '.tr{font:15px/1.45 system-ui,sans-serif;color:#14213d}.tr .bar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.tr button{font:600 14px system-ui;min-height:38px;padding:0 14px;border-radius:4px;border:1px solid #14213d;background:#fff;color:#14213d;cursor:pointer}.tr button.on{background:#14213d;color:#fff}.tr .sp{flex:1}' +
    '.tr .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:8px 0 14px}.tr .k{background:#fff;border:1px solid #d9d2bd;border-radius:6px;padding:10px 12px}.tr .k b{display:block;font-size:26px;line-height:1.1}.tr .k span{font-size:12px;color:#46536c}' +
    '.tr .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.tr .c{background:#fff;border:1px solid #d9d2bd;border-radius:6px;padding:10px 12px;margin:0 0 12px}.tr h3{margin:0 0 6px;font-size:15px}.tr .sm{font-size:12px;color:#46536c}' +
    '.tr table{width:100%;border-collapse:collapse;font-size:14px}.tr td{padding:4px 0;border-top:1px solid #eee;vertical-align:top;word-break:break-word}.tr td.n{text-align:right;white-space:nowrap;padding-left:10px;font-variant-numeric:tabular-nums}.tr .msg{padding:10px;border-radius:4px;margin:10px 0;background:#fde8e8}.tr .tip{background:#eef3fb;border-radius:4px;padding:8px 10px;font-size:13px;margin:8px 0}' +
    '.tr .sb{display:flex;align-items:baseline;gap:12px;color:#fff;padding:10px 14px;border-radius:4px;margin:0 0 10px}.tr .sb b{font-size:18px}.tr .sb span{font-size:13px;opacity:.85}.tr .lg{font-size:12px;color:#46536c;margin:4px 0}.tr .lg i{display:inline-block;width:10px;height:10px;margin:0 4px 0 10px;vertical-align:baseline}';
  var PAL = { nowlej: { name: 'Israel NOWlej', a: '#14213d', b: '#d8a31a' }, insider: { name: 'Israel Insider', a: '#3d6fa3', b: '#ed702c' } };
  function chart(d, p) {
    p = p || PAL.nowlej;
    if (!d.length) return '<p class="sm">No data for this range yet.</p>';
    var W = 760, H = 190, L = 40, B = 24, T = 8, n = d.length, mx = 1;
    d.forEach(function (x) { if (x.pageViews > mx) mx = x.pageViews; if (x.visitors > mx) mx = x.visitors; });
    var pw = (W - L) / n, bw = Math.max(2, pw * 0.38), s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Daily visitors and page views">';
    [0, .5, 1].forEach(function (f) { var y = T + (H - T - B) * (1 - f); s += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e5e0cf"/><text x="' + (L - 4) + '" y="' + (y + 4) + '" font-size="10" text-anchor="end" fill="#46536c">' + num(Math.round(mx * f)) + '</text>'; });
    d.forEach(function (x, i) {
      var x0 = L + i * pw + pw * 0.1, hv = (H - T - B) * x.visitors / mx, hp = (H - T - B) * x.pageViews / mx;
      s += '<rect x="' + x0 + '" y="' + (H - B - hp) + '" width="' + bw + '" height="' + hp + '" fill="'+p.b+'"><title>' + esc(x.date) + ': ' + x.pageViews + ' page views</title></rect>';
      s += '<rect x="' + (x0 + bw + 1) + '" y="' + (H - B - hv) + '" width="' + bw + '" height="' + hv + '" fill="'+p.a+'"><title>' + esc(x.date) + ': ' + x.visitors + ' visitors</title></rect>';
      if (n <= 14 || i % Math.ceil(n / 10) === 0) s += '<text x="' + (x0 + bw) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#46536c">' + esc(x.date.slice(5)) + '</text>';
    });
    return s + '</svg><div class="lg"><i style="background:' + p.a + '"></i>Visitors<i style="background:' + p.b + '"></i>Page views</div>';
  }
  function tbl(rows, empty) {
    return rows && rows.length ? '<table>' + rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="n">' + num(r.count) + '</td></tr>'; }).join('') + '</table>' : '<p class="sm">' + esc(empty || 'Nothing to show.') + '</p>';
  }
  function view(d) {
    if (d.error) return '<div class="msg">' + esc(d.error) + '</div>' + (d.setup ? '<div class="tip"><b>Setup, about three minutes.</b> 1) Cloudflare dashboard, My Profile, API Tokens, Create Token, Custom token. 2) Permissions: Zone, Analytics, Read and Zone, Zone, Read. 3) Zone Resources: include both israelnowlej.com and israelinsider.org. 4) Add the token to each Worker under Settings, Variables and Secrets as <code>CF_API_TOKEN</code>. Reload this page.</div>' : '');
    var P = PAL[d.site] || PAL.nowlej, t = d.totals, bots = (d.statuses || []).filter(function (x) { return /^4|^5/.test(x.name); }).reduce(function (a, x) { return a + x.count; }, 0);
    var k = [[num(t.avgVisitors), 'Visitors per day, average'], [num(t.pageViews), 'Page views'], [num(t.requests), 'Requests, all'], [bytes(t.bytes), 'Data served'], [Math.round(t.cacheRate * 100) + '%', 'Served from cache'], [num(t.threats), 'Threats blocked'], [num(bots), 'Error responses (4xx, 5xx)']];
    return '<div class="sb" style="border-left:8px solid ' + P.b + ';background:' + P.a + '"><b>' + esc(P.name) + '</b><span>' + esc(d.domain) + '</span></div><div class="kpis">' + k.map(function (x) { return '<div class="k"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="c"><h3>Daily traffic, last ' + d.days + ' days</h3>' + chart(d.daily, P) + '</div>' +
      '<div class="grid"><div class="c"><h3>Top countries</h3>' + tbl(d.countries) + '</div><div class="c"><h3>Top pages</h3>' + tbl(d.paths, d.pagesNote || 'Not available.') + (d.paths && d.paths.length ? '<p class="sm">' + esc(d.pagesNote || '') + '</p>' : '') + '</div>' +
      '<div class="c"><h3>Where visitors come from</h3>' + tbl(d.referrers, d.refNote || 'Not available.') + (d.referrers && d.referrers.length ? '<p class="sm">' + esc(d.refNote || '') + '</p>' : '') + '</div><div class="c"><h3>Browsers, by page views</h3>' + tbl(d.browsers) + '</div><div class="c"><h3>Response codes</h3>' + tbl(d.statuses) + '</div></div>' +
      '<p class="sm">Source: Cloudflare edge analytics for ' + esc(d.domain) + '. Updated ' + esc(d.updated.slice(0, 16).replace('T', ' ')) + ' UTC. Cloudflare counts visits to the page itself, so single-page sites such as Israel Insider show section clicks inside the page as one visit.</p>';
  }
  function compare(a, b) {
    if (a.error || b.error) return view(a.error ? a : b);
    var rows = [['Visitors per day, average', function (t) { return num(t.avgVisitors); }], ['Page views', function (t) { return num(t.pageViews); }], ['Requests, all', function (t) { return num(t.requests); }], ['Data served', function (t) { return bytes(t.bytes); }], ['Served from cache', function (t) { return Math.round(t.cacheRate * 100) + '%'; }], ['Threats blocked', function (t) { return num(t.threats); }]];
    var pa = PAL[a.site], pb = PAL[b.site];
    return '<div class="c"><h3>Both sites, last ' + a.days + ' days</h3><table><tr><td></td><td class="n" style="color:' + pa.b + '"><b>' + esc(pa.name) + '</b></td><td class="n" style="color:' + pb.b + '"><b>' + esc(pb.name) + '</b></td></tr>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="n">' + r[1](a.totals) + '</td><td class="n">' + r[1](b.totals) + '</td></tr>'; }).join('') + '</table></div>' +
      '<div class="grid"><div class="c"><h3 style="color:' + pa.b + '">' + esc(pa.name) + ', daily</h3>' + chart(a.daily, pa) + '</div><div class="c"><h3 style="color:' + pb.b + '">' + esc(pb.name) + ', daily</h3>' + chart(b.daily, pb) + '</div></div>' +
      '<div class="grid"><div class="c"><h3>Top countries, ' + esc(pa.name) + '</h3>' + tbl(a.countries) + '</div><div class="c"><h3>Top countries, ' + esc(pb.name) + '</h3>' + tbl(b.countries) + '</div></div>';
  }
  function mount(el, o) {
    var st = { site: o.site || 'nowlej', days: 7 };
    if (!document.getElementById('trcss')) { var s = document.createElement('style'); s.id = 'trcss'; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = '<div class="tr"><div class="bar" id="trs"></div><div class="bar" id="trd"></div><div id="trb"></div></div>';
    function bar() {
      el.querySelector('#trs').innerHTML = [['nowlej', 'Israel NOWlej'], ['insider', 'Israel Insider'], ['both', 'Both sites']].map(function (x) { return '<button data-s="' + x[0] + '"' + (st.site === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('');
      el.querySelector('#trd').innerHTML = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(function (x) { return '<button data-d="' + x[0] + '"' + (st.days === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '<span class="sp"></span><button data-r="1">Refresh</button>';
    }
    function load() {
      bar(); var b = el.querySelector('#trb'); b.innerHTML = '<p class="sm">Loading Cloudflare data...</p>';
      (st.site === 'both' ? Promise.all([o.get('nowlej', st.days), o.get('insider', st.days)]).then(function (r) { return compare(r[0], r[1]); }) : o.get(st.site, st.days).then(view)).then(function (h) { b.innerHTML = h; }).catch(function (e) { b.innerHTML = '<div class="msg">' + esc(e.message || 'Could not load') + '</div>'; });
    }
    el.addEventListener('click', function (e) {
      var s = e.target.dataset.s, d = e.target.dataset.d;
      if (s) st.site = s; else if (d) st.days = +d; else if (!e.target.dataset.r) return;
      load();
    });
    load();
  }
  window.TrafficUI = { mount: mount, view: view };
})();
