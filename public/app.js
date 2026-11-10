// Israel Insider front end. Hash routed, reads the JSON API, keeps one audio player alive across pages.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $('#view');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // headshot when the voice has one, initials otherwise
  var fi = function (v) { v = v || {}; return v.avatar && /^https:\/\//.test(v.avatar) ? '<img class="hs" src="' + esc(v.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=\'' + esc(initials(v.name)).replace(/'/g, '') + '\'">' : esc(initials(v.name)); };
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
    return '<span class="by"><span class="av">' + fi(v) + '</span><a href="#/voice/' + esc(v.slug) + '">' + esc(v.name) + '</a></span>';
  }
  function thumb(i, sq) {
    var v = i.voice || {};
    var img = i.thumbnail_url && /^https:/.test(i.thumbnail_url) ? '<img class="thumbimg" loading="lazy" alt="" src="' + esc(i.thumbnail_url) + '">' : '';
    return '<span class="mk">' + esc(initials(v.name)) + '</span>' + img;
  }
  var IC = {"x":"M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z","facebook":"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z","whatsapp":"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z","telegram":"M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z","linkedin":"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z","bluesky":"M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z","threads":"M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z","reddit":"M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z","instagram":"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077","tiktok":"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z","email":"M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z","link":"M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z","more":"M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"};
  function ico(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC[k] + '"/></svg>'; }
  var SITE = 'https://israelinsider.org/';
  var NET = [['x', 'X', 'X', function (u, t) { return 'https://x.com/intent/post?text=' + t + '&url=' + u; }], ['facebook', 'Facebook', 'f', function (u) { return 'https://www.facebook.com/sharer/sharer.php?u=' + u; }], ['whatsapp', 'WhatsApp', 'WA', function (u, t) { return 'https://wa.me/?text=' + t + '%20' + u; }], ['telegram', 'Telegram', 'TG', function (u, t) { return 'https://t.me/share/url?url=' + u + '&text=' + t; }], ['linkedin', 'LinkedIn', 'in', function (u) { return 'https://www.linkedin.com/sharing/share-offsite/?url=' + u; }], ['bluesky', 'Bluesky', 'Bs', function (u, t) { return 'https://bsky.app/intent/compose?text=' + t + '%20' + u; }], ['threads', 'Threads', '@', function (u, t) { return 'https://www.threads.net/intent/post?text=' + t + '%20' + u; }], ['reddit', 'Reddit', 'Re', function (u, t) { return 'https://www.reddit.com/submit?url=' + u + '&title=' + t; }], ['email', 'Email', '\u2709', function (u, t) { return 'mailto:?subject=' + t + '&body=' + t + '%0A%0A' + u; }]];
  function shareRow(url, title, big) {
    if (!/^https?:\/\//i.test(url || '')) return '';
    var u = encodeURIComponent(url), t = encodeURIComponent((title || 'Israel Insider') + ' via Israel Insider');
    return '<div class="share' + (big ? ' big' : '') + '"><span class="sl">Share</span>' + NET.map(function (n) { return '<a class="sh ' + n[0] + '" href="' + esc(n[3](u, t)) + '" target="_blank" rel="noopener" aria-label="Share on ' + n[1] + '" title="' + n[1] + '">' + (big ? '<b>' + ico(n[0]) + '</b>' + n[1] : ico(n[0])) + '</a>'; }).join('') + '<button class="sh copy" type="button" data-copy="' + esc(url) + '" aria-label="Copy link" title="Copy link">' + (big ? '<b>' + ico('link') + '</b>Copy link' : ico('link')) + '</button>' + (navigator.share ? '<button class="sh nat" type="button" data-native="' + esc(url) + '" data-title="' + esc(title || '') + '" aria-label="More share options">' + (big ? '<b>' + ico('more') + '</b>More' : ico('more')) + '</button>' : '') + '</div>';
  }
  function card0(i) {
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
    return '<article class="card social"><div class="post"><div class="by"><span class="av">' + fi(v) + '</span><span>' + esc(v.name) + '</span></div><p class="tx">' + esc(i.excerpt || i.title) + '</p><div class="meta"><span>' + ago(i.published_at) + '</span><a href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">Open original</a></div></div></article>';
  }
  function card(i) { var h = card0(i), k = h.lastIndexOf('</article>'); return k < 0 ? h : h.slice(0, k) + itemChips(i) + shareRow(i.url, i.title) + h.slice(k); }
  function grid(items, cls) { return items.length ? '<div class="grid ' + (cls || 'g3') + '">' + items.map(card).join('') + '</div>' : ''; }
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
  var SUBKEY = 'ii_sub';
  function subMe() { try { return JSON.parse(localStorage.getItem(SUBKEY) || 'null'); } catch (e) { return null; } }
  function subSave(o) { try { localStorage.setItem(SUBKEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
  function welcomeHtml(name, fresh) {
    var hi = name ? 'Welcome' + (fresh ? '' : ' back') + ', ' + esc(name) + '.' : (fresh ? 'Welcome aboard.' : 'Welcome back.');
    return '<div class="welcome" role="status"><b>' + hi + '</b><p>' + (fresh ? 'You are on the list for the Israel Insider digest. Here is where to start.' : 'You are subscribed. Pick up where you left off.') + '</p><ul><li><a href="#/voices">Browse the voices directory</a></li><li><a href="#/listen">Find something to listen to</a></li><li><a href="#/share">Tell a friend about the site</a></li></ul></div>';
  }
  function topGreet() {
    var m = subMe(), b = document.querySelector('.topb .btn.line'); if (!b) return;
    if (m) { b.textContent = m.name ? 'Hi, ' + m.name : 'Subscribed'; b.setAttribute('href', '#/subscribe'); b.classList.add('is-sub'); }
  }
  function subForm(id) {
    var me = subMe(); if (me) return welcomeHtml(me.name, false);
    return '<form class="subf" novalidate><input type="text" name="name" maxlength="40" autocomplete="given-name" aria-label="First name (optional)" placeholder="First name (optional)"><input type="email" name="email" required autocomplete="email" aria-label="Email address" placeholder="you@example.com"><button class="btn" type="submit">Subscribe</button><label class="chk"><input type="checkbox" name="consent" value="1" required>Send me the Israel Insider digest by email. Unsubscribe any time.</label><div class="submsg" role="status"></div></form>';
  }
  function browsePanel() {
    var cats = (TAXIDX.raw && TAXIDX.raw.cats) || [];
    if (!cats.length) return '';
    return '<div class="panel"><h3>browse</h3><div class="pb"><ul class="nlist cl">' + cats.map(function (c) { return '<li><a href="#/cat/' + esc(c.slug) + '">' + esc(c.name) + '</a>' + (c.count ? '<span class="n">' + c.count + '</span>' : '') + '</li>'; }).join('') + '</ul><div class="rw"><a href="#/topics">All topics and tags</a></div></div></div>';
  }
  function tagsPanel() {
    var tg = ((TAXIDX.raw && TAXIDX.raw.tags) || []).slice(0, 14);
    return tg.length ? '<div class="panel"><h3>popular tags</h3><div class="pb">' + chipRow(tg.map(function (g) { return g.slug; }), chipT) + '</div></div>' : '';
  }
  function recentVoices(voices) {
    var l = voices.slice().sort(function (a, b) { return (b.listed_on || '').localeCompare(a.listed_on || ''); }).slice(0, 6);
    if (!l.length) return '';
    return '<div class="panel"><h3>recent voices</h3><div class="pb">' + l.map(function (v) { return '<div class="rw"><span class="av">' + fi(v) + '</span><div><a href="#/voice/' + esc(v.slug) + '">' + esc(v.name) + '</a>' + (v.listed_on ? '<span class="meta">Listed ' + esc(dfmt(v.listed_on)) + '</span>' : '') + '</div></div>'; }).join('') + '<div class="rw"><a href="#/voices">All voices</a></div></div></div>';
  }
  function sideCol() {
    return sideData().then(function (d) {
      var latest = d.items.slice(0, 5).map(function (i) { return '<div class="rw"><span class="dot" style="background:var(--' + i.format + ')"></span><div><a href="' + (i.format === 'read' || i.format === 'social' ? esc(safeUrl(i.url)) + '" target="_blank" rel="noopener' : '#/' + i.format) + '">' + esc(i.title) + '</a><span class="meta">' + esc((i.voice || {}).name) + ' · ' + ago(i.published_at) + '</span></div></div>'; }).join('');
      var pod = d.items.filter(function (i) { return i.format === 'listen' && i.audio_url; })[0];
      var vl = d.voices.slice(0, 8).map(function (v) { return '<div class="rw"><span class="av">' + fi(v) + '</span><a href="#/voice/' + esc(v.slug) + '">' + esc(v.name) + '</a></div>'; }).join('');
      return '<aside class="side" aria-label="Widgets">' +
        '<div class="cta"><b>Have a voice on Israel?</b><span>Get your content listed.</span><a class="btn big" href="#/submit">Submit Content</a></div>' +
        '<div class="panel subp"><h3>subscribe</h3><div class="pb"><span>The best new voices in your inbox.</span>' + subForm() + '<div class="rw"><a href="/api/rss">Or follow by RSS</a></div></div></div>' +
        browsePanel() + tagsPanel() +
        '<div class="panel"><h3>share</h3><div class="pb">' + shareRow(SITE, 'Israel Insider: Pro-Israel voices in one place') + '</div></div>' +
        '<div class="adslot" data-slot="rect-300x250">' + houseAd('rect-300x250', '') + '</div>' +
        (latest ? '<div class="panel"><h3>latest voices</h3><div class="pb">' + latest + '</div></div>' : '') +
        (pod ? '<div class="panel"><h3>listen now</h3><div class="pb"><span class="kick" style="color:var(--listen)">' + esc((pod.voice || {}).name) + '</span><b>' + esc(pod.title) + '</b><button class="btn sm" type="button" data-play="' + esc(pod.id) + '" style="background:var(--listen)">Play</button></div></div>' : '') +
        recentVoices(d.voices) +
        '<div class="panel"><h3>from israel nowlej</h3><div class="pb"><span>News, views, media and sources.</span><a class="btn line sm" href="https://israelnowlej.com" target="_blank" rel="noopener">Visit Israel NOWlej</a></div></div>' +
        '<div class="adslot" data-slot="rect-300x250-b"><a class="adbox alt" data-slot="rect-300x250-b" href="#/submit"><small>Advertisement</small><b>Sponsor Israel Insider</b><span>Reach readers of Israel voices</span></a></div>' +
        '</aside>';
    }).catch(function (e) { console.error('sideCol', e); return ''; });
  }
  function shareHome(posts) { return '<section class="sec social">' + sech('social', 'Share', 'Spread the word on every network', ['#/share', 'All sharing']) + '<div class="panel"><div class="pb">' + shareRow(SITE, 'Israel Insider: Pro-Israel voices in one place', true) + '</div></div>' + (posts.length ? '<div style="margin-top:18px">' + grid(posts, 'g3').replace(/^/, '') + '</div>' : '') + '</section>'; }
  var KIND = { petition: 'Petition', event: 'Event', donate: 'Donate', campus: 'Campus', volunteer: 'Volunteer', factcheck: 'Fact-check', correction: 'Correction', tracker: 'Tracker' };
  var KPLURAL = { petition: 'Petitions', event: 'Events', donate: 'Donate', campus: 'Campus', volunteer: 'Volunteer', factcheck: 'Fact-checks', correction: 'Corrections', tracker: 'Trackers' };
  var ACTK = ['event', 'petition', 'donate', 'campus', 'volunteer'], MONK = ['factcheck', 'correction', 'tracker'];
  function dfmt(s) { if (!s) return ''; var d = new Date(s + 'T12:00:00'); if (isNaN(d)) return ''; return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function entryCard(e) {
    var act = e.type === 'act', cls = act ? 'act' : 'monitor';
    var when = e.date ? (e.kind === 'event' ? dfmt(e.date) : e.kind === 'petition' ? 'Closes ' + dfmt(e.date) : dfmt(e.date)) : '';
    var cta = e.kind === 'event' ? 'Details and tickets' : e.kind === 'petition' ? 'Sign' : e.kind === 'donate' ? 'Donate' : e.kind === 'volunteer' ? 'Volunteer' : e.kind === 'campus' ? 'Open resource' : 'Read the source';
    return '<article class="card ' + cls + '"><div class="bd"><span class="kick">' + esc(KIND[e.kind] || e.kind) + (e.org ? ' · ' + esc(e.org) : '') + '</span><h3><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a></h3>' + (e.summary ? '<p class="ex">' + esc(e.summary) + '</p>' : '') + '<div class="meta">' + (when ? '<span class="when">' + esc(when) + '</span>' : '') + (e.location ? '<span>' + esc(e.location) + '</span>' : '') + (!act ? '<span>Source: ' + esc(host(e.url)) + '</span>' : '') + '</div><div class="acts"><a class="btn sm" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener" style="background:var(--' + cls + ')">' + cta + '</a></div></div>' + shareRow(e.url, e.title) + '</article>';
  }
  function entries(qs) { return api('/api/entries?' + qs).then(function (r) { return r.entries; }).catch(function () { return []; }); }
  function entryPage(type, q) {
    var km = /[?&]kind=([^&]*)/.exec(q), kind = km ? decodeURIComponent(km[1]) : '', ks = type === 'act' ? ACTK : MONK, name = type === 'act' ? 'Act' : 'Monitor';
    var head = type === 'act' ? sech('act', 'Act', 'Petitions, events, donations and campus resources', ['#/propose?type=act', 'Submit an item']) : sech('monitor', 'Monitor', 'Fact-checks, corrections and trackers on public claims', ['#/propose?type=monitor', 'Submit an item']);
    var note = type === 'monitor' ? '<p class="ex scope">Monitor covers public organizations, media outlets, official statements and documented campaigns. Every entry cites a source and a date. It does not profile private individuals.</p>' : '';
    if (kind) return entries('type=' + type + '&kind=' + encodeURIComponent(kind) + '&limit=60').then(function (l) { return '<section class="sec ' + type + '" style="padding-top:26px">' + head + note + (l.length ? '<div class="grid g3">' + l.map(entryCard).join('') + '</div>' : empty('Nothing listed here yet. Know of something? Submit an item.')) + '</section>'; });
    return entries('type=' + type + '&limit=100').then(function (l) {
      var body = ks.map(function (k) { var x = l.filter(function (e) { return e.kind === k; }).slice(0, 6); return x.length ? sech(type, KPLURAL[k], '', ['#/' + type + '?kind=' + k, 'All ' + KPLURAL[k].toLowerCase()]) + '<div class="grid g3" style="margin-bottom:20px">' + x.map(entryCard).join('') + '</div>' : ''; }).join('');
      return '<section class="sec ' + type + '" style="padding-top:26px">' + head + note + (body || empty('Nothing listed yet. Submit the first item.')) + '</section>';
    });
  }
  function proposeForm(type) {
    var ks = type === 'monitor' ? MONK : ACTK;
    return '<div style="max-width:760px"><section class="sec ' + type + '" style="padding-top:26px">' + sech(type, 'Submit an item', type === 'monitor' ? 'For Monitor' : 'For Act') + '<form class="frm" id="pf" novalidate><input type="hidden" name="type" value="' + type + '"><div class="fld"><label for="pk">Kind</label><select id="pk" name="kind">' + ks.map(function (k) { return '<option value="' + k + '">' + esc(KIND[k]) + '</option>'; }).join('') + '</select></div><div class="fld"><label for="pt">Title</label><input id="pt" name="title" required maxlength="200"></div><div class="fld"><label for="pu">Link (https)' + (type === 'monitor' ? ', the source' : '') + '</label><input id="pu" name="url" type="url" required placeholder="https://"></div><div class="fld"><label for="po">Organization' + (type === 'monitor' ? ' or outlet' : '') + '</label><input id="po" name="org"></div><div class="fld"><label for="ps">Summary, 300 characters</label><textarea id="ps" name="summary" maxlength="300"></textarea></div><div class="fld"><label for="pd">Date' + (type === 'monitor' ? ' of the source' : ': event date or petition deadline') + '</label><input id="pd" name="date" type="date"' + (type === 'monitor' ? ' required' : '') + '></div><div class="fld"><label for="pl">Location</label><input id="pl" name="location"></div><div class="fld"><label for="pe">Your contact email</label><input id="pe" name="email" type="email" required></div>' + (type === 'monitor' ? '<label class="chk" for="psc"><input id="psc" type="checkbox" name="scope_ok" value="1">This item concerns a public organization, outlet, statement or campaign, not a private individual.</label>' : '') + '<label class="chk" for="pc"><input id="pc" type="checkbox" name="consent" value="1">Israel Insider may publish this item with a link to the page above. An editor reviews every submission.</label><div><button class="btn big" type="submit">Send for review</button></div><div id="pmsg" role="status"></div></form></section></div>';
  }
  var SECT = { read: ['blog', 'substack', 'oped', 'editorial'], listen: ['podcast'], watch: ['vlog'] };
  var SL = { blog: 'Blogs', substack: 'Substack', oped: 'Op-eds', editorial: 'Editorials', podcast: 'Podcasts', vlog: 'Vlogs' };
  var SLONE = { blog: 'Blog', substack: 'Substack', oped: 'Op-ed', editorial: 'Editorial', podcast: 'Podcast', vlog: 'Vlog' };
  var SDESC = { blog: 'Independent and institutional blogs', substack: 'Writers publishing on Substack and by newsletter', oped: 'Columnists and commentators', editorial: 'Outlets, editorial pages and policy institutes', podcast: 'Shows to play here or in your app', vlog: 'Video channels and vloggers' };
  var TAXP = null, TAXIDX = { cats: {}, subs: {}, tags: {} }, LASTSUB = null;
  var DEFCATS = [['security', 'Security'], ['politics', 'Politics'], ['history', 'History'], ['culture', 'Society'], ['faith', 'Faith'], ['business', 'Business'], ['advocacy', 'Antisemitism'], ['diaspora', 'Diaspora']];
  function taxData() {
    if (!TAXP) TAXP = api('/api/taxonomy').then(function (t) {
      TAXIDX = { cats: {}, subs: {}, tags: {}, raw: t };
      t.cats.forEach(function (c) { TAXIDX.cats[c.slug] = c; c.subs.forEach(function (s) { TAXIDX.subs[s.slug] = { slug: s.slug, name: s.name, count: s.count, parent: c.slug }; }); });
      t.tags.forEach(function (g) { TAXIDX.tags[g.slug] = g; });
      if (LASTSUB) renderSub(LASTSUB[0], LASTSUB[1], LASTSUB[2]);
      return t;
    }).catch(function () { return { cats: [], tags: [] }; });
    return TAXP;
  }
  function catName(s) { var c = TAXIDX.cats[s]; return c ? c.name : (TAXIDX.subs[s] ? TAXIDX.subs[s].name : s); }
  function tagName(s) { var g = TAXIDX.tags[s]; return g ? g.name : s.replace(/-/g, ' '); }
  function chipC(s) { return '<a class="chip sm" href="#/cat/' + esc(s) + '">' + esc(catName(s)) + '</a>'; }
  function chipT(s) { return '<a class="chip sm tg" href="#/tag/' + esc(s) + '">#' + esc(tagName(s)) + '</a>'; }
  function itemChips(i) {
    var c = (i.subs && i.subs[0]) || (i.cats && i.cats[0]), tg = (i.tags || []).slice(0, 2);
    if (!c && !tg.length) return '';
    return '<div class="tgrow">' + (c && (TAXIDX.cats[c] || TAXIDX.subs[c]) ? chipC(c) : '') + tg.map(chipT).join('') + '</div>';
  }
  function chipRow(list, fn) { return list.length ? '<div class="chips">' + list.map(fn).join('') + '</div>' : ''; }
  function relBlock(rc, rt) {
    var rcl = (rc || []).filter(function (s) { return TAXIDX.cats[s]; }), rtl = (rt || []).filter(function (s) { return TAXIDX.tags[s]; });
    return (rcl.length ? '<h3 class="rl">Related categories</h3>' + chipRow(rcl, chipC) : '') + (rtl.length ? '<h3 class="rl">Related tags</h3>' + chipRow(rtl, chipT) : '');
  }
  // One row of the most recent posters: face (or initials), name, link to the full Voice page.
  function posterRow(l) {
    var seen = {}, v = [];
    l.forEach(function (i) { if (i.voice && !seen[i.voice.slug]) { seen[i.voice.slug] = 1; v.push(i.voice); } });
    if (!v.length) return '';
    return '<div class="posters" aria-label="Most recent posters">' + v.slice(0, 12).map(function (x) {
      var face = x.avatar && /^https:\/\//.test(x.avatar) ? '<img src="' + esc(x.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : fi(x);
      return '<a class="poster" href="#/voice/' + esc(x.slug) + '"><span class="face">' + face + '</span><span class="pn">' + esc(x.name) + '</span></a>';
    }).join('') + '</div>';
  }
  function catPage(slug) {
    return taxData().then(function () {
      var sub = TAXIDX.subs[slug], cat = TAXIDX.cats[sub ? sub.parent : slug];
      if (!cat) return '<section class="sec" style="padding-top:26px">' + sech('', 'Category not found', '') + empty('This category does not exist. See all topics.') + '</section>';
      return items('cat=' + encodeURIComponent(slug) + '&limit=60').then(function (l) {
        var name = sub ? sub.name : cat.name;
        var crumb = '<p class="crumb"><a href="#/topics">Topics</a> &rsaquo; ' + (sub ? '<a href="#/cat/' + esc(cat.slug) + '">' + esc(cat.name) + '</a> &rsaquo; ' + esc(sub.name) : esc(cat.name)) + '</p>';
        var subs = cat.subs.length ? '<h3 class="rl">' + (sub ? 'In ' + esc(cat.name) : 'Subcategories') + '</h3>' + chipRow(cat.subs, function (s) { return '<a class="chip' + (sub && s.slug === slug ? ' on' : '') + '" href="#/cat/' + esc(s.slug) + '">' + esc(s.name) + (s.count ? ' ' + s.count : '') + '</a>'; }) : '';
        return '<section class="sec" style="padding-top:26px">' + crumb + sech('', name, sub ? '' : cat.desc) + posterRow(l) + subs + relBlock(cat.related_cats.filter(function (s) { return s !== cat.slug; }), cat.related_tags) + '<div style="margin-top:22px">' + (l.length ? grid(l, 'g3') : empty('Nothing in this category yet.')) + '</div></section>';
      });
    });
  }
  function tagPage(slug) {
    return taxData().then(function () {
      var g = TAXIDX.tags[slug];
      return items('tag=' + encodeURIComponent(slug) + '&limit=60').then(function (l) {
        var name = g ? g.name : slug.replace(/-/g, ' ');
        return '<section class="sec" style="padding-top:26px"><p class="crumb"><a href="#/topics">Topics</a> &rsaquo; Tags &rsaquo; #' + esc(name) + '</p>' + sech('', '#' + name, g ? g.count + ' ' + (g.count === 1 ? 'item' : 'items') : '') + posterRow(l) + (g ? relBlock(g.related_cats, g.related_tags.filter(function (s) { return s !== slug; })) : '') + '<div style="margin-top:22px">' + (l.length ? grid(l, 'g3') : empty('Nothing tagged this yet.')) + '</div></section>';
      });
    });
  }
  function topicsPage() {
    return taxData().then(function (t) {
      var cats = t.cats.map(function (c) { return '<div class="panel"><h3><a href="#/cat/' + esc(c.slug) + '">' + esc(c.name) + '</a></h3><div class="pb"><p class="ex">' + esc(c.desc) + '</p>' + (c.subs.length ? '<ul class="nlist">' + c.subs.map(function (s) { return '<li><a href="#/cat/' + esc(s.slug) + '">' + esc(s.name) + '</a>' + (s.count ? ' <span class="meta" style="display:inline">' + s.count + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '') + '</div></div>'; }).join('');
      return '<section class="sec" style="padding-top:26px">' + sech('', 'Topics', 'Browse by category, subcategory and tag') + '<div class="grid g3">' + cats + '</div>' + (t.tags.length ? sech('', 'Tags', 'Most used first') + chipRow(t.tags, function (g) { return '<a class="chip tg" href="#/tag/' + esc(g.slug) + '">#' + esc(g.name) + ' ' + g.count + '</a>'; }) : '') + '</section>';
    });
  }
  var DRAFT = '<p class="draftnote">Draft text. This page is standard boilerplate and is being reviewed by counsel.</p>';
  var STATIC = {
    about: ['About', 'Israel Insider is where voices on Israel meet', '<p>Israel Insider gathers writers, podcasters, video creators and public voices who support Israel in one place. Every item links to the creator\'s own page, channel or feed.</p><p>It was once Israel\'s daily newsmagazine. It returns as a home for opinion. It carries no news of its own and no encyclopedia. For news, views, maps and reference, see Israel NOWlej, the family site it belongs to.</p><h2>How it works</h2><ul><li><b>Read, Listen, Watch.</b> Items from listed voices, with a headline, a short excerpt and a link back to the creator.</li><li><b>Share.</b> Every item and the site itself can be shared to every major network.</li><li><b>Act.</b> Petitions, events, donations and campus resources, listed after review.</li><li><b>Monitor.</b> Fact-checks, corrections and trackers on public claims, each with a source and a date.</li></ul><p>Want to take part? <a href="#/submit">Submit content</a> or <a href="#/subscribe">subscribe</a>.</p>'],
    standards: ['Standards', 'Our standards', '<h2>What we list</h2><p>Voices that support Israel and meet basic standards of accuracy and civility. An editor reviews every voice before it is listed.</p><h2>How we use your work</h2><ul><li>We show headlines, excerpts of up to 300 characters and thumbnails, always with credit and a link to the original.</li><li>We show full text only where the creator gives written permission.</li><li>Creators can edit their profile or leave at any time through <a href="#/opt-out">Opt out</a>.</li></ul><h2>What we do not do</h2><ul><li>We do not publish news or encyclopedic content. Israel NOWlej covers that.</li><li>We do not profile private individuals.</li></ul><h2>Act</h2><p>Listings are submitted by organizations and reviewed before they appear. A listing is not an endorsement.</p><h2>Monitor</h2><p>Monitor covers public organizations, media outlets, official statements and documented campaigns. Every entry cites a source and a date. See <a href="#/corrections">Corrections</a> to report an error.</p>'],
    terms: ['Terms', 'Terms of use', DRAFT + '<h2>1. About these terms</h2><p>By using Israel Insider (the site) you accept these terms. If you do not accept them, please do not use the site.</p><h2>2. What the site is</h2><p>Israel Insider lists voices that support Israel and links to their own pages. It shows headlines, short excerpts and thumbnails from their public feeds, with credit and a link to the original. It is not a news service.</p><h2>3. Third-party content</h2><p>Opinions belong to the voices who publish them. Listing a voice or linking to an item is not an endorsement of every statement. We do not control third-party sites and are not responsible for them.</p><h2>4. Submissions</h2><p>When you submit a channel, event, petition, fact-check or message, you confirm that you have the right to submit it and that it is accurate. We may edit, decline, hide or remove any submission. Submitting does not guarantee listing.</p><h2>5. Permissions and opt-out</h2><p>Creators may ask to edit or remove their listing at any time through the <a href="#/opt-out">Opt out</a> page. We act on such requests promptly.</p><h2>6. Names and logos</h2><p>The Israel Insider name, logo and design belong to the publisher. Third-party names and logos belong to their owners and appear only to identify them or to offer sharing.</p><h2>7. Acceptable use</h2><p>Do not misuse the site, try to disrupt it, collect data from it by automated means other than the public feeds we offer, or use it to harass or target private individuals.</p><h2>8. Disclaimer</h2><p>The site is provided as is, without warranties of any kind. Information may be incomplete or out of date.</p><h2>9. Limitation of liability</h2><p>To the fullest extent the law allows, the publisher is not liable for losses arising from use of the site or of any linked content.</p><h2>10. Changes</h2><p>We may update these terms. The date below shows the latest version.</p><p class="ex">Last updated: November 10, 2026. Questions? <a href="#/contact">Contact us</a>.</p>'],
    privacy: ['Privacy', 'Privacy', DRAFT + '<h2>What we collect</h2><ul><li>Your email address, if you subscribe.</li><li>The details you give in submission and contact forms.</li><li>Standard server logs kept by our host, such as IP address, browser type and pages requested, for security and reliability.</li></ul><h2>What we do not do</h2><p>We do not sell personal data. At present the site uses no advertising cookies and no cross-site tracking. If that changes, we will update this page first.</p><h2>On your device</h2><p>Your browser may store the audio player\'s position and settings on your own device. We do not receive them.</p><h2>How we use it</h2><p>To send the digest you subscribed to, review submissions, answer messages and keep the site secure.</p><h2>Other services</h2><ul><li>The site is hosted on Cloudflare.</li><li>Embedded videos load from YouTube\'s privacy-enhanced domain only when you press play.</li><li>Share buttons open the network you choose, which applies its own privacy policy.</li></ul><h2>Your choices</h2><p>You can unsubscribe at any time or ask us to delete what we hold about you through the <a href="#/contact">contact form</a>.</p><h2>Keeping data</h2><p>Subscriber addresses are kept until you unsubscribe. Messages and submissions are kept as long as needed to respond and keep records.</p><p class="ex">Last updated: November 10, 2026.</p>']
  };
  var CTOPICS = ['General', 'Correction', 'Opt out', 'Sponsorship and advertising', 'Press', 'Technical problem'];
  function contactForm(topic, heading, intro) {
    return '<div style="max-width:640px"><section class="sec" style="padding-top:26px">' + sech('', heading, '') + '<p class="ex" style="font-size:16px;margin-bottom:16px">' + intro + '</p><form class="frm" id="cf" novalidate><div class="fld"><label for="cn">Name</label><input id="cn" name="name"></div><div class="fld"><label for="ce">Your email</label><input id="ce" name="email" type="email" required><small>We reply by email.</small></div><div class="fld"><label for="ct">Topic</label><select id="ct" name="topic">' + CTOPICS.map(function (t) { return '<option' + (t === topic ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div><div class="fld"><label for="cm">Message</label><textarea id="cm" name="message" required maxlength="3000" style="min-height:140px"></textarea></div><div><button class="btn big" type="submit">Send message</button></div><div id="cmsg" role="status"></div></form></section></div>';
  }
  function staticPage(key) {
    var s = STATIC[key];
    return '<section class="sec prose" style="padding-top:26px">' + sech('', s[1], '') + s[2] + '</section>';
  }
  function nlList(title, list, more) {
    return '<div class="panel"><h3>' + title + '</h3><div class="pb">' + (list.length ? '<ul class="nlist">' + list.slice(0, 5).map(function (i, k) { return '<li' + (i.i ? ' class="hasimg' + (k === 0 ? ' lead' : '') + '"' : '') + '>' + (i.i ? '<a class="nth" tabindex="-1" aria-hidden="true" href="' + esc(safeUrl(i.u)) + '" target="_blank" rel="noopener"><img src="' + esc(i.i) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>' : '') + '<div><a href="' + esc(safeUrl(i.u)) + '" target="_blank" rel="noopener">' + esc(i.t) + '</a><span class="meta">' + esc(i.src) + ' · ' + ago(i.d) + '</span></div></li>'; }).join('') + '</ul>' : '<p class="ex">Nothing to show right now.</p>') + '<div class="rw"><a href="https://israelnowlej.com' + more + '" target="_blank" rel="noopener">All ' + title + ' on Israel NOWlej</a></div></div></div>';
  }
  function nlBlock(nl) {
    return '<section class="sec">' + sech('', 'From Israel NOWlej', 'The latest news and views, from israelnowlej.com', ['#/nowlej', 'All sections']) + '<div class="nlcols">' + nlList('news', nl.news || [], '/news/') + nlList('views', nl.views || [], '/views/') + '</div></section>';
  }
  var CURARG = '', CURQ = '';
  var routes = {
    home: function () {
      return Promise.all([items('limit=60'), api('/api/voices'), api('/api/nowlej').catch(function () { return { news: [], views: [] }; })]).then(function (a) {
        var all = a[0], voices = a[1].voices, nl = a[2];
        if (!all.length && !voices.length) {
          return '<section class="sec"><h1>Voices on Israel, in one place</h1><p class="ex" style="margin:10px 0 18px;max-width:60ch">Israel Insider gathers writers, podcasters, video creators and public voices who support Israel. Every item links to the creator\'s own page. The first voices are being added now.</p><a class="btn big" href="#/submit">Submit Content</a></section>' + nlBlock(nl);
        }
        var by = function (t) { return all.filter(function (i) { return i.format === t; }); };
        var vo = voices.length ? '<section class="sec">' + sech('', 'Voices', 'Writers, shows and channels', ['#/voices', 'All voices']) + '<div class="voices">' + voices.slice(0, 8).map(voiceTile).join('') + '</div></section>' : '';
        return section('read', by('read'), 'Read', 'Essays, columns, Substack and blog posts', 'g3', 3) + section('listen', by('listen'), 'Listen', 'Audio-only podcasts, played here or in your app', 'g3', 3) + section('watch', by('watch'), 'Watch', 'Video podcasts, vlogs, talks and explainers', 'g3', 3) + shareHome(by('social')) + vo + nlBlock(nl);
      });
    },
    subscribe: function () { return Promise.resolve('<section class="sec" style="padding-top:26px">' + sech('', 'Subscribe', 'A digest of new voices by email, or follow by RSS') + '<div style="max-width:520px">' + subForm() + '<p class="ex" style="margin-top:14px">We use your address only for the Israel Insider digest.</p></div></section>'); },
    act: function (q) { return entryPage('act', q); },
    monitor: function (q) { return entryPage('monitor', q); },
    propose: function () { var tm = /type=(act|monitor)/.exec(location.hash); return Promise.resolve(proposeForm(tm ? tm[1] : 'act')); },
    about: function () { return Promise.resolve(staticPage('about')); },
    standards: function () { return Promise.resolve(staticPage('standards')); },
    terms: function () { return Promise.resolve(staticPage('terms')); },
    privacy: function () { return Promise.resolve(staticPage('privacy')); },
    contact: function () { return Promise.resolve(contactForm('General', 'Contact', 'Questions, sponsorship, press or a technical problem? Write to us here.')); },
    corrections: function () { return Promise.resolve(contactForm('Correction', 'Corrections', 'Tell us about an error in a listing, excerpt or Monitor entry. Include the page and what should change.')); },
    'opt-out': function () { return Promise.resolve(contactForm('Opt out', 'Opt out', 'Creators can ask to edit or remove a listing at any time. Tell us which voice or feed and we will act promptly.')); },
    cat: function () { return catPage(CURARG); },
    tag: function () { return tagPage(CURARG); },
    topics: function () { return topicsPage(); },
    nowlej: function () { return Promise.resolve('<section class="sec" style="padding-top:26px">' + sech('', 'Israel NOWlej', 'News, views, media, the NOWlej glossary and sources') + '<p class="ex" style="max-width:62ch">Israel Insider is the opinion cousin of Israel NOWlej. For news, reference and sources, use the main sections of Israel NOWlej.</p><div class="nl">' + NL.map(function (x) { return '<a href="https://israelnowlej.com' + x[1] + '" target="_blank" rel="noopener"><b>' + x[0] + '</b><span class="ex">israelnowlej.com' + x[1] + '</span></a>'; }).join('') + '</div></section>'); },
    read: function (q) { var sc = secParam(q); return Promise.all([items('format=read&limit=60' + q), voiceStrip('read', sc)]).then(function (a) { var l = a[0]; return '<section class="sec read" style="padding-top:26px">' + sech('read', sc ? SL[sc] : 'Read', sc ? SDESC[sc] : 'Blogs, Substack, op-eds and editorials') + (l.length ? grid(l) : empty('Nothing here yet.')) + '</section>' + a[1]; }); },
    share: function (q) {
      return Promise.all([items('limit=60'), items('format=social&limit=12' + q)]).then(function (a) {
        var mix = a[0].filter(function (i) { return i.format !== 'social'; }).slice(0, 6), posts = a[1];
        return '<section class="sec social" style="padding-top:26px">' + sech('social', 'Share', 'Spread the word on every network') +
          '<div class="panel" style="margin-bottom:18px"><h3>share israel insider</h3><div class="pb"><p class="ex">Know someone who should hear these voices? Share the site.</p>' + shareRow(SITE, 'Israel Insider: Pro-Israel voices in one place', true) + '</div></div>' +
          (mix.length ? sech('', 'Share these now', 'Every item has its own share buttons') + grid(mix, 'g3') : '') +
          (posts.length ? sech('social', 'Voices on social', 'Short posts from voices') + grid(posts, 'g3') : '') + '</section>';
      });
    },
    listen: function (q) {
      return Promise.all([items('format=listen&limit=60' + q), voiceStrip('listen', secParam(q))]).then(function (a) {
        var l = a[0], VS = a[1];
        var rows = l.map(function (i) {
          var v = i.voice || {};
          return '<article class="ep listen"><div class="cvr">' + fi(v) + '</div><div class="tx"><span class="kick">' + esc(v.name) + '</span><h3>' + esc(i.title) + '</h3><p class="ex">' + esc(i.excerpt) + '</p><div class="meta"><span>' + ago(i.published_at) + '</span>' + (i.duration_seconds ? '<span>' + dur(i.duration_seconds) + '</span>' : '') + '<span>Audio</span></div><div class="acts"><button class="btn sm" type="button" style="background:var(--listen);color:#fff" data-play="' + esc(i.id) + '">Play</button><button class="btn line sm" type="button" data-queue="' + esc(i.id) + '">Add to queue</button><a class="btn line sm" href="#/voice/' + esc(v.slug) + '">Show page</a></div>' + shareRow(i.url, i.title) + '</div></article>';
        }).join('');
        return '<section class="sec listen" style="padding-top:26px">' + sech('listen', 'Listen', 'Audio-only podcasts. Press play and keep browsing, the player stays at the bottom.', ['/api/rss?format=listen', 'RSS']) + (l.length ? '<div class="grid g1" style="gap:14px 3px">' + rows + '</div>' : empty('Nothing here yet.')) + '</section>' + VS;
      });
    },
    watch: function (q) {
      return Promise.all([items('format=watch&limit=60' + q), voiceStrip('watch', secParam(q))]).then(function (a) {
        var l = a[0], VS = a[1], first = l[0];
        var theater = first ? '<div class="feat" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)"><article class="big watch"><div class="art theater" id="theater" data-vid="' + esc(first.embed_id) + '">' + thumb(first) + '<button class="pl" type="button" data-watch="' + esc(first.id) + '" aria-label="Play">' + PLAY + '</button></div><div class="bd"><span class="kick" style="color:var(--watch)">Now in theater view</span><h2 id="ttitle">' + esc(first.title) + '</h2><div class="meta" id="tmeta">' + byline(first) + '<span>' + ago(first.published_at) + '</span><a href="https://www.youtube.com/watch?v=' + esc(first.embed_id) + '" target="_blank" rel="noopener">Watch on YouTube</a></div></div></article><div class="list">' + l.slice(1, 4).map(function (i) { return '<div class="it" style="--c:var(--watch)"><span class="ty">' + ICON.watch + '</span><div><span class="kick">Up next</span><h4><a href="#" data-watch="' + esc(i.id) + '">' + esc(i.title) + '</a></h4><span class="meta">' + esc((i.voice || {}).name) + ' · ' + dur(i.duration_seconds) + '</span></div></div>'; }).join('') + '</div></div>' : '';
        return theater + '<section class="sec watch">' + sech('watch', 'Watch', 'Video podcasts, vlogs, talks and explainers') + (l.length ? grid(l, 'g3') : empty('Nothing here yet.')) + '</section>' + VS;
      });
    },
    voices: function () {
      var only = secParam(CURQ);
      return api('/api/voices').then(function (r) {
        var order = ['blog', 'substack', 'oped', 'editorial', 'podcast', 'vlog'], TY = { blog: 'read', substack: 'read', oped: 'read', editorial: 'read', podcast: 'listen', vlog: 'watch' };
        if (!r.voices.length) return '<section class="sec" style="padding-top:26px">' + sech('', 'Voices', 'Every listed writer, show and channel') + empty('No voices listed yet.') + '</section>';
        var jump = '<nav class="jump" aria-label="Directory sections"><a' + (only ? '' : ' class="on"') + ' href="#/voices">All</a>' + order.map(function (s) { var n = r.voices.filter(function (v) { return (v.sections || []).indexOf(s) > -1; }).length; return n ? '<a' + (only === s ? ' class="on"' : '') + ' href="#/voices?section=' + s + '">' + SL[s] + ' <i>' + n + '</i></a>' : ''; }).join('') + '</nav>';
        var blocks = order.filter(function (s) { return !only || only === s; }).map(function (s) {
          var l = r.voices.filter(function (v) { return (v.sections || []).indexOf(s) > -1; }).sort(function (x, y) { var dx = ((x.latest || [])[0] || {}).d || '', dy = ((y.latest || [])[0] || {}).d || ''; return dx === dy ? x.name.localeCompare(y.name) : (dx < dy ? 1 : -1); });
          return l.length ? '<section class="sec ' + TY[s] + '" id="dir-' + s + '">' + sech(TY[s], SL[s], SDESC[s] + ' (' + l.length + ')', ['#/' + TY[s] + '?section=' + s, 'Latest ' + SL[s].toLowerCase()]) + '<div class="grid g3 vdir">' + l.map(vcard).join('') + '</div></section>' : '';
        }).join('');
        return items('limit=100' + (only ? '&section=' + only : '')).then(function (its) {
          var lp = its.length ? '<section class="sec">' + sech('', 'Latest posts', 'Newest first, from every voice', ['#/read', 'All posts']) + '<ul class="lpl">' + its.slice(0, 25).map(function (i) {
            var x = i.voice || {};
            return '<li><a class="face" href="#/voice/' + esc(x.slug) + '" tabindex="-1" aria-hidden="true">' + fi(x) + '</a><div><a class="t" href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">' + esc(i.title) + '</a><span class="meta"><a href="#/voice/' + esc(x.slug) + '">' + esc(x.name) + '</a> &middot; ' + ago(i.published_at) + '</span></div></li>';
          }).join('') + '</ul></section>' : '';
          return '<section class="sec" style="padding-top:26px">' + sech('', 'Voices', 'Latest posts first, then every voice') + jump + '</section>' + lp + blocks;
        });
      });
    },
    voice: function (slug) {
      return api('/api/voice/' + encodeURIComponent(slug)).then(function (r) {
        remember(r.items);
        var v = r.voice, kinds = {};
        r.feeds.forEach(function (f) { kinds[f.format] = 1; });
        var links = r.feeds.map(function (f) { return '<div class="rw"><span class="dot" style="background:var(--' + f.format + ')"></span><a href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener">' + esc(f.kind) + '</a></div>'; }).join('');
        var tabs = '<nav class="tabs" style="margin-top:6px"><a class="plain on" data-f="all" href="#" style="background:var(--ink)">All</a>' + ['read', 'listen', 'watch', 'social'].filter(function (t) { return kinds[t]; }).map(function (t) { return '<a class="' + t + '" data-f="' + t + '" href="#">' + TYPES[t] + '</a>'; }).join('') + '</nav>';
        var feed = r.items.length ? grid(r.items, 'g2') : empty('No items yet.');
        return '<div class="prof"><span class="big">' + fi(v) + '</span><div class="tx"><h1>' + esc(v.name) + '</h1><p class="ex">' + esc(v.short_bio) + '</p><div class="meta">' + (v.topics || []).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div></div>' + (v.website ? '<a class="btn line" href="' + esc(safeUrl(v.website)) + '" target="_blank" rel="noopener">Visit site</a>' : '') + '</div>' + tabs + '<div id="vfeed" style="margin-top:18px">' + feed + '</div><div class="grid g2" style="margin-top:22px"><div class="panel"><h3>follow and subscribe</h3><div class="pb">' + (links || '<p class="ex">No feeds listed.</p>') + '</div></div><div class="panel"><h3>about this listing</h3><div class="pb"><p class="ex">Items link to the creator\'s own pages. Only headlines and short excerpts are shown here.</p></div></div></div>';
      });
    },
    submit: function () {
      var cats = (TAXIDX.raw && TAXIDX.raw.cats && TAXIDX.raw.cats.length) ? TAXIDX.raw.cats.map(function (c) { return [c.slug, c.name]; }) : DEFCATS;
      var opt = function (v, t) { return '<option value="' + v + '">' + t + '</option>'; };
      return Promise.resolve('<div style="max-width:880px;margin:0 auto"><section class="sec" style="--c:var(--ink);padding-top:26px">' + sech('', 'Submit Content', 'An editor reviews everything before it appears') + '<p class="ex" style="font-size:17px;margin-bottom:18px">Israel Insider lists voices that support Israel. Every item links to the creator\'s own site, channel or feed. Send us a feed, a channel or a single piece, and tick the box if you want to be listed as a voice.</p><div id="subok"></div>' +
        '<form class="frm" id="subf" novalidate>' +
        '<div class="fld"><label for="kd">What are you submitting?</label><select id="kd" name="kind" required>' + opt('', 'Choose one') + opt('blog', 'A blog') + opt('substack', 'A Substack or newsletter') + opt('oped', 'Op-eds or a column') + opt('editorial', 'An outlet, editorial page or institution') + opt('podcast', 'A podcast') + opt('vlog', 'A vlog or video channel') + opt('item', 'A single article, episode or video') + opt('act', 'An event, petition or donation page (goes to Act)') + opt('monitor', 'A fact-check, correction or tracker (goes to Monitor)') + '</select></div>' +
        '<div id="kdnote" class="ex" hidden></div>' +
        '<div id="mainf">' +
        '<div class="fld"><label for="lk">Link to the feed, channel or piece</label><input id="lk" name="link" type="url" placeholder="https://" required><small>An RSS or podcast feed, a Substack or YouTube address, or the page itself.</small></div>' +
        '<div class="fld"><label for="ti">Name of the voice, show, channel or piece</label><input id="ti" name="title" required></div>' +
        '<div class="fld"><label for="ct">Main category</label><select id="ct" name="category">' + opt('', 'Not sure') + cats.map(function (c) { return opt(esc(c[0]), esc(c[1])); }).join('') + '</select></div>' +
        '<div class="fld"><label for="nm">Your name</label><input id="nm" name="name" required></div>' +
        '<div class="fld"><label for="em">Your email</label><input id="em" name="email" type="email" required><small>Used only to reach you about this submission.</small></div>' +
        '<div class="fld"><label for="rl">You are</label><select id="rl" name="relation">' + opt('creator', 'The creator, or I speak for them') + opt('reader', 'A reader suggesting it') + '</select></div>' +
        '<label class="chk" for="av"><input id="av" name="apply_voice" type="checkbox">Apply to be listed as a voice. All posts from this feed then appear on Israel Insider with a link back to the source.</label>' +
        '<div id="vfields" hidden>' +
        '<div class="fld"><label for="wb">Website</label><input id="wb" name="website" type="url" placeholder="https://"></div>' +
        '<div class="fld"><label for="xh">Social accounts</label><input id="xh" name="social" placeholder="X, Bluesky, Threads handles"></div>' +
        '<div class="fld"><label for="bio">Short bio, two lines</label><textarea id="bio" name="bio" maxlength="500"></textarea></div>' +
        '<label class="chk" for="c2"><input id="c2" name="consent_excerpt" type="checkbox">Israel Insider may show my headlines, short excerpts and thumbnails with links to my own pages.</label>' +
        '<label class="chk" for="c3"><input id="c3" name="consent_full_text" type="checkbox">Optional: I give permission to show full text of my posts on Israel Insider.</label></div>' +
        '<input name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
        '<div><button class="btn" type="submit">Send for review</button></div></div></form></section></div>');
    },
    submitChannel: function () { return routes.submit(); }
  };
  function vcard(v) {
    return '<a class="vcard vmin" href="#/voice/' + esc(v.slug) + '"><span class="big">' + fi(v) + '</span><span class="vn">' + esc(v.name) + '</span></a>';
  }
  function secParam(q) { var m = /[?&]section=([a-z]+)/.exec(q || ''); return m ? m[1] : ''; }
  // a strip of voices that belong to a tab, shown on the tab page
  function voiceStrip(type, sec) {
    return api('/api/voices').then(function (r) {
      var keep = sec ? [sec] : SECT[type], list = r.voices.filter(function (v) { return (v.sections || []).some(function (s) { return keep.indexOf(s) > -1; }); });
      if (!list.length) return '';
      return '<section class="sec vstrip ' + type + '">' + sech(type, sec ? SL[sec] + ' voices' : 'Voices', sec ? SDESC[sec] : 'Writers, shows and channels in this tab', ['#/voices?section=' + keep[0], 'Directory']) + '<div class="vrow">' + list.slice(0, 12).map(function (v) { return '<a class="vchip" href="#/voice/' + esc(v.slug) + '"><span class="big">' + fi(v) + '</span><span>' + esc(v.name) + '</span></a>'; }).join('') + '</div></section>';
    }).catch(function () { return ''; });
  }
  function voiceTile(v) {
    return '<a class="vo" href="#/voice/' + esc(v.slug) + '"><span class="big">' + fi(v) + '</span><span class="nm">' + esc(v.name) + '</span></a>';
  }

  // ---- router
  var token = 0;
  var td = document.getElementById('today'); if (td) td.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var TOPICS = ['security', 'politics', 'diplomacy', 'culture', 'history', 'faith', 'campus'];
  var NL = [['News', '/'], ['Views', '/views/'], ['Media', '/media/'], ['NOWlej', '/glossary/'], ['Sources', '/sources/']];
  var SUBCOL = { act: 'var(--act)', monitor: 'var(--monitor)', share: 'var(--social)', read: 'var(--read)', listen: 'var(--listen)', watch: 'var(--watch)', social: 'var(--social)', voices: 'var(--voices)', nowlej: 'var(--bluedk)' };
  function siteExtras() {
    return '<button class="sh ig" type="button" data-copy="' + SITE + '" data-hint="Instagram" aria-label="Share on Instagram"><b>' + ico('instagram') + '</b>Instagram</button><button class="sh tt" type="button" data-copy="' + SITE + '" data-hint="TikTok" aria-label="Share on TikTok"><b>' + ico('tiktok') + '</b>TikTok</button>';
  }
  function openSitePop(btn) {
    var pop = document.getElementById('sitepop');
    if (!pop.hidden) { closeSitePop(); return; }
    var u = encodeURIComponent(SITE), t = encodeURIComponent('Israel Insider: Pro-Israel voices in one place via Israel Insider'), by = {};
    NET.forEach(function (n) { by[n[0]] = '<a class="sh ' + n[0] + '" href="' + esc(n[3](u, t)) + '" target="_blank" rel="noopener" aria-label="Share on ' + n[1] + '"><b>' + ico(n[0]) + '</b>' + n[1] + '</a>'; });
    var ig = siteExtras().split('</button>');
    var order = [by.whatsapp, by.x, ig[0] + '</button>', ig[1] + '</button>', by.facebook, by.telegram, by.threads, by.bluesky, by.linkedin, by.reddit, by.email, '<button class="sh copy" type="button" data-copy="' + SITE + '"><b>' + ico('link') + '</b>Copy link</button>'];
    if (navigator.share) order.push('<button class="sh nat" type="button" data-native="' + SITE + '" data-title="Israel Insider"><b>' + ico('more') + '</b>More</button>');
    var row = '<div class="share big">' + order.join('') + '</div>';
    pop.innerHTML = '<b class="pt">Share Israel Insider</b>' + row + '<p class="ph" id="sitepopmsg" role="status">Instagram and TikTok have no web share link. Tap one to copy the link, then paste it into a post, story or video.</p>';
    pop.style.left = Math.max(0, Math.min(btn.offsetLeft, pop.parentNode.clientWidth - 420)) + 'px';
    pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
  }
  function closeSitePop() { var pop = document.getElementById('sitepop'), b = document.getElementById('sharesite'); if (pop) pop.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  function renderSub(name, topic, sec) {
    LASTSUB = [name, topic, sec];
    var n = name === 'voice' ? 'voices' : name, L;
    if (n === 'nowlej') L = NL.map(function (x) { return '<a href="https://israelnowlej.com' + x[1] + '" target="_blank" rel="noopener">' + x[0] + '</a>'; });
    else if (n === 'voices' || n === 'submit') L = [['#/voices', 'All voices', n === 'voices' && !sec]].concat(['blog', 'substack', 'oped', 'editorial', 'podcast', 'vlog'].map(function (s) { return ['#/voices?section=' + s, SL[s], n === 'voices' && sec === s]; })).concat([ ['#/submit', 'Submit Content', n === 'submit'], ['/api/rss', 'RSS']]).map(function (x) { return '<a' + (x[2] ? ' class="on"' : '') + ' href="' + x[0] + '">' + x[1] + '</a>'; });
    else if (n === 'act' || n === 'monitor') { var ks = n === 'act' ? ACTK : MONK; L = [['', 'All ' + n]].concat(ks.map(function (k) { return [k, KPLURAL[k]]; })).map(function (x) { return '<a' + (x[0] === topic ? ' class="on"' : '') + ' href="#/' + n + (x[0] ? '?kind=' + x[0] : '') + '">' + x[1] + '</a>'; }); L.push('<a href="#/propose?type=' + n + '">Submit an item</a>'); }
    else if (n === 'propose') L = [['#/act', 'Act'], ['#/monitor', 'Monitor']].map(function (x) { return '<a href="' + x[0] + '">' + x[1] + '</a>'; });
    else if (n === 'share') L = [['#/share', 'Share the site', 1], ['/api/rss', 'RSS']].map(function (x) { return '<a' + (x[2] ? ' class="on"' : '') + ' href="' + x[0] + '">' + x[1] + '</a>'; });
    else if (SECT[n]) { L = [['', 'All ' + n]].concat(SECT[n].map(function (s) { return [s, SL[s]]; })).map(function (x) { return '<a' + (x[0] === (sec || '') ? ' class="on"' : '') + ' href="#/' + n + (x[0] ? '?section=' + x[0] : '') + '">' + x[1] + '</a>'; }); L.push('<a href="#/voices?section=' + SECT[n][0] + '">Voices</a>'); }
    else if (TYPES[n]) { var cl = (TAXIDX.raw && TAXIDX.raw.cats.length) ? TAXIDX.raw.cats.map(function (c) { return [c.slug, c.name.split(' & ')[0]]; }) : DEFCATS; L = [['', 'All ' + n]].concat(cl).map(function (x) { return '<a' + (x[0] === topic ? ' class="on"' : '') + ' href="#/' + n + (x[0] ? '?cat=' + x[0] : '') + '">' + x[1] + '</a>'; }); }
    else L = [['#/', 'Latest', 1], ['#/voices', 'All voices'], ['#/submit', 'Submit Content'], ['/api/rss', 'RSS']].map(function (x) { return '<a' + (x[2] ? ' class="on"' : '') + ' href="' + x[0] + '">' + x[1] + '</a>'; });
    L.push('<button class="sharesite" id="sharesite" type="button" aria-expanded="false" aria-controls="sitepop">Share Site</button>');
    var el = document.getElementById('sublinks'); el.innerHTML = L.join('');
    el.parentNode.style.setProperty('--sc', SUBCOL[n] || 'var(--blue)');
  }
  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?')[0].split('/');
    var name = parts[0] || 'home', arg = parts[1] ? decodeURIComponent(parts[1]) : '';
    var qm = /[?&]q=([^&]*)/.exec(h), tm = /[?&]topic=([^&]*)/.exec(h), km = /[?&]kind=([^&]*)/.exec(h), cm = /[?&]cat=([^&]*)/.exec(h), sm = /[?&]section=([a-z]+)/.exec(h), q = (qm ? '&q=' + qm[1] : '') + (tm ? '&topic=' + tm[1] : '') + (km ? '&kind=' + km[1] : '') + (cm ? '&cat=' + cm[1] : '') + (sm ? '&section=' + sm[1] : '');
    CURARG = arg; CURQ = q;
    if (name === 'social') name = 'share';
    if (!routes[name]) name = 'home';
    document.body.setAttribute('data-route', name);
    document.querySelectorAll('#tabs a').forEach(function (a) { if (a.dataset.r === (name === 'voice' ? 'voices' : name)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderSub(name, km ? decodeURIComponent(km[1]) : (cm ? decodeURIComponent(cm[1]) : (tm ? decodeURIComponent(tm[1]) : '')), sm ? sm[1] : '');
    var t = ++token;
    view.innerHTML = '<div class="empty" style="margin-top:26px">Loading</div>';
    taxData().then(function () { return Promise.all([routes[name](name === 'voice' ? arg : q), sideCol()]); }).then(function (r) {
      if (t !== token) return;
      var html = r[0];
      view.innerHTML = r[1] ? '<div class="cols"><div class="main">' + html + '</div>' + r[1] + '</div>' : html; window.scrollTo(0, 0); document.title = (name === 'home' ? '' : name.charAt(0).toUpperCase() + name.slice(1) + ' · ') + 'Israel Insider';
      if (name === 'submit') wireSubmit();
      if (name === 'voice') wireVoice();
    }).catch(function () { if (t === token) view.innerHTML = '<div class="err" style="margin-top:26px">Could not load this page. Try again in a moment.</div>'; });
  }
  window.addEventListener('hashchange', function () { closeSitePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSitePop(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('submit', function (e) { var f = e.target.closest('.sf'); if (!f) return; e.preventDefault(); var v = f.querySelector('input').value.trim(); location.hash = v ? '#/read?q=' + encodeURIComponent(v) : '#/'; });

  function wireVoice() {
    var tabs = document.querySelectorAll('.tabs a[data-f]');
    tabs.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); tabs.forEach(function (b) { b.classList.remove('on'); }); a.classList.add('on'); var f = a.dataset.f; var list = Object.keys(ITEMS).map(function (k) { return ITEMS[k]; }).filter(function (i) { return (i.voice || {}).slug === location.hash.split('/')[2] && (f === 'all' || i.format === f); }); list.sort(function (x, y) { return y.published_at.localeCompare(x.published_at); }); $('#vfeed').innerHTML = list.length ? grid(list, 'g2') : empty('No items yet.'); }); });
  }
  function wireSubmit() {
    var f = $('#subf'); if (!f) return;
    var FEEDY = { blog: 1, substack: 1, oped: 1, editorial: 1, podcast: 1, vlog: 1 };
    function sync() {
      var k = f.kind.value, redirect = k === 'act' || k === 'monitor', n = $('#kdnote');
      n.hidden = !redirect; $('#mainf').hidden = redirect || !k;
      if (redirect) n.innerHTML = 'Events, petitions, donation pages, fact-checks and trackers have their own short form. <a href="#/propose?type=' + k + '">Open the ' + (k === 'act' ? 'Act' : 'Monitor') + ' form</a>.';
      if (k && !redirect) f.apply_voice.checked = !!FEEDY[k] && f.relation.value === 'creator';
      $('#vfields').hidden = redirect || !f.apply_voice.checked;
    }
    $('#mainf').hidden = true;
    f.kind.addEventListener('change', sync); f.relation.addEventListener('change', sync); f.apply_voice.addEventListener('change', sync);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      d.apply_voice = f.apply_voice.checked; d.consent_excerpt = f.consent_excerpt.checked; d.consent_full_text = f.consent_full_text.checked;
      var box = $('#subok'); box.innerHTML = '';
      if (!d.kind || d.kind === 'act' || d.kind === 'monitor') { box.innerHTML = '<div class="err">Choose what you are submitting.</div>'; return; }
      fetch('/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then(function (r) {
        if (r.ok) { f.hidden = true; box.innerHTML = '<div class="ok">Thank you' + (d.name ? ', ' + esc(d.name.split(' ')[0]) : '') + '. Your submission is in the review queue. An editor will write to the email you gave.</div>'; window.scrollTo(0, 0); }
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
    var cf = e.target.closest('#cf');
    if (cf) { e.preventDefault(); var cd = {}; new FormData(cf).forEach(function (v, k) { cd[k] = v; }); var cm = document.getElementById('cmsg'); fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cd) }).then(function (r) { if (r.ok) { cf.hidden = true; cm.innerHTML = '<div class="ok">Thank you. We will reply by email.</div>'; } else r.json().then(function (x) { cm.innerHTML = '<div class="err">' + esc(x.error || 'Could not send.') + '</div>'; }); }).catch(function () { cm.innerHTML = '<div class="err">Could not send. Check your connection.</div>'; }); return; }
    var pf = e.target.closest('#pf');
    if (pf) { e.preventDefault(); var d = {}; new FormData(pf).forEach(function (v, k) { d[k] = v; }); var m = document.getElementById('pmsg'); fetch('/api/propose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) }).then(function (r) { if (r.ok) { pf.hidden = true; m.innerHTML = '<div class="ok">Thank you. Your item is in the review queue.</div>'; } else r.json().then(function (x) { m.innerHTML = '<div class="err">' + esc(x.error || 'Could not send.') + '</div>'; }); }).catch(function () { m.innerHTML = '<div class="err">Could not send. Check your connection.</div>'; }); return; }
    var f = e.target.closest('.subf'); if (!f) return; e.preventDefault();
    var box = f.querySelector('.submsg'), em = f.elements.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { box.textContent = 'Enter a valid email address.'; return; }
    if (!f.elements.consent.checked) { box.textContent = 'Please tick the box to subscribe.'; return; }
    fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: em, name: f.elements.name ? f.elements.name.value.trim() : '', consent: true }) }).then(function (r) { if (!r.ok) { box.textContent = 'Could not subscribe. Try again later.'; return; } return r.json().then(function (x) { var nm = x.name || ''; subSave({ name: nm }); topGreet(); document.querySelectorAll('.subf').forEach(function (ff) { var w = document.createElement('div'); w.innerHTML = welcomeHtml(nm, !x.returning); ff.parentNode.replaceChild(w.firstChild, ff); }); }); }).catch(function () { box.textContent = 'Could not subscribe. Check your connection.'; });
  });
  document.addEventListener('click', function (e) {
    var ss = e.target.closest('#sharesite'); if (ss) { e.preventDefault(); openSitePop(ss); return; }
    if (!e.target.closest('#sitepop')) closeSitePop();
    var sc = e.target.closest('[data-copy],[data-native]');
    if (sc) { e.preventDefault(); if (sc.dataset.native) { navigator.share({ title: sc.dataset.title, url: sc.dataset.native }).catch(function () {}); } else { var done = function () { if (sc.dataset.hint) { var m = document.getElementById('sitepopmsg'); if (m) m.textContent = 'Link copied. Open ' + sc.dataset.hint + ' and paste it into a post, story or message.'; return; } var o = sc.innerHTML; sc.textContent = 'Copied'; setTimeout(function () { sc.innerHTML = o; }, 1500); };
      if (sc.dataset.hint && navigator.share) { navigator.share({ title: 'Israel Insider', url: sc.dataset.copy }).catch(function () {}); return; } if (navigator.clipboard) navigator.clipboard.writeText(sc.dataset.copy).then(done, function () {}); } return; }
    var el = e.target.closest('[data-play],[data-queue],[data-watch]'); if (!el) return;
    e.preventDefault();
    if (el.dataset.play) playItem(el.dataset.play);
    else if (el.dataset.queue) { var it = ITEMS[el.dataset.queue]; if (it && !queue.some(function (x) { return x.id === it.id; })) { queue.push(it); el.textContent = 'Queued'; if (cur < 0) load(0); } }
    else if (el.dataset.watch) {
      if ($('#theater')) watch(el.dataset.watch);
      else { var it2 = ITEMS[el.dataset.watch]; if (it2) { var a = el.closest('.art'); if (a) { a.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(it2.embed_id) + '?autoplay=1&rel=0" title="' + esc(it2.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>'; } } }
    }
  });

  topGreet();
  route();
})();
