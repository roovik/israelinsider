/* Israel Insider admin: Outreach. One voice at a time: see how good their page is, find their public contact details,
   write a personal note from a template, then open your own Gmail or their social inbox with the note ready.
   Nothing is sent automatically. Every click is logged so you can see who has been contacted, when and how. */
(function () {
  var SITE = 'https://israelinsider.org';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) };
  var LS = { get: function (k, d) { try { var v = localStorage.getItem('ii_out_' + k); return v == null ? d : v } catch (e) { return d } }, set: function (k, v) { try { localStorage.setItem('ii_out_' + k, v) } catch (e) {} } };
  var DEF_SIGN = 'Richard J. Koret\nEditor, Israel Insider · israelinsider.org\nAuthor, Israel in Maps · israelnowlej.com';
  var STATUS = [['', 'Not contacted'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['blessed', 'Blessed'], ['linked', 'Linked or mentioned us'], ['guest', 'Guest or topic agreed'], ['declined', 'Declined'], ['no-contact', 'Do not contact']];
  var SCOL = { '': '#e6e9ee', contacted: '#fbe3c8', replied: '#dbe7fb', blessed: '#d8f0dc', linked: '#bfe6c8', guest: '#c9e9d5', declined: '#f6d0d0', 'no-contact': '#ddd' };
  var CH = [
    ['email', 'Email', 'name@site.com'], ['x', 'X', '@handle'], ['instagram', 'Instagram', 'handle'], ['facebook', 'Facebook', 'page name'],
    ['linkedin', 'LinkedIn', 'in/name'], ['telegram', 'Telegram', 'username'], ['whatsapp', 'WhatsApp', '+972...'], ['youtube', 'YouTube', '@channel'], ['contact_url', 'Contact page', 'https://...']];
  var ORGW = /\b(the|institute|center|centre|podcast|news|media|report|times|post|network|forum|project|foundation|magazine|journal|tv|radio|show|daily|weekly|group|team|council|committee|association|alliance|coalition|campaign|watch|review|channel|fund|org)\b/i;

  var T = {
    bless: {
      label: 'Blessing and additions (first note)',
      subject: 'Your page on Israel Insider',
      body: '{hi}\n\nI’m Richard Koret, editor of Israel Insider (israelinsider.org), a free directory that brings together writers, podcasters and video creators on Israel. Every item links straight back to the creator’s own site, so readers end up with you.\n\nYou’re included, and your page is here:\n{page}\n{latest}\nBefore we promote it further I’d love your blessing. If anything should be corrected or added (a better photo, a short bio, your podcast, YouTube channel or newsletter), just reply and I’ll update it.\n\nThank you for the work you do.\n\n{sign}',
      dm: '{hi} I’m Richard Koret, editor of Israel Insider (israelinsider.org), a free directory of voices on Israel that links every item back to the creator’s own site. You’re featured here: {page}\nI’d love your blessing, and any corrections or additions you’d like. Thank you for your work!'
    },
    link: {
      label: 'Link back or mention',
      subject: 'Israel Insider and your site',
      body: '{hi}\n\nThank you again for your page on Israel Insider:\n{page}\n\nWould you consider linking to it from your site, or mentioning Israel Insider (israelinsider.org) or Israel NOWlej (israelnowlej.com, an online atlas of Israel’s story in maps, timelines and tours) to your readers when it fits? Small links like that help people find serious voices on Israel.\n\nI’m happy to return the favor: tell me which of your pieces you’d most like us to feature and I’ll put it forward.\n\n{sign}',
      dm: '{hi} Thanks again for your page on Israel Insider: {page}\nIf it fits, would you link to it or mention Israel Insider or Israel NOWlej (israelnowlej.com) to your audience? Happy to feature a piece of yours in return.'
    },
    guest: {
      label: 'Guest or topic offer',
      subject: 'A guest or topic idea for you',
      body: '{hi}\n\nI follow your work and you’re featured on Israel Insider ({page}).\n\nI write on Israel’s history and geography: I’m the author of Israel in Maps and I run Israel NOWlej (israelnowlej.com), an online atlas of Israel’s story with 33 maps, 26 timelines and a tour of the country.\n\nIf it would help your audience, I’d be glad to come on as a guest or give you a topic, for example:\n• Israel’s borders, map by map, from 1920 to today\n• Four thousand years of the land in 26 timelines\n• What the maps of Judea and Samaria really show\n\nI can send maps you can show on screen or use in a post, credited to the book.\n\n{sign}',
      dm: '{hi} You’re featured on Israel Insider ({page}). I’m the author of Israel in Maps and run Israel NOWlej (israelnowlej.com). If useful, I’d be glad to come on as a guest or offer a topic, e.g. Israel’s borders map by map, with maps you can show on screen.'
    },
    follow: {
      label: 'Gentle follow-up',
      subject: 'Re: Your page on Israel Insider',
      body: '{hi}\n\nJust a quick follow-up on my note about your page on Israel Insider:\n{page}\n\nNo action is needed if you’re happy with it as it is. If you’d like anything changed or added, or would rather not be listed, simply reply and I’ll take care of it.\n\n{sign}',
      dm: '{hi} Quick follow-up on your page on Israel Insider: {page}\nIf you’d like anything changed or added, or would rather not be listed, just let me know.'
    }
  };

  function clean(k, v) {
    v = String(v || '').trim(); if (!v) return '';
    if (k === 'email' || k === 'contact_url' || k === 'next' || k === 'notes') return v;
    v = v.replace(/^https?:\/\/(www\.|m\.|mobile\.)?/i, '').replace(/\/+$/, '');
    if (k === 'x') v = v.replace(/^(twitter|x)\.com\//i, '');
    if (k === 'instagram') v = v.replace(/^instagram\.com\//i, '');
    if (k === 'facebook') v = v.replace(/^(facebook|fb|m)\.com\//i, '').replace(/^me\//, '');
    if (k === 'telegram') v = v.replace(/^(t|telegram)\.me\//i, '');
    if (k === 'linkedin') v = v.replace(/^linkedin\.com\//i, '');
    if (k === 'youtube') v = v.replace(/^youtube\.com\//i, '').replace(/\/about$/, '');
    if (k === 'whatsapp') return v.replace(/[^\d]/g, '');
    return k === 'youtube' || k === 'linkedin' ? v : v.replace(/^@/, '');
  }
  function firstEmail(v) { return String(v || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x) })[0] || '' }
  function greet(v) { var n = String(v.name || '').trim(); if (ORGW.test(n) || !/\s/.test(n)) return 'Hello ' + n + ' team,'; return 'Hi ' + n.split(/\s+/)[0] + ',' }
  function fill(t, v, st, short) {
    var page = SITE + '/#/voice/' + v.slug;
    var latest = st && st.title ? '\nIt opens with your latest piece, “' + st.title + '”.\n' : '';
    var hi = greet(v); if (short) hi = hi.replace(/,$/, '!').replace(/ team!$/, ' team!');
    return (short ? t.dm : t.body).replace(/\{hi\}/g, hi).replace(/\{page\}/g, page).replace(/\{latest\}/g, latest).replace(/\{sign\}/g, LS.get('sign', DEF_SIGN));
  }
  function score(v, st) { var s = 0; if (st && st.items) s += Math.min(st.items, 20) + 10; if (v.avatar) s += 6; if (v.short_bio) s += 2; s += (v.sections || []).length * 2; if (st && st.last && Date.now() - Date.parse(st.last) < 30 * 864e5) s += 6; return s }
  function stars(n) { return n >= 30 ? '★★★' : n >= 16 ? '★★' : n >= 8 ? '★' : '–' }

  function links(o, subject, body, dm) {
    var L = [], e = firstEmail(o.email), from = LS.get('from', ''), app = LS.get('app', 'gmail');
    if (e) L.push(['email', 'Email', app === 'gmail' ? 'https://mail.google.com/mail/?view=cm&fs=1' + (from ? '&authuser=' + encodeURIComponent(from) : '') + '&to=' + encodeURIComponent(e) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) : 'mailto:' + e + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), false]);
    if (o.whatsapp) L.push(['whatsapp', 'WhatsApp', 'https://wa.me/' + o.whatsapp + '?text=' + encodeURIComponent(dm), false]);
    if (o.instagram) L.push(['instagram', 'Instagram DM', 'https://ig.me/m/' + encodeURIComponent(o.instagram), true]);
    if (o.facebook) L.push(['facebook', 'Messenger', 'https://m.me/' + encodeURIComponent(o.facebook), true]);
    if (o.x) L.push(['x', 'X profile', 'https://x.com/' + encodeURIComponent(o.x), true]);
    if (o.telegram) L.push(['telegram', 'Telegram', 'https://t.me/' + encodeURIComponent(o.telegram), true]);
    if (o.linkedin) L.push(['linkedin', 'LinkedIn', 'https://www.linkedin.com/' + o.linkedin, true]);
    if (o.youtube) L.push(['youtube', 'YouTube About', 'https://www.youtube.com/' + o.youtube + '/about', true]);
    if (o.contact_url) L.push(['contact_url', 'Contact page', o.contact_url, true]);
    return L;
  }

  window.OutreachUI = {
    mount: function (el, A) {
      var api = A.api, say = A.say, V = [], O = {}, S = {}, open = null, shown = 30;
      var f = { st: LS.get('fst', 'todo'), sort: LS.get('fsort', 'good'), q: '', has: LS.get('fhas', '') === '1' };
      function load() {
        return Promise.all([api('voices'), api('outreach')]).then(function (r) { V = r[0].voices.filter(function (v) { return v.status === 'listed' }); O = r[1].outreach || {}; S = r[1].stats || {}; draw() });
      }
      function rows() {
        var q = f.q.toLowerCase();
        var l = V.filter(function (v) {
          var o = O[v.id] || {}, st = o.status || '';
          if (f.st === 'todo' && st) return false; if (f.st === 'due' && !(o.next && o.next <= new Date().toISOString().slice(0, 10) && st !== 'declined' && st !== 'no-contact')) return false;
          if (f.st !== 'all' && f.st !== 'todo' && f.st !== 'due' && st !== f.st) return false;
          if (f.has && !CH.some(function (c) { return o[c[0]] })) return false;
          if (q && (v.name + ' ' + v.short_bio + ' ' + (v.topics || []).join(' ')).toLowerCase().indexOf(q) < 0) return false; return true
        });
        l.forEach(function (v) { v._s = score(v, S[v.id]) });
        l.sort(f.sort === 'good' ? function (a, b) { return b._s - a._s || a.name.localeCompare(b.name) } : f.sort === 'recent' ? function (a, b) { var x = (O[a.id] || {}).log, y = (O[b.id] || {}).log; return String(y && y.length ? y[y.length - 1].at : '').localeCompare(String(x && x.length ? x[x.length - 1].at : '')) } : function (a, b) { return a.name.localeCompare(b.name) });
        return l;
      }
      function cnt(k) { return V.filter(function (v) { var o = O[v.id] || {}, s = o.status || ''; return k === 'all' ? true : k === 'todo' ? !s : k === 'due' ? (o.next && o.next <= new Date().toISOString().slice(0, 10) && s !== 'declined' && s !== 'no-contact') : s === k }).length }
      function draw() {
        var l = rows(), withC = V.filter(function (v) { return CH.some(function (c) { return (O[v.id] || {})[c[0]] }) }).length, unchecked = V.filter(function (v) { return !(O[v.id] && O[v.id].found_at) }).length;
        el.innerHTML =
          '<details class="card"' + (LS.get('setdone', '') ? '' : ' open') + '><summary><b>Your details for messages</b> <span class="sm">(kept in this browser)</span></summary>' +
          '<div class="row"><div><label for="o-from">Send email from (Gmail address)</label><input id="o-from" value="' + esc(LS.get('from', '')) + '" placeholder="you@gmail.com"></div><div><label for="o-app">Email opens in</label><select id="o-app"><option value="gmail"' + (LS.get('app', 'gmail') === 'gmail' ? ' selected' : '') + '>Gmail in the browser</option><option value="mailto"' + (LS.get('app', 'gmail') === 'mailto' ? ' selected' : '') + '>My default mail app</option></select></div></div>' +
          '<label for="o-sign">Signature</label><textarea id="o-sign" rows="3">' + esc(LS.get('sign', DEF_SIGN)) + '</textarea><p><button id="o-save">Save details</button></p></details>' +
          '<div class="card"><div class="row" style="align-items:end"><div><label for="o-st">Show</label><select id="o-st">' +
          [['todo', 'Not contacted yet'], ['due', 'Follow-up due']].concat(STATUS.slice(1).map(function (s) { return [s[0], s[1]] })).concat([['all', 'Everyone']]).map(function (s) { return '<option value="' + s[0] + '"' + (f.st === s[0] ? ' selected' : '') + '>' + esc(s[1]) + ' (' + cnt(s[0]) + ')</option>' }).join('') +
          '</select></div><div><label for="o-sort">Order</label><select id="o-sort"><option value="good"' + (f.sort === 'good' ? ' selected' : '') + '>Best pages first</option><option value="name"' + (f.sort === 'name' ? ' selected' : '') + '>A to Z</option><option value="recent"' + (f.sort === 'recent' ? ' selected' : '') + '>Last contacted</option></select></div>' +
          '<div><label for="o-q">Search</label><input id="o-q" value="' + esc(f.q) + '" placeholder="name, topic"></div><div><label><input type="checkbox" id="o-has" style="width:auto"' + (f.has ? ' checked' : '') + '> Only with contact details</label></div></div>' +
          '<p class="sm">' + V.length + ' listed voices · ' + withC + ' with contact details · ' + unchecked + ' not yet searched. <button id="o-find" style="min-height:32px">Find contact details' + (unchecked ? ' (' + unchecked + ' left)' : '') + '</button></p>' +
          '<p class="sm">★★★ means a strong page: items, a photo and recent activity. Start with those. Notes open in your own Gmail or the voice’s own inbox, one at a time, for you to read and send.</p></div>' +
          '<div id="o-list">' + l.slice(0, shown).map(card).join('') + '</div>' + (l.length > shown ? '<p><button id="o-more">Show more (' + (l.length - shown) + ')</button></p>' : (l.length ? '' : '<p class="sm">Nobody here.</p>'));
        wire();
      }
      function card(v) {
        var o = O[v.id] || {}, st = S[v.id] || {}, s = score(v, st), isOpen = open === v.id, page = SITE + '/#/voice/' + v.slug;
        var has = CH.filter(function (c) { return o[c[0]] }).map(function (c) { return c[1] });
        var last = o.log && o.log.length ? o.log[o.log.length - 1] : null;
        var h = '<div class="card" data-v="' + esc(v.id) + '"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          (v.avatar ? '<img src="' + esc(v.avatar) + '" alt="" width="40" height="40" style="border-radius:50%;object-fit:cover">' : '') +
          '<div style="flex:1;min-width:200px"><b>' + esc(v.name) + '</b> <span title="Page strength">' + stars(s) + '</span> <span class="tag" style="background:' + SCOL[o.status || ''] + '">' + esc((STATUS.filter(function (x) { return x[0] === (o.status || '') })[0] || STATUS[0])[1]) + '</span>' +
          (o.next ? ' <span class="sm">follow up ' + esc(o.next) + '</span>' : '') +
          '<div class="sm">' + (st.items || 0) + ' items' + (st.last ? ', latest ' + esc(st.last.slice(0, 10)) : '') + (v.avatar ? ' · photo' : ' · no photo') + ' · ' + esc((v.sections || []).join(', ') || 'no sections') +
          ' · <a href="' + esc(page) + '" target="_blank" rel="noopener">their page</a>' + (v.website ? ' · <a href="' + esc(v.website) + '" target="_blank" rel="noopener">their site</a>' : '') + '</div>' +
          '<div class="sm">' + (has.length ? 'Reach by: ' + esc(has.join(', ')) : 'No contact details yet') + (last ? ' · last: ' + esc(last.via) + ', ' + esc(last.at.slice(0, 10)) : '') + '</div></div>' +
          '<button data-open="' + esc(v.id) + '">' + (isOpen ? 'Close' : 'Write') + '</button></div>';
        if (!isOpen) return h + '</div>';
        var tk = LS.get('tpl_' + v.id, o.status ? (o.status === 'contacted' ? 'follow' : o.status === 'blessed' || o.status === 'replied' ? 'link' : 'bless') : 'bless');
        h += '<div class="row" style="margin-top:8px">' + CH.map(function (c) { return '<div style="flex:1 1 160px"><label for="c-' + c[0] + '">' + c[1] + '</label><input id="c-' + c[0] + '" data-c="' + c[0] + '" value="' + esc(o[c[0]] || '') + '" placeholder="' + esc(c[2]) + '"></div>' }).join('') + '</div>' +
          '<div class="row"><div><label for="c-status">Status</label><select id="c-status">' + STATUS.map(function (x) { return '<option value="' + x[0] + '"' + ((o.status || '') === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>' }).join('') + '</select></div>' +
          '<div><label for="c-next">Follow up on</label><input id="c-next" type="date" value="' + esc(o.next || '') + '"></div></div>' +
          '<label for="c-notes">Notes</label><textarea id="c-notes" rows="2">' + esc(o.notes || '') + '</textarea>' +
          '<p><button class="p" id="c-save">Save details</button> <button id="c-find">Search their site again</button></p>' +
          '<h3 style="margin:14px 0 4px;font-size:16px">Message</h3><div class="row"><div><label for="c-tpl">Template</label><select id="c-tpl">' + Object.keys(T).map(function (k) { return '<option value="' + k + '"' + (k === tk ? ' selected' : '') + '>' + esc(T[k].label) + '</option>' }).join('') + '</select></div><div><label for="c-subj">Email subject</label><input id="c-subj" value="' + esc(T[tk].subject) + '"></div></div>' +
          '<label for="c-body">Email</label><textarea id="c-body" rows="12">' + esc(fill(T[tk], v, st, false)) + '</textarea>' +
          '<label for="c-dm">Short version for direct messages</label><textarea id="c-dm" rows="4">' + esc(fill(T[tk], v, st, true)) + '</textarea>' +
          '<p class="sm">Email opens a ready draft in your Gmail. For Instagram, Messenger, X, Telegram, LinkedIn and YouTube, the short version is copied first, then their inbox or profile opens: paste it and send. Each click is logged and marks the voice as contacted.</p><p id="c-go">' + goButtons(o) + '</p>' +
          (o.log && o.log.length ? '<div class="sm"><b>History</b><br>' + o.log.slice().reverse().map(function (x) { return esc(x.at.slice(0, 16).replace('T', ' ')) + ' · ' + esc(x.via) + ' · ' + esc(x.what) }).join('<br>') + '</div>' : '') +
          '<p class="sm">Log something done elsewhere: <button data-log="phone" style="min-height:30px">Phone call</button> <button data-log="in person" style="min-height:30px">In person</button> <button data-log="their reply" style="min-height:30px">They replied</button></p>';
        return h + '</div>';
      }
      function goButtons(o) { var L = links(o, '', '', ''); return L.length ? L.map(function (x) { return '<button data-go="' + x[0] + '"' + (x[0] === 'email' ? ' class="p"' : '') + '>' + esc(x[1]) + '</button>' }).join(' ') : '<span class="sm">Add an email or a social handle above, or press “Search their site again”.</span>' }
      function cur() { return V.filter(function (v) { return v.id === open })[0] }
      function save(patch, quiet) { var v = cur(); if (!v) return Promise.resolve(); patch.id = v.id; return api('outreach', patch).then(function (r) { O[v.id] = r.outreach; if (!quiet) say('Saved ' + v.name + '.', true) }).catch(function (e) { say(e.message) }) }
      function fields() { var p = {}; el.querySelectorAll('[data-c]').forEach(function (i) { p[i.dataset.c] = clean(i.dataset.c, i.value) }); p.status = el.querySelector('#c-status').value; p.next = el.querySelector('#c-next').value; p.notes = el.querySelector('#c-notes').value; return p }
      function copy(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () {}); var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy') } catch (e) {} a.remove(); return Promise.resolve() }
      function findAll() {
        var n = 0, got = 0; say('Searching voices’ own sites for public contact details…', true);
        (function step() { return api('outreach/find', {}).then(function (r) { n += r.checked; got += r.found; say('Searched ' + n + ' sites, found ' + got + ' details. ' + r.remaining + ' left…', true); if (r.remaining > 0 && r.checked > 0) return step(); return load().then(function () { say('Done. Searched ' + n + ' sites and found ' + got + ' contact details. Check them before writing: sites sometimes list a general or publisher address.', true) }) }) })().catch(function (e) { say(e.message) });
      }
      function wire() {
        var q = function (s) { return el.querySelector(s) };
        q('#o-save').onclick = function () { LS.set('from', q('#o-from').value.trim()); LS.set('app', q('#o-app').value); LS.set('sign', q('#o-sign').value); LS.set('setdone', '1'); say('Saved your details.', true); draw() };
        q('#o-st').onchange = function () { f.st = this.value; LS.set('fst', f.st); shown = 30; draw() };
        q('#o-sort').onchange = function () { f.sort = this.value; LS.set('fsort', f.sort); draw() };
        q('#o-has').onchange = function () { f.has = this.checked; LS.set('fhas', f.has ? '1' : ''); draw() };
        var t; q('#o-q').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { f.q = v; draw(); var i = q('#o-q'); i.focus(); i.setSelectionRange(v.length, v.length) }, 250) };
        q('#o-find').onclick = findAll;
        if (q('#o-more')) q('#o-more').onclick = function () { shown += 30; draw() };
        q('#o-list').onclick = function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.dataset.open) { open = open === b.dataset.open ? null : b.dataset.open; draw(); var c = el.querySelector('[data-v="' + open + '"]'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
          var v = cur(); if (!v) return;
          if (b.id === 'c-save') { save(fields()).then(draw); return }
          if (b.id === 'c-find') { say('Searching ' + v.name + '\u2019s site\u2026', true); api('outreach/find', { ids: [v.id], force: true }).then(function (r) { return load().then(function () { say('Searched ' + v.name + '\u2019s site: ' + r.found + ' new details found.', true) }) }).catch(function (e2) { say(e2.message) }); return }
          if (b.dataset.log) { save({ log: { via: b.dataset.log, what: 'logged by hand' }, status: b.dataset.log === 'their reply' ? 'replied' : undefined }).then(draw); return }
          if (b.dataset.go) {
            var p = fields(), tk = q('#c-tpl').value, subj = q('#c-subj').value, body = q('#c-body').value, dm = q('#c-dm').value;
            var oo = {}; for (var k in p) oo[k] = p[k];
            var L = links(oo, subj, body, dm).filter(function (x) { return x[0] === b.dataset.go })[0]; if (!L) return;
            var w = window.open('about:blank', '_blank');
            (L[3] ? copy(dm) : Promise.resolve()).then(function () {
              if (w) w.location = L[2]; else location.href = L[2];
              if (L[3]) say('The short message is copied. Paste it into ' + L[1] + ' and send.', true);
              p.log = { via: L[1], what: T[tk].label }; if (!p.status) p.status = 'contacted';
              if (!p.next) { var d = new Date(Date.now() + 10 * 864e5); p.next = d.toISOString().slice(0, 10) }
              return save(p, true).then(draw);
            });
          }
        };
        var tpl = q('#c-tpl'); if (tpl) tpl.onchange = function () { var v = cur(); LS.set('tpl_' + v.id, this.value); q('#c-subj').value = T[this.value].subject; q('#c-body').value = fill(T[this.value], v, S[v.id], false); q('#c-dm').value = fill(T[this.value], v, S[v.id], true) };
        el.querySelectorAll('[data-c]').forEach(function (i) { i.addEventListener('input', function () { var g = q('#c-go'); var o = {}; el.querySelectorAll('[data-c]').forEach(function (j) { o[j.dataset.c] = clean(j.dataset.c, j.value) }); g.innerHTML = goButtons(o) }) });
      }
      return load();
    }
  };
})();
