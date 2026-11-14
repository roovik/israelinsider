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
      body: '{hi}\n\nI’m Richard Koret, editor of Israel Insider (israelinsider.org), a free directory that brings together writers, podcasters and video creators on Israel. Every item links straight back to the creator’s own site, so readers end up with you.\n\nYou’re included, and your page is here:\n{page}\n{latest}\nBefore we promote it further I’d love your blessing. If anything should be corrected or added (a better photo, a short bio, your podcast, YouTube channel or newsletter), tell me and I’ll update it. You can answer in one click here, or simply reply:\n{reply}\n\nThank you for the work you do.\n\n{sign}\n\nP.S. If anything in our news or in Israel NOWlej’s maps, timelines and tours (israelnowlej.com) could serve your audience as a joint venture or sponsorship, there’s a box for that on the same page.',
      dm: '{hi} I’m Richard Koret, editor of Israel Insider (israelinsider.org), a free directory of voices on Israel that links every item back to the creator’s own site. You’re featured here: {page}\nI’d love your blessing, and any corrections or additions. One-click answer: {reply}\nThank you for your work!'
    },
    link: {
      label: 'Link back or mention',
      subject: 'Israel Insider and your site',
      body: '{hi}\n\nThank you again for your page on Israel Insider:\n{page}\n\nWould you consider linking to it from your site, or mentioning Israel Insider (israelinsider.org) or Israel NOWlej (israelnowlej.com, an online atlas of Israel’s story in maps, timelines and tours) to your readers when it fits? Small links like that help people find serious voices on Israel.\n\nI’m happy to return the favor: tell me which of your pieces you’d most like us to feature and I’ll put it forward. And if a joint venture or sponsorship around our news or Israel NOWlej’s maps, timelines and tours appeals to you, I’d be glad to explore it.\n\nYou can answer here in one click: {reply}\n\n{sign}',
      dm: '{hi} Thanks again for your page on Israel Insider: {page}\nIf it fits, would you link to it or mention Israel Insider or Israel NOWlej (israelnowlej.com) to your audience? Happy to feature a piece of yours in return. {reply}'
    },
    guest: {
      label: 'Guest or topic offer',
      subject: 'A guest or topic idea for you',
      body: '{hi}\n\nI follow your work and you’re featured on Israel Insider ({page}).\n\nI write on Israel’s history and geography: I’m the author of Israel in Maps and I run Israel NOWlej (israelnowlej.com), an online atlas of Israel’s story with 33 maps, 26 timelines and a tour of the country.\n\nIf it would help your audience, I’d be glad to come on as a guest or give you a topic, for example:\n• Israel’s borders, map by map, from 1920 to today\n• Four thousand years of the land in 26 timelines\n• What the maps of Judea and Samaria really show\n\nI can send maps you can show on screen or use in a post, credited to the book.\n\nIf you\u2019re interested, reply or tick the box here: {reply}\n\n{sign}',
      dm: '{hi} You’re featured on Israel Insider ({page}). I’m the author of Israel in Maps and run Israel NOWlej (israelnowlej.com). If useful, I’d be glad to come on as a guest or offer a topic, e.g. Israel’s borders map by map, with maps you can show on screen.'
    },
    follow: {
      label: 'Gentle follow-up',
      subject: 'Re: Your page on Israel Insider',
      body: '{hi}\n\nJust a quick follow-up on my note about your page on Israel Insider:\n{page}\n\nNo action is needed if you’re happy with it as it is. If you’d like anything changed or added, or would rather not be listed, one click here does it:\n{reply}\n\n{sign}',
      dm: '{hi} Quick follow-up on your page on Israel Insider: {page}\nChanges, or would rather not be listed? One click: {reply}'
    },
    venture: {
      label: 'Joint venture or sponsorship',
      subject: 'Working together on Israel Insider and Israel NOWlej',
      body: '{hi}\n\nThank you for being part of Israel Insider ({page}).\n\nAs we head toward our full launch on January 1, 2027, I\u2019m looking for a few partners. Is anything in our assets of interest to you as a joint venture or sponsorship?\n\u2022 Israel Insider: a live news and voices feed on Israel (israelinsider.org)\n\u2022 Israel NOWlej: an online atlas of Israel\u2019s story, with 33 maps, 26 timelines and a tour of the country (israelnowlej.com)\n\u2022 The maps and timelines themselves, for your posts, videos or events, credited to the book\n\nIf something fits, tick the box here or just reply and we can talk: {reply}\n\n{sign}',
      dm: '{hi} As Israel Insider heads to its full launch on Jan 1, 2027, I\u2019m looking for partners. Would a joint venture or sponsorship around our news or Israel NOWlej\u2019s maps and timelines interest you? {reply}'
    },
    launch: {
      label: 'Launch day, January 1, 2027',
      subject: 'Israel Insider launches January 1',
      body: '{hi}\n\nThank you for your blessing on your page ({page}).\n\nIsrael Insider launches fully on January 1, 2027. If you\u2019re willing, a short post or mention that day would help readers find you and the other voices there. I\u2019m glad to send a ready-made image or a line you can use.\n\n{sign}',
      dm: '{hi} Israel Insider launches fully on Jan 1, 2027. A short mention that day would mean a lot, and helps readers find your page: {page}. Happy to send an image you can use.'
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
  function fill(t, v, st, short, o) {
    var page = SITE + '/#/voice/' + v.slug, reply = o && o.token ? SITE + '/r/' + o.token : page;
    var latest = st && st.title ? '\nIt opens with your latest piece, “' + st.title + '”.\n' : '';
    var hi = greet(v); if (short) hi = hi.replace(/,$/, '!').replace(/ team!$/, ' team!');
    return (short ? t.dm : t.body).replace(/\{hi\}/g, hi).replace(/\{page\}/g, page).replace(/\{reply\}/g, reply).replace(/\{latest\}/g, latest).replace(/\{sign\}/g, LS.get('sign', DEF_SIGN));
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
      var api = A.api, say = A.say, V = [], O = {}, S = {}, R = [], SET = {}, open = null, shown = 30;
      var hm = (location.hash.match(/[#&]o=([^&]+)/) || [])[1]; if (hm) open = decodeURIComponent(hm);
      var f = { st: hm ? 'all' : LS.get('fst', 'today'), sort: LS.get('fsort', 'good'), q: '', has: LS.get('fhas', '') === '1' };
      function load() {
        return Promise.all([api('voices'), api('outreach'), api('responses')]).then(function (r) { V = r[0].voices.filter(function (v) { return v.status === 'listed' || (open && v.id === open) }); O = r[1].outreach || {}; S = r[1].stats || {}; SET = r[1].settings || {}; R = r[2].responses || []; draw(); if (open) { var c = el.querySelector('[data-v="' + open + '"]'); if (c) c.scrollIntoView({ block: 'start' }) } });
      }
      function rows() {
        var q = f.q.toLowerCase();
        var l = V.filter(function (v) {
          var o = O[v.id] || {}, st = o.status || '';
          var td = new Date().toISOString().slice(0, 10); if (f.st === 'today' && !((!st && o.plan && o.plan <= td) || (o.next && o.next <= td && st === 'contacted'))) return false;
          if (f.st === 'todo' && st) return false; if (f.st === 'due' && !(o.next && o.next <= new Date().toISOString().slice(0, 10) && st !== 'declined' && st !== 'no-contact')) return false;
          if (f.st !== 'all' && f.st !== 'todo' && f.st !== 'due' && f.st !== 'today' && st !== f.st) return false;
          if (f.has && !CH.some(function (c) { return o[c[0]] })) return false;
          if (q && (v.name + ' ' + v.short_bio + ' ' + (v.topics || []).join(' ')).toLowerCase().indexOf(q) < 0) return false; return true
        });
        l.forEach(function (v) { v._s = score(v, S[v.id]) });
        l.sort(f.sort === 'good' ? function (a, b) { return b._s - a._s || a.name.localeCompare(b.name) } : f.sort === 'recent' ? function (a, b) { var x = (O[a.id] || {}).log, y = (O[b.id] || {}).log; return String(y && y.length ? y[y.length - 1].at : '').localeCompare(String(x && x.length ? x[x.length - 1].at : '')) } : function (a, b) { return a.name.localeCompare(b.name) });
        return l;
      }
      function cnt(k) { return V.filter(function (v) { var o = O[v.id] || {}, s = o.status || ''; var td = new Date().toISOString().slice(0, 10); return k === 'all' ? true : k === 'today' ? ((!s && o.plan && o.plan <= td) || (o.next && o.next <= td && s === 'contacted')) : k === 'todo' ? !s : k === 'due' ? (o.next && o.next <= new Date().toISOString().slice(0, 10) && s !== 'declined' && s !== 'no-contact') : s === k }).length }
      function draw() {
        var l = rows(), withC = V.filter(function (v) { return CH.some(function (c) { return (O[v.id] || {})[c[0]] }) }).length, unchecked = V.filter(function (v) { return !(O[v.id] && O[v.id].found_at) }).length;
        el.innerHTML =
          '<details class="card"' + (LS.get('setdone', '') ? '' : ' open') + '><summary><b>Your details for messages</b> <span class="sm">(kept in this browser)</span></summary>' +
          '<div class="row"><div><label for="o-from">Send email from (Gmail address)</label><input id="o-from" value="' + esc(LS.get('from', '')) + '" placeholder="you@gmail.com"></div><div><label for="o-app">Email opens in</label><select id="o-app"><option value="gmail"' + (LS.get('app', 'gmail') === 'gmail' ? ' selected' : '') + '>Gmail in the browser</option><option value="mailto"' + (LS.get('app', 'gmail') === 'mailto' ? ' selected' : '') + '>My default mail app</option></select></div></div>' +
          '<div class="row"><div><label for="o-alert">Send reply alerts to</label><input id="o-alert" value="' + esc(SET.alert || '') + '" placeholder="the Gmail you want replies in"></div></div><p class="sm">Use the same Gmail for sending and for alerts. Then every email reply and every one-click answer lands in one inbox, where they are processed in batches.</p>' +
          '<label for="o-sign">Signature</label><textarea id="o-sign" rows="3">' + esc(LS.get('sign', DEF_SIGN)) + '</textarea><p><button id="o-save">Save details</button></p></details>' +
          respPanel() + planPanel() +
          '<div class="card"><div class="row" style="align-items:end"><div><label for="o-st">Show</label><select id="o-st">' +
          [['today', 'Today\u2019s list'], ['todo', 'Not contacted yet'], ['due', 'Follow-up due']].concat(STATUS.slice(1).map(function (s) { return [s[0], s[1]] })).concat([['all', 'Everyone']]).map(function (s) { return '<option value="' + s[0] + '"' + (f.st === s[0] ? ' selected' : '') + '>' + esc(s[1]) + ' (' + cnt(s[0]) + ')</option>' }).join('') +
          '</select></div><div><label for="o-sort">Order</label><select id="o-sort"><option value="good"' + (f.sort === 'good' ? ' selected' : '') + '>Best pages first</option><option value="name"' + (f.sort === 'name' ? ' selected' : '') + '>A to Z</option><option value="recent"' + (f.sort === 'recent' ? ' selected' : '') + '>Last contacted</option></select></div>' +
          '<div><label for="o-q">Search</label><input id="o-q" value="' + esc(f.q) + '" placeholder="name, topic"></div><div><label><input type="checkbox" id="o-has" style="width:auto"' + (f.has ? ' checked' : '') + '> Only with contact details</label></div></div>' +
          '<p class="sm">' + V.length + ' listed voices · ' + withC + ' with contact details · ' + unchecked + ' not yet searched. <button id="o-find" style="min-height:32px">Find contact details' + (unchecked ? ' (' + unchecked + ' left)' : '') + '</button></p>' +
          '<p class="sm">★★★ means a strong page: items, a photo and recent activity. Start with those. Notes open in your own Gmail or the voice’s own inbox, one at a time, for you to read and send.</p></div>' +
          '<div id="o-list">' + l.slice(0, shown).map(card).join('') + '</div>' + (l.length > shown ? '<p><button id="o-more">Show more (' + (l.length - shown) + ')</button></p>' : (l.length ? '' : '<p class="sm">Nobody here.</p>'));
        wire();
      }
      function respPanel() {
        var need = R.filter(function (r) { return !r.handled }), CH2 = { yes: 'Happy to be included', changes: 'Wants changes', remove: 'Asked to be removed (page taken down)', question: 'Question or comment' };
        return '<div class="card"><h3 style="margin:0 0 6px;font-size:16px">Answers needing you (' + need.length + ')</h3>' + (need.length ? need.slice(0, 40).map(function (r) {
          return '<div style="border-top:1px solid #eee;padding:8px 0"><b>' + esc(r.name) + '</b> <span class="tag">' + esc(CH2[r.choice] || r.choice) + '</span>' + (r.link ? '<span class="tag">will link</span>' : '') + (r.guest ? '<span class="tag">guest or topic</span>' : '') + (r.venture ? '<span class="tag" style="background:#fff3c4">joint venture or sponsorship</span>' : '') +
            ' <span class="sm">' + esc(r.via) + ' \u00b7 ' + esc(r.at.slice(0, 16).replace('T', ' ')) + ' UTC</span>' + (r.text ? '<pre>' + esc(r.text) + '</pre>' : '') + (r.contact ? '<div class="sm">Reach them: ' + esc(r.contact) + '</div>' : '') +
            '<button data-ropen="' + esc(r.voice_id) + '" style="min-height:32px">Open</button> <button data-rdone="' + esc(r.id) + '" style="min-height:32px">Mark done</button></div>' }).join('') : '<p class="sm">Nothing waiting. One-click answers land here and in your alert inbox.</p>') +
          '<p class="sm">' + R.length + ' answers in all. A plain \u201chappy to be included\u201d is filed by itself; anything with a note, a question, a guest or partnership interest waits here.</p></div>';
      }
      function planPanel() {
        var by = {}; V.forEach(function (v) { var o = O[v.id] || {}; if (!o.status && o.plan) by[o.plan] = (by[o.plan] || 0) + 1 });
        var ds = Object.keys(by).sort(), notp = V.filter(function (v) { var o = O[v.id] || {}; return !o.status && !o.plan }).length;
        return '<div class="card"><h3 style="margin:0 0 6px;font-size:16px">Sending plan</h3>' + (ds.length ? '<div class="sm">' + ds.map(function (d) { return '<span class="tag">' + esc(new Date(d + 'T12:00:00Z').toUTCString().slice(0, 11)) + ': ' + by[d] + '</span>' }).join(' ') + '</div>' : '<p class="sm">No plan yet.</p>') +
          '<p class="sm">' + notp + ' listed voices not contacted and not yet planned. Follow-ups are set 10 days after each note. Nothing is planned for Friday or Saturday.</p>' +
          '<div class="row" style="align-items:end"><div><label for="p-start">Start on</label><input id="p-start" type="date" value="' + esc(new Date(Date.now() + 864e5).toISOString().slice(0, 10)) + '"></div><div><label for="p-days">Over how many days</label><input id="p-days" type="number" min="1" max="60" value="14"></div><div><label for="p-per">Notes a day (blank: spread evenly)</label><input id="p-per" type="number" min="1" max="40" value=""></div><div><button id="p-go" class="p">Plan first notes, best pages first</button></div></div></div>';
      }
      function card(v) {
        var o = O[v.id] || {}, st = S[v.id] || {}, s = score(v, st), isOpen = open === v.id, page = SITE + '/#/voice/' + v.slug;
        var has = CH.filter(function (c) { return o[c[0]] }).map(function (c) { return c[1] });
        var last = o.log && o.log.length ? o.log[o.log.length - 1] : null;
        var h = '<div class="card" data-v="' + esc(v.id) + '"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          (v.avatar ? '<img src="' + esc(v.avatar) + '" alt="" width="40" height="40" style="border-radius:50%;object-fit:cover">' : '') +
          '<div style="flex:1;min-width:200px"><b>' + esc(v.name) + '</b> <span title="Page strength">' + stars(s) + '</span> <span class="tag" style="background:' + SCOL[o.status || ''] + '">' + esc((STATUS.filter(function (x) { return x[0] === (o.status || '') })[0] || STATUS[0])[1]) + '</span>' +
          (o.next ? ' <span class="sm">follow up ' + esc(o.next) + '</span>' : '') + (!o.status && o.plan ? ' <span class="sm">planned ' + esc(o.plan) + '</span>' : '') + (o.wants_venture ? ' <span class="tag" style="background:#fff3c4">partner interest</span>' : '') + (o.wants_guest ? ' <span class="tag">guest</span>' : '') + (o.wants_link ? ' <span class="tag">will link</span>' : '') +
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
          '<label for="c-body">Email</label><textarea id="c-body" rows="12">' + esc(fill(T[tk], v, st, false, o)) + '</textarea>' +
          '<label for="c-dm">Short version for direct messages</label><textarea id="c-dm" rows="4">' + esc(fill(T[tk], v, st, true, o)) + '</textarea>' +
          '<p class="sm">Email opens a ready draft in your Gmail. For Instagram, Messenger, X, Telegram, LinkedIn and YouTube, the short version is copied first, then their inbox or profile opens: paste it and send. Each click is logged and marks the voice as contacted.</p><p id="c-go">' + goButtons(o) + '</p>' +
          (o.log && o.log.length ? '<div class="sm"><b>History</b><br>' + o.log.slice().reverse().map(function (x) { return esc(x.at.slice(0, 16).replace('T', ' ')) + ' · ' + esc(x.via) + ' · ' + esc(x.what) }).join('<br>') + '</div>' : '') +
          '<details style="margin-top:10px"><summary class="sm"><b>They answered by message, phone or in person</b></summary><div class="row"><div><label for="l-via">How</label><select id="l-via">' + ['Email', 'Instagram DM', 'X DM', 'Facebook', 'LinkedIn', 'Telegram', 'WhatsApp', 'Phone', 'In person'].map(function (x) { return '<option>' + x + '</option>' }).join('') + '</select></div><div><label for="l-ch">Their answer</label><select id="l-ch"><option value="yes">Happy to be included</option><option value="changes">Wants changes</option><option value="question">Question or comment</option><option value="remove">Remove me</option></select></div></div>' +
          '<label><input type="checkbox" id="l-link" style="width:auto"> Will link or mention</label><label><input type="checkbox" id="l-guest" style="width:auto"> Guest or topic</label><label><input type="checkbox" id="l-ven" style="width:auto"> Joint venture or sponsorship</label><label for="l-text">Paste what they said</label><textarea id="l-text" rows="3"></textarea><p><button id="l-go">Record their answer</button></p></details>';
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
        q('#o-save').onclick = function () { var al = q('#o-alert').value.trim(); if (al !== (SET.alert || '')) api('outreach/settings', { alert: al }).then(function () { SET.alert = al }).catch(function (e) { say(e.message) }); LS.set('from', q('#o-from').value.trim()); LS.set('app', q('#o-app').value); LS.set('sign', q('#o-sign').value); LS.set('setdone', '1'); say('Saved your details.', true); draw() };
        q('#o-st').onchange = function () { f.st = this.value; LS.set('fst', f.st); shown = 30; draw() };
        q('#o-sort').onchange = function () { f.sort = this.value; LS.set('fsort', f.sort); draw() };
        q('#o-has').onchange = function () { f.has = this.checked; LS.set('fhas', f.has ? '1' : ''); draw() };
        var t; q('#o-q').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { f.q = v; draw(); var i = q('#o-q'); i.focus(); i.setSelectionRange(v.length, v.length) }, 250) };
        q('#o-find').onclick = findAll;
        q('#p-go').onclick = function () { var b = { start: q('#p-start').value, days: +q('#p-days').value || 14 }; if (q('#p-per').value) b.per_day = +q('#p-per').value; api('outreach/plan', b).then(function (r) { say('Planned ' + r.planned + ' first notes, about ' + r.per_day + ' a working day.' + (r.unplanned ? ' ' + r.unplanned + ' did not fit; plan more days to include them.' : ''), true); return load() }).catch(function (e) { say(e.message) }) };
        el.querySelectorAll('[data-rdone]').forEach(function (b) { b.onclick = function () { api('response', { id: b.dataset.rdone }).then(load).catch(function (e) { say(e.message) }) } });
        el.querySelectorAll('[data-ropen]').forEach(function (b) { b.onclick = function () { open = b.dataset.ropen; f.st = 'all'; draw(); var c = el.querySelector('[data-v="' + open + '"]'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }) } });
        if (q('#o-more')) q('#o-more').onclick = function () { shown += 30; draw() };
        q('#o-list').onclick = function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.dataset.open) { open = open === b.dataset.open ? null : b.dataset.open; draw(); var c = el.querySelector('[data-v="' + open + '"]'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
          var v = cur(); if (!v) return;
          if (b.id === 'c-save') { save(fields()).then(draw); return }
          if (b.id === 'c-find') { say('Searching ' + v.name + '\u2019s site\u2026', true); api('outreach/find', { ids: [v.id], force: true }).then(function (r) { return load().then(function () { say('Searched ' + v.name + '\u2019s site: ' + r.found + ' new details found.', true) }) }).catch(function (e2) { say(e2.message) }); return }
          if (b.id === 'l-go') { api('response/log', { voice_id: v.id, via: q('#l-via').value, choice: q('#l-ch').value, link: q('#l-link').checked, guest: q('#l-guest').checked, venture: q('#l-ven').checked, text: q('#l-text').value }).then(function () { say('Recorded ' + v.name + '\u2019s answer.', true); return load() }).catch(function (e2) { say(e2.message) }); return }
          if (b.dataset.log) { save({ log: { via: b.dataset.log, what: 'logged by hand' }, status: b.dataset.log === 'their reply' ? 'replied' : undefined }).then(draw); return }
          if (b.dataset.go) {
            var p = fields(), tk = q('#c-tpl').value, subj = q('#c-subj').value, body = q('#c-body').value, dm = q('#c-dm').value;
            var oo = {}; for (var k in p) oo[k] = p[k];
            var L = links(oo, subj, body, dm).filter(function (x) { return x[0] === b.dataset.go })[0]; if (!L) return;
            var w = window.open('about:blank', '_blank');
            (L[3] ? copy(dm) : Promise.resolve()).then(function () {
              if (w) w.location = L[2]; else location.href = L[2];
              if (L[3]) say('The short message is copied. Paste it into ' + L[1] + ' and send.', true);
              p.log = { via: L[1], what: T[tk].label, sent: true }; if (!p.status) p.status = 'contacted';
              if (!p.next) { var d = new Date(Date.now() + 10 * 864e5); p.next = d.toISOString().slice(0, 10) }
              return save(p, true).then(draw);
            });
          }
        };
        var tpl = q('#c-tpl'); if (tpl) tpl.onchange = function () { var v = cur(); LS.set('tpl_' + v.id, this.value); q('#c-subj').value = T[this.value].subject; q('#c-body').value = fill(T[this.value], v, S[v.id], false, O[v.id]); q('#c-dm').value = fill(T[this.value], v, S[v.id], true, O[v.id]) };
        el.querySelectorAll('[data-c]').forEach(function (i) { i.addEventListener('input', function () { var g = q('#c-go'); var o = {}; el.querySelectorAll('[data-c]').forEach(function (j) { o[j.dataset.c] = clean(j.dataset.c, j.value) }); g.innerHTML = goButtons(o) }) });
      }
      return load();
    }
  };
})();
