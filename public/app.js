// Israel Insider front end. Hash routed, reads the JSON API, keeps one audio player alive across pages.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var initials = function (n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || '') ? u : '#'; };
  var TYPES = { read: 'Read', listen: 'Listen', watch: 'Watch', social: 'Social' };
  var ICON = {
    read: '<svg viewBox="0 0 24 24"><path d="M4 5h16v2H4zM4 9h16v2H4zM4 13h16v2H4zM4 17h10v2H4z"/></svg>',
    listen: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/></svg>',
    watch: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    social: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 4z"/></svg>'
  };
  var PLAY = '<span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>';

  function api(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function ago(iso) {
    var d = (Date.now() - Date.parse(iso)) / 1000;
    if (isNaN(d)) return '';
    if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' min ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    if (d < 86400 * 7) return Math.round(d / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d > 86400 * 300 ? 'numeric' : undefined });
  }
  function dur(s) {
    s = Math.round(s || 0); if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function mins(i) { return Math.max(1, Math.round((i.excerpt || '').split(/\s+/).length / 40)); }
  function empty(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }
  function sech(type, h, d, more) {
    var c = type ? ' ' + type : '';
    return '<div class="sech' + c + '"' + (type ? '' : ' style="--c:var(--ink)"') + '><h2' + (type ? '' : ' style="color:var(--ink)"') + '>' + esc(h) + '</h2><span class="d">' + esc(d || '') + '</span>' + (more ? '<a class="more" href="' + more[0] + '">' + esc(more[1]) + '</a>' : '') + '</div>';
  }
  function byline(i) {
    var v = i.voice || {};
    return '<span class="by"><span class="av">' + esc(initials(v.name)) + '</span><a href="#/voice/' + esc(v.slug) + '">' + esc(v.name) + '</a></span>';
  }
  function thumb(i, sq) {
    var v = i.voice || {};
    var img = i.thumbnail_url && /^https:/.test(i.thumbnail_url) ? '<img class="thumbimg" loading="lazy" alt="" src="' + esc(i.thumbnail_url) + '">' : '';
    return '<span class="mk">' + esc(initials(v.name)) + '</span>' + img;
  }
  function card(i) {
    var t = i.format, v = i.voice || {};
    if (t === 'read') {
      return '<article class="card read"><div class="bd"><span class="kick">' + esc(v.name) + '</span><h3><a href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">' + esc(i.title) + '</a></h3><p class="ex">' + esc(i.excerpt) + '</p><div class="meta">' + byline(i) + '<span>' + ago(i.published_at) + '</span><span>' + mins(i) + ' min read</span></div></div></article>';
    }
    if (t === 'listen') {
      return '<article class="card listen"><div class="art sq">' + thumb(i) + (i.duration_seconds ? '<span class="dur">' + dur(i.duration_seconds) + '</span>' : '') + '<button class="pl" type="button" data-play="' + esc(i.id) + '" aria-label="Play ' + esc(i.title) + '">' + PLAY + '</button></div><div class="bd"><span class="kick">' + esc(v.name) + '</span><h3>' + esc(i.title) + '</h3><div class="meta"><span>' + ago(i.published_at) + '</span><span>Audio</span></div></div></article>';
    }
    if (t === 'watch') {
      return '<article class="card watch"><div class="art" data-vid="' + esc(i.embed_id) + '">' + thumb(i) + (i.duration_seconds ? '<span class="dur">' + dur(i.duration_seconds) + '</span>' : '') + '<button class="pl" type="button" data-watch="' + esc(i.id) + '" aria-label="Watch ' + esc(i.title) + '">' + PLAY + '</button></div><div class="bd"><span class="kick">' + esc(v.name) + '</span><h3>' + esc(i.title) + '</h3><div class="meta"><span>' + ago(i.published_at) + '</span><span>Video</span></div></div></article>';
    }
    return '<article class="card social"><div class="post"><div class="by"><span class="av">' + esc(initials(v.name)) + '</span><span>' + esc(v.name) + '</span></div><p class="tx">' + esc(i.excerpt || i.title) + '</p><div class="meta"><span>' + ago(i.published_at) + '</span><a href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">Open original</a></div></div></article>';
  }
  function grid(items, cls) { return items.length ? '<div class="grid ' + (cls || 'g4') + '">' + items.map(card).join('') + '</div>' : ''; }
  function section(type, items, h, d, cls, limit) {
    return '<section class="sec ' + type + '">' + sech(type, h, d, ['#/' + type, 'All ' + h.toLowerCase()]) + (items.length ? grid(items.slice(0, limit || 4), cls) : empty('Nothing here yet.')) + '</section>';
  }

  var cache = {};
  var ITEMS = {};
  function remember(items) { items.forEach(function (i) { ITEMS[i.id] = i; }); return items; }
  function items(qs) { return api('/api/items?' + qs).then(function (r) { return remember(r.items); }); }

  var SIDE = null;
  function sideData() { if (!SIDE) SIDE = Promise.all([api('/api/items?limit=30'), api('/api/voices')]).then(function (a) { remember(a[0].items); return { items: a[0].items, voices: a[1].voices }; }); return SIDE; }
  function houseAd(slot, size) {
    return '<a class="adbox" data-slot="' + slot + '" style="' + size + '" href="https://israelinmaps.com" target="_blank" rel="noopener sponsored"><small>Advertisement</small><b>Israel\'s Story in Maps</b><span>Preview the book</span></a>';
  }
  function subForm(id) {
    return '<form class="subf" novalidate><input type="email" name="email" required autocomplete="email" aria-label="Email address" placeholder="you@example.com"><button class="btn" type="submit">Subscribe</button><label class="chk"><input type="checkbox" name="consent" value="1" required>Send me the Israel Insider digest by email. Unsubscribe any time.</label><div class="submsg" role="status"></div></form>';
  }
  function sideCol() {
    return sideData().then(function (d) {
      var latest = d.items.slice(0, 5).map(function (i) { return '<div class="rw"><span class="dot" style="background:var(--' + i.format + ')"></span><div><a href="' + (i.format === 'read' || i.format === 'social' ? esc(safeUrl(i.url)) + '" target="_blank" rel="noopener' : '#/' + i.format) + '">' + esc(i.title) + '</a><span class="meta">' + esc((i.voice || {}).name) + ' · ' + ago(i.published_at) + '</span></div></div>'; }).join('');
      var pod = d.items.filter(function (i) { return i.format === 'listen' && i.audio_url; })[0];
      var vl = d.voices.slice(0, 8).map(function (v) { return '<div class="rw"><span class="av">' + esc(initials(v.name)) + '</span><a href="#/voice/' + esc(v.slug) + '">' + esc(v.name) + '</a></div>'; }).join('');
      return '<aside class="side" aria-label="Widgets">' +
        '<div class="cta"><b>Have a voice on Israel?</b><span>Get your blog, podcast or channel listed.</span><a class="btn big" href="#/submit">Submit your feed</a></div>' +
        '<div class="panel subp"><h3>subscribe</h3><div class="pb"><span>The best new voices in your inbox.</span>' + subForm() + '<div class="rw"><a href="/api/rss">Or follow by RSS</a></div></div></div>' +
        '<div class="adslot" data-slot="rect-300x250">' + houseAd('rect-300x250', '') + '</div>' +
        (latest ? '<div class="panel"><h3>latest</h3><div class="pb">' + latest + '</div></div>' : '') +
        (pod ? '<div class="panel"><h3>listen now</h3><div class="pb"><span class="kick" style="color:var(--listen)">' + esc((pod.voice || {}).name) + '</span><b>' + esc(pod.title) + '</b><button class="btn sm" type="button" data-play="' + esc(pod.id) + '" style="background:var(--listen)">Play</button></div></div>' : '') +
        (vl ? '<div class="panel"><h3>voices</h3><div class="pb">' + vl + '<div class="rw"><a href="#/voices">All voices</a></div></div></div>' : '') +
        '<div class="panel"><h3>from israel nowlej</h3><div class="pb"><span>News, views, media and sources.</span><a class="btn line sm" href="https://israelnowlej.com" target="_blank" rel="noopener">Visit Israel NOWlej</a></div></div>' +
        '<div class="adslot" data-slot="rect-300x250-b"><a class="adbox alt" data-slot="rect-300x250-b" href="#/submit"><small>Advertisement</small><b>Sponsor Israel Insider</b><span>Reach readers of Israel voices</span></a></div>' +
        '</aside>';
    }).catch(function () { return ''; });
  }
  var routes = {
    home: function () {
      return Promise.all([items('limit=60'), api('/api/voices')]).then(function (a) {
        var all = a[0], voices = a[1].voices;
        if (!all.length && !voices.length) {
          return '<section class="sec"><h1>Voices on Israel, in one place</h1><p class="ex" style="margin:10px 0 18px;max-width:60ch">Israel Insider gathers writers, podcasters, video creators and public voices who support Israel. Every item links to the creator\'s own page. The first voices are being added now.</p><a class="btn" href="#/submit">Submit your feed</a></section>';
        }
        var by = function (t) { return all.filter(function (i) { return i.format === t; }); };
        var lead = by('read')[0] || all[0];
        var rest = all.filter(function (i) { return i !== lead; }).slice(0, 5);
        var feat = '<div class="feat"><article class="big ' + lead.format + '"><div class="bd"><span class="kick" style="color:var(--' + lead.format + ')">' + TYPES[lead.format] + ' · Latest</span><h2><a href="' + (lead.format === 'read' || lead.format === 'social' ? esc(safeUrl(lead.url)) + '" target="_blank" rel="noopener' : '#/' + lead.format) + '">' + esc(lead.title) + '</a></h2><p class="ex">' + esc(lead.excerpt) + '</p><div class="meta">' + byline(lead) + '<span>' + ago(lead.published_at) + '</span></div></div></article><div class="list">' +
          rest.map(function (i) { return '<div class="it ' + i.format + '"><span class="ty">' + ICON[i.format] + '</span><div><span class="kick">' + TYPES[i.format] + '</span><h4><a href="' + (i.format === 'read' || i.format === 'social' ? esc(safeUrl(i.url)) + '" target="_blank" rel="noopener' : '#/' + i.format) + '">' + esc(i.title) + '</a></h4><span class="meta">' + esc((i.voice || {}).name) + ' · ' + ago(i.published_at) + '</span></div></div>'; }).join('') + '</div></div>';
        var vo = voices.length ? '<section class="sec">' + sech('', 'Voices', 'Writers, shows and channels', ['#/voices', 'All voices']) + '<div class="voices">' + voices.slice(0, 12).map(voiceTile).join('') + '</div></section>' : '';
        return feat + section('read', by('read'), 'Read', 'Essays, columns, Substack and blog posts') + section('listen', by('listen'), 'Listen', 'Audio-only podcasts, played here or in your app') + section('watch', by('watch'), 'Watch', 'Video podcasts, vlogs, talks and explainers', 'g3', 3) + (by('social').length ? section('social', by('social'), 'Social', 'Short posts from voices', 'g3', 3) : '') + vo;
      });
    },
    subscribe: function () { return Promise.resolve('<section class="sec" style="padding-top:26px">' + sech('', 'Subscribe', 'A digest of new voices by email, or follow by RSS') + '<div style="max-width:520px">' + subForm() + '<p class="ex" style="margin-top:14px">We use your address only for the Israel Insider digest.</p></div></section>'); },
    nowlej: function () { return Promise.resolve('<section class="sec" style="padding-top:26px">' + sech('', 'Israel NOWlej', 'News, views, media, the NOWlej glossary and sources') + '<p class="ex" style="max-width:62ch">Israel Insider is the opinion cousin of Israel NOWlej. For news, reference and sources, use the main sections of Israel NOWlej.</p><div class="nl">' + NL.map(function (x) { return '<a href="https://israelnowlej.com' + x[1] + '" target="_blank" rel="noopener"><b>' + x[0] + '</b><span class="ex">israelnowlej.com' + x[1] + '</span></a>'; }).join('') + '</div></section>'); },
    read: function (q) { return items('format=read&limit=60' + q).then(function (l) { return '<section class="sec read" style="padding-top:26px">' + sech('read', 'Read', 'Essays, columns, Substack and blog posts') + (l.length ? grid(l) : empty('Nothing here yet.')) + '</section>'; }); },
    social: function (q) { return items('format=social&limit=60' + q).then(function (l) { return '<section class="sec social" style="padding-top:26px">' + sech('social', 'Social', 'Short posts from voices, linked to the original') + (l.length ? grid(l, 'g3') : empty('Nothing here yet.')) + '</section>'; }); },
    listen: function (q) {
      return items('format=listen&limit=60' + q).then(function (l) {
        var rows = l.map(function (i) {
          var v = i.voice || {};
          return '<article class="ep listen"><div class="cvr">' + esc(initials(v.name)) + '</div><div class="tx"><span class="kick">' + esc(v.name) + '</span><h3>' + esc(i.title) + '</h3><p class="ex">' + esc(i.excerpt) + '</p><div class="meta"><span>' + ago(i.published_at) + '</span>' + (i.duration_seconds ? '<span>' + dur(i.duration_seconds) + '</span>' : '') + '<span>Audio</span></div><div class="acts"><button class="btn sm" type="button" style="background:var(--listen);color:#fff" data-play="' + esc(i.id) + '">Play</button><button class="btn line sm" type="button" data-queue="' + esc(i.id) + '">Add to queue</button><a class="btn line sm" href="#/voice/' + esc(v.slug) + '">Show page</a></div></div></article>';
        }).join('');
        return '<section class="sec listen" style="padding-top:26px">' + sech('listen', 'Listen', 'Audio-only podcasts. Press play and keep browsing, the player stays at the bottom.', ['/api/rss?format=listen', 'RSS']) + (l.length ? '<div class="grid" style="gap:14px">' + rows + '</div>' : empty('Nothing here yet.')) + '</section>';
      });
    },
    watch: function (q) {
      return items('format=watch&limit=60' + q).then(function (l) {
        var first = l[0];
        var theater = first ? '<div class="feat" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)"><article class="big watch"><div class="art theater" id="theater" data-vid="' + esc(first.embed_id) + '">' + thumb(first) + '<button class="pl" type="button" data-watch="' + esc(first.id) + '" aria-label="Play">' + PLAY + '</button></div><div class="bd"><span class="kick" style="color:var(--watch)">Now in theater view</span><h2 id="ttitle">' + esc(first.title) + '</h2><div class="meta" id="tmeta">' + byline(first) + '<span>' + ago(first.published_at) + '</span><a href="https://www.youtube.com/watch?v=' + esc(first.embed_id) + '" target="_blank" rel="noopener">Watch on YouTube</a></div></div></article><div class="list">' + l.slice(1, 4).map(function (i) { return '<div class="it" style="--c:var(--watch)"><span class="ty">' + ICON.watch + '</span><div><span class="kick">Up next</span><h4><a href="#" data-watch="' + esc(i.id) + '">' + esc(i.title) + '</a></h4><span class="meta">' + esc((i.voice || {}).name) + ' · ' + dur(i.duration_seconds) + '</span></div></div>'; }).join('') + '</div></div>' : '';
        return theater + '<section class="sec watch">' + sech('watch', 'Watch', 'Video podcasts, vlogs, talks and explainers') + (l.length ? grid(l, 'g3') : empty('Nothing here yet.')) + '</section>';
      });
    },
    voices: function () {
      return api('/api/voices').then(function (r) { return '<section class="sec" style="padding-top:26px">' + sech('', 'Voices', 'Every listed writer, show and channel') + (r.voices.length ? '<div class="voices">' + r.voices.map(voiceTile).join('') + '</div>' : empty('No voices listed yet.')) + '</section>'; });
    },
    voice: function (slug) {
      return api('/api/voice/' + encodeURIComponent(slug)).then(function (r) {
        remember(r.items);
        var v = r.voice, kinds = {};
        r.feeds.forEach(function (f) { kinds[f.format] = 1; });
        var links = r.feeds.map(function (f) { return '<div class="rw"><span class="dot" style="background:var(--' + f.format + ')"></span><a href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener">' + esc(f.kind) + '</a></div>'; }).join('');
        var tabs = '<nav class="tabs" style="margin-top:6px"><a class="plain on" data-f="all" href="#" style="background:var(--ink)">All</a>' + ['read', 'listen', 'watch', 'social'].filter(function (t) { return kinds[t]; }).map(function (t) { return '<a class="' + t + '" data-f="' + t + '" href="#">' + TYPES[t] + '</a>'; }).join('') + '</nav>';
        var feed = r.items.length ? grid(r.items, 'g2') : empty('No items yet.');
        return '<div class="prof"><span class="big">' + esc(initials(v.name)) + '</span><div class="tx"><h1>' + esc(v.name) + '</h1><p class="ex">' + esc(v.short_bio) + '</p><div class="meta">' + (v.topics || []).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div></div>' + (v.website ? '<a class="btn line" href="' + esc(safeUrl(v.website)) + '" target="_blank" rel="noopener">Visit site</a>' : '') + '</div>' + tabs + '<div class="cols"><div class="main" id="vfeed">' + feed + '</div><aside class="side"><div class="panel"><h3>Follow and subscribe</h3>' + (links || '<p class="ex">No feeds listed.</p>') + '</div><div class="panel"><h3>About this listing</h3><p class="ex">Items link to the creator\'s own pages. Only headlines and short excerpts are shown here.</p></div></aside></div>';
      });
    },
    submit: function () {
      return Promise.resolve('<div style="max-width:880px;margin:0 auto"><section class="sec" style="--c:var(--ink)">' + sech('', 'Submit your feed', 'For writers, podcasters, video creators and public voices') + '<p class="ex" style="font-size:17px;margin-bottom:18px">Israel Insider lists voices that support Israel. Every item links to your own site, channel or feed. You choose your excerpt, you can edit your profile, and you can opt out any time.</p><div id="subok"></div>' +
        '<form class="frm" id="subf" novalidate><div class="fld"><label for="nm">Name of the voice, show or channel</label><input id="nm" name="name" required></div><div class="fld"><label for="em">Contact email</label><input id="em" name="email" type="email" required><small>Used only to reach you about your listing.</small></div><div class="fld"><label for="wb">Website</label><input id="wb" name="website" type="url" placeholder="https://"></div><div class="fld"><label for="rss">Feeds: blog or newsletter, podcast RSS, YouTube channel, Substack</label><textarea id="rss" name="feeds" placeholder="One address per line"></textarea></div><div class="fld"><label for="xh">Social accounts</label><input id="xh" name="social" placeholder="X, Bluesky, Threads handles"></div><div class="fld"><label for="fm">Formats you publish</label><select id="fm" name="formats"><option>Writing</option><option>Audio podcast</option><option>Video podcast or vlog</option><option>More than one</option></select></div><div class="fld"><label for="bio">Short bio, two lines</label><textarea id="bio" name="bio" maxlength="500"></textarea></div><div class="fld"><label for="tp">Main topics</label><input id="tp" name="topics" placeholder="Security, diplomacy, campus, culture"></div><label class="chk" for="c2"><input id="c2" name="consent_excerpt" type="checkbox">Israel Insider may show my headlines, short excerpts and thumbnails with links to my own pages.</label><label class="chk" for="c3"><input id="c3" name="consent_full_text" type="checkbox">Optional: I give permission to show full text of my posts on Israel Insider.</label><div><button class="btn" type="submit">Send for review</button></div></form></section></div>');
    }
  };
  function voiceTile(v) {
    return '<a class="vo" href="#/voice/' + esc(v.slug) + '"><span class="big">' + esc(initials(v.name)) + '</span><span class="nm">' + esc(v.name) + '</span></a>';
  }

  // ---- router
  var token = 0;
  var td = document.getElementById('today'); if (td) td.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var TOPICS = ['security', 'politics', 'diplomacy', 'culture', 'history', 'faith', 'campus'];
  var NL = [['News', '/'], ['Views', '/views/'], ['Media', '/media/'], ['NOWlej', '/glossary/'], ['Sources', '/sources/']];
  var SUBCOL = { read: 'var(--read)', listen: 'var(--listen)', watch: 'var(--watch)', social: 'var(--social)', voices: 'var(--voices)', nowlej: 'var(--bluedk)' };
  function renderSub(name, topic) {
    var n = name === 'voice' ? 'voices' : name, L;
    if (n === 'nowlej') L = NL.map(function (x) { return '<a href="https://israelnowlej.com' + x[1] + '" target="_blank" rel="noopener">' + x[0] + '</a>'; });
    else if (n === 'voices' || n === 'submit') L = [['#/voices', 'All voices', n === 'voices'], ['#/submit', 'Submit your feed', n === 'submit'], ['/api/rss', 'RSS']].map(function (x) { return '<a' + (x[2] ? ' class="on"' : '') + ' href="' + x[0] + '">' + x[1] + '</a>'; });
    else if (TYPES[n]) L = [['', 'All ' + n]].concat(TOPICS.map(function (t) { return [t, t.charAt(0).toUpperCase() + t.slice(1)]; })).map(function (x) { return '<a' + (x[0] === topic ? ' class="on"' : '') + ' href="#/' + n + (x[0] ? '?topic=' + x[0] : '') + '">' + x[1] + '</a>'; });
    else L = [['#/', 'Latest', 1], ['#/voices', 'All voices'], ['#/submit', 'Submit your feed'], ['/api/rss', 'RSS']].map(function (x) { return '<a' + (x[2] ? ' class="on"' : '') + ' href="' + x[0] + '">' + x[1] + '</a>'; });
    var el = document.getElementById('sublinks'); el.innerHTML = L.join('');
    el.parentNode.style.setProperty('--sc', SUBCOL[n] || 'var(--blue)');
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?')[0].split('/');
    var name = parts[0] || 'home', arg = parts[1] ? decodeURIComponent(parts[1]) : '';
    var qm = /[?&]q=([^&]*)/.exec(h), tm = /[?&]topic=([^&]*)/.exec(h), q = (qm ? '&q=' + qm[1] : '') + (tm ? '&topic=' + tm[1] : '');
    if (!routes[name]) name = 'home';
    document.querySelectorAll('#tabs a').forEach(function (a) { if (a.dataset.r === (name === 'voice' ? 'voices' : name)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderSub(name, tm ? decodeURIComponent(tm[1]) : '');
    var t = ++token;
    view.innerHTML = '<div class="empty" style="margin-top:26px">Loading</div>';
    Promise.all([routes[name](name === 'voice' ? arg : q), name === 'voice' ? '' : sideCol()]).then(function (r) {
      if (t !== token) return;
      var html = r[0];
      view.innerHTML = r[1] ? '<div class="cols"><div class="main">' + html + '</div>' + r[1] + '</div>' : html; window.scrollTo(0, 0); document.title = (name === 'home' ? '' : name.charAt(0).toUpperCase() + name.slice(1) + ' · ') + 'Israel Insider';
      if (name === 'submit') wireSubmit();
      if (name === 'voice') wireVoice();
    }).catch(function () { if (t === token) view.innerHTML = '<div class="err" style="margin-top:26px">Could not load this page. Try again in a moment.</div>'; });
  }
  window.addEventListener('hashchange', route);
  $('#sf').addEventListener('submit', function (e) { e.preventDefault(); var v = $('#q').value.trim(); location.hash = v ? '#/read?q=' + encodeURIComponent(v) : '#/'; });

  function wireVoice() {
    var tabs = document.querySelectorAll('.tabs a[data-f]');
    tabs.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); tabs.forEach(function (b) { b.classList.remove('on'); }); a.classList.add('on'); var f = a.dataset.f; var list = Object.keys(ITEMS).map(function (k) { return ITEMS[k]; }).filter(function (i) { return (i.voice || {}).slug === location.hash.split('/')[2] && (f === 'all' || i.format === f); }); list.sort(function (x, y) { return y.published_at.localeCompare(x.published_at); }); $('#vfeed').innerHTML = list.length ? grid(list, 'g2') : empty('No items yet.'); }); });
  }
  function wireSubmit() {
    var f = $('#subf');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      d.consent_excerpt = f.consent_excerpt.checked; d.consent_full_text = f.consent_full_text.checked;
      var box = $('#subok'); box.innerHTML = '';
      fetch('/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then(function (r) {
        if (r.ok) { f.hidden = true; box.innerHTML = '<div class="ok">Thank you. Your submission is in the review queue. An editor will write to the email you gave.</div>'; }
        else r.json().then(function (j) { box.innerHTML = '<div class="err">' + esc(j.error || 'Could not send. Check the form and try again.') + '</div>'; });
      }).catch(function () { box.innerHTML = '<div class="err">Could not send. Check your connection and try again.</div>'; });
    });
  }

  // ---- audio player (persists across routes)
  var aud = $('#aud'), bar = $('#pbar'), queue = [], cur = -1, speeds = [1, 1.25, 1.5, 2, 0.75], si = 0;
  var fmt = function (s) { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function load(i) {
    cur = i; var it = queue[i]; if (!it) return;
    aud.src = it.audio_url; aud.playbackRate = speeds[si];
    bar.hidden = false; $('#ptitle').textContent = it.title; $('#pshow').textContent = (it.voice || {}).name || ''; $('#pcv').textContent = initials((it.voice || {}).name);
    try { var pos = +localStorage.getItem('pos:' + it.id); if (pos > 5) aud.currentTime = pos; } catch (e) {}
    aud.play().catch(function () {});
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: (it.voice || {}).name || '', artwork: it.thumbnail_url ? [{ src: it.thumbnail_url }] : [] }); }
  }
  function playItem(id) { var it = ITEMS[id]; if (!it || !it.audio_url) return; var k = queue.findIndex(function (x) { return x.id === id; }); if (k < 0) { queue.splice(cur + 1, 0, it); k = cur + 1; } load(k); }
  $('#ppp').addEventListener('click', function () { if (aud.paused) aud.play(); else aud.pause(); });
  $('#pback').addEventListener('click', function () { aud.currentTime = Math.max(0, aud.currentTime - 15); });
  $('#pfwd').addEventListener('click', function () { aud.currentTime = Math.min(aud.duration || 1e9, aud.currentTime + 30); });
  $('#pspd').addEventListener('click', function () { si = (si + 1) % speeds.length; aud.playbackRate = speeds[si]; $('#pspd').textContent = speeds[si] + 'x'; });
  $('#pseek').addEventListener('input', function () { if (aud.duration) aud.currentTime = aud.duration * this.value / 1000; });
  aud.addEventListener('play', function () { $('#ppp').textContent = 'Pause'; });
  aud.addEventListener('pause', function () { $('#ppp').textContent = 'Play'; });
  aud.addEventListener('ended', function () { if (cur + 1 < queue.length) load(cur + 1); });
  aud.addEventListener('timeupdate', function () {
    $('#pcur').textContent = fmt(aud.currentTime); $('#pdur').textContent = fmt(aud.duration);
    if (aud.duration) $('#pseek').value = Math.round(aud.currentTime / aud.duration * 1000);
    var it = queue[cur]; if (it && Math.floor(aud.currentTime) % 5 === 0) { try { localStorage.setItem('pos:' + it.id, String(Math.floor(aud.currentTime))); } catch (e) {} }
  });

  // ---- video: click to load the YouTube embed
  function watch(id) {
    var it = ITEMS[id]; if (!it || !it.embed_id) return;
    var box = $('#theater');
    if (!box) { location.hash = '#/watch'; return; }
    box.dataset.vid = it.embed_id;
    box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(it.embed_id) + '?autoplay=1&rel=0" title="' + esc(it.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    var t = $('#ttitle'); if (t) { t.textContent = it.title; $('#tmeta').innerHTML = byline(it) + '<span>' + ago(it.published_at) + '</span><a href="https://www.youtube.com/watch?v=' + esc(it.embed_id) + '" target="_blank" rel="noopener">Watch on YouTube</a>'; }
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.addEventListener('submit', function (e) {
    var f = e.target.closest('.subf'); if (!f) return; e.preventDefault();
    var box = f.querySelector('.submsg'), em = f.elements.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { box.textContent = 'Enter a valid email address.'; return; }
    if (!f.elements.consent.checked) { box.textContent = 'Please tick the box to subscribe.'; return; }
    fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: em, consent: true }) }).then(function (r) { box.textContent = r.ok ? 'Thank you. You are on the list.' : 'Could not subscribe. Try again later.'; if (r.ok) f.elements.email.value = ''; }).catch(function () { box.textContent = 'Could not subscribe. Check your connection.'; });
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-play],[data-queue],[data-watch]'); if (!el) return;
    e.preventDefault();
    if (el.dataset.play) playItem(el.dataset.play);
    else if (el.dataset.queue) { var it = ITEMS[el.dataset.queue]; if (it && !queue.some(function (x) { return x.id === it.id; })) { queue.push(it); el.textContent = 'Queued'; if (cur < 0) load(0); } }
    else if (el.dataset.watch) {
      if ($('#theater')) watch(el.dataset.watch);
      else { var it2 = ITEMS[el.dataset.watch]; if (it2) { var a = el.closest('.art'); if (a) { a.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(it2.embed_id) + '?autoplay=1&rel=0" title="' + esc(it2.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>'; } } }
    }
  });

  route();
})();
