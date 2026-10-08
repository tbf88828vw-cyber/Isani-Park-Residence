/* Isani Park Residence — progressive enhancement. No dependencies.
   Nothing here reloads the page or re-renders the whole document; layout is pure CSS. */
(function () {
  'use strict';
  var root = document.documentElement;
  var dataEl = document.getElementById('ipr-data');
  var D = dataEl ? JSON.parse(dataEl.textContent) : null;
  var T = D ? D.t : {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- small utils ----------
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function fmt(s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return k in v ? v[k] : '{' + k + '}'; }); }
  function store(kind) {
    var s = null; try { s = window[kind]; var k = '__t'; s.setItem(k, k); s.removeItem(k); } catch (e) { s = null; }
    return {
      get: function (k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } },
      set: function (k, v) { try { if (s) s.setItem(k, v); } catch (e) {} },
      del: function (k) { try { if (s) s.removeItem(k); } catch (e) {} }
    };
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  var nf = D ? new Intl.NumberFormat(D.numLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  function area(v) { return nf.format(v) + '\u00a0' + D.m2; }

  // ---------- analytics (no personal data ever) ----------
  window.dataLayer = window.dataLayer || [];
  function track(event, params) {
    var p = params || {};
    p.event = event; p.site_language = D ? D.lang : root.lang;
    window.dataLayer.push(p);
    if (typeof window.gtag === 'function') {
      var gp = {}; for (var k in p) if (k !== 'event') gp[k] = p[k];
      window.gtag('event', event, gp);
    }
  }

  // ---------- header: fall back to the menu button when the nav doesn't fit ----------
  (function () {
    var hd = $('.site-header'), inner = hd && $('.site-header__inner', hd);
    if (!inner) return;
    var fit = function () {
      hd.classList.remove('is-compact');
      if (inner.scrollWidth > inner.clientWidth + 1) hd.classList.add('is-compact');
    };
    fit();
    window.addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(fit);
      $$('.site-nav, .site-header__tools', inner).forEach(function (el) { ro.observe(el); });
    }
  })();

  // ---------- theme ----------
  function syncThemeLabels() {
    var light = root.getAttribute('data-theme') === 'light';
    $$('[data-theme-toggle]').forEach(function (b) {
      var label = light ? b.getAttribute('data-label-dark') : b.getAttribute('data-label-light');
      b.setAttribute('aria-label', label);
      var txt = $('[data-theme-text]', b); if (txt) txt.textContent = label;
    });
    var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', light ? '#faf8f4' : '#0c0b09');
  }
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      local.set('ipr-theme', next);
      syncThemeLabels();
    });
  });
  syncThemeLabels();

  if (!D) return; // privacy / 404 pages stop here

  // ---------- attribution (UTM + click ids, first touch of the session) ----------
  (function () {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid'];
    var q = new URLSearchParams(location.search), found = {}, any = false;
    keys.forEach(function (k) { var v = q.get(k); if (v) { found[k] = v.slice(0, 200); any = true; } });
    if (any || !session.get('ipr-attr')) {
      found.landing_page = location.pathname;
      found.referrer = document.referrer ? document.referrer.split('?')[0].slice(0, 200) : '';
      if (any || !session.get('ipr-attr')) session.set('ipr-attr', JSON.stringify(found));
    }
  })();

  // ---------- header state, current section ----------
  var header = $('[data-header]');
  var hero = $('.hero');
  var currentSection = '';
  if (header && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { header.classList.toggle('is-solid', !e[0].isIntersecting); }, { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
  } else if (header) header.classList.add('is-solid');

  var sections = $$('main > section[id]');
  var navLinks = $$('.site-nav a[data-nav]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          currentSection = en.target.id === 'top' ? '' : en.target.id;
          navLinks.forEach(function (a) { a.toggleAttribute('aria-current', a.getAttribute('data-nav') === currentSection); if (a.getAttribute('data-nav') === currentSection) a.setAttribute('aria-current', 'true'); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }

  // ---------- mobile nav sheet: short slide-in/out, page scroll locked behind it ----------
  var sheet = $('#nav-sheet');
  function lockScroll(on) { document.documentElement.classList.toggle('is-locked', on); }
  function closeSheet(instant) {
    if (!sheet || !sheet.open || sheet.classList.contains('is-closing')) return;
    lockScroll(false);
    if (instant || reduceMotion.matches) { sheet.close(); return; }
    sheet.classList.add('is-closing');
    setTimeout(function () { sheet.classList.remove('is-closing'); sheet.close(); }, 160);
  }
  $$('[data-menu-open]').forEach(function (b) { b.addEventListener('click', function () { if (sheet && sheet.showModal) { sheet.showModal(); lockScroll(true); setMobileBar(); } }); });
  $$('[data-menu-close]').forEach(function (b) { b.addEventListener('click', function () { closeSheet(); }); });
  if (sheet) {
    $$('a[href^="#"]', sheet).forEach(function (a) { a.addEventListener('click', function () { closeSheet(true); }); });
    sheet.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(); });   // Esc / Android back gesture
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    sheet.addEventListener('close', function () { lockScroll(false); });
  }

  // ---------- language switch keeps section, open apartment and form draft ----------
  $$('[data-lang-link]').forEach(function (a) {
    a.addEventListener('click', function () {
      local.set('ipr-lang', a.getAttribute('data-lang-link'));
      var hash = openApt ? 'apt-' + openApt : (currentSection || '');
      var base = D.paths[a.getAttribute('data-lang-link')];
      if (base) a.setAttribute('href', base + (hash ? '#' + hash : ''));
      saveDraft();
    });
  });

  // ---------- hero video ----------
  (function () {
    var v = $('[data-hero-video]'), btn = $('[data-video-toggle]');
    if (!v) return;
    var conn = navigator.connection || {};
    var lowData = conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
    var userPaused = local.get('ipr-video') === 'paused';
    function setBtn(paused) {
      btn.hidden = false;
      btn.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-label', paused ? T.hero.play : T.hero.pause);
    }
    function load() {
      if (v.src) return;
      var tall = window.matchMedia('(max-aspect-ratio: 4/5)').matches;
      var big = window.innerWidth * (window.devicePixelRatio || 1) > 1700;
      var src = tall ? v.getAttribute('data-src-tall') : v.getAttribute(big ? 'data-src-xl' : 'data-src-wide');
      // H.264 for Safari/Chrome/Edge; VP9 WebM where H.264 is unavailable (e.g. some Chromium builds, Firefox on Linux)
      if (!v.canPlayType('video/mp4; codecs="avc1.640028"') && v.canPlayType('video/webm; codecs="vp9"')) src = src.replace(/\.mp4(\?|$)/, '.webm$1');
      v.src = src;
      v.addEventListener('playing', function () { v.classList.add('is-playing'); }, { once: true });
    }
    function play() { load(); var p = v.play(); if (p && p.catch) p.catch(function () { setBtn(true); }); setBtn(false); }
    function pause() { v.pause(); setBtn(true); }
    btn.addEventListener('click', function () {
      if (v.paused || !v.src) { local.del('ipr-video'); play(); } else { local.set('ipr-video', 'paused'); pause(); }
    });
    if (lowData) return; // poster only; no toggle offered to save data
    if (reduceMotion.matches || userPaused) { setBtn(true); return; }
    var start = function () { play(); };
    if (document.readyState === 'complete') setTimeout(start, 200); else window.addEventListener('load', function () { setTimeout(start, 200); }, { once: true });
    // pause when off-screen to save battery
    var inView = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) {
      inView = e[0].isIntersecting;
      if (!v.src || btn.classList.contains('is-paused')) return;
      if (inView) v.play().catch(function () {}); else v.pause();
    }).observe(v);
    // mobile browsers pause muted video when the user switches apps; resume on return
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && v.src && inView && !btn.classList.contains('is-paused')) v.play().catch(function () {});
    });
  })();

  // ---------- catalog ----------
  var APTS = D.apartments.map(function (a) { return { id: a[0], floor: a[1], rooms: a[2], area: a[3], inner: a[4], summer: a[5], plan: !!a[6], ratio: a[7], pos: a[8], t3d: a[9] || null }; });
  var byId = {}; APTS.forEach(function (a) { byId[a.id] = a; });
  var list = $('[data-apt-list]');
  var cards = {}; $$('[data-apt]', list).forEach(function (li) { cards[li.getAttribute('data-apt')] = li; });
  var form = $('[data-filters]');
  var countEl = $('[data-count]'), emptyEl = $('[data-empty]'), moreBtn = $('[data-more]');
  var PAGE = 12, limit = PAGE, filtered = APTS.slice();
  var bands = {}; T.catalog.areaBands.forEach(function (b) { bands[b.id] = b; });

  function readFilters() {
    var fd = new FormData(form);
    return { rooms: fd.get('rooms') || 'all', area: fd.get('area') || 'all', floor: fd.get('floor') || 'all', sort: fd.get('sort') || 'floor' };
  }
  function writeFilters(f) {
    $$('input[name="rooms"]', form).forEach(function (i) { i.checked = i.value === String(f.rooms); });
    $$('input[name="area"]', form).forEach(function (i) { i.checked = i.value === String(f.area); });
    form.elements.floor.value = f.floor || 'all';
    form.elements.sort.value = f.sort || 'floor';
  }
  function applyFilters(opts) {
    var f = readFilters();
    session.set('ipr-filters', JSON.stringify(f));
    filtered = APTS.filter(function (a) {
      if (f.rooms !== 'all' && String(a.rooms) !== f.rooms) return false;
      if (f.floor !== 'all' && String(a.floor) !== f.floor) return false;
      if (f.area !== 'all') { var b = bands[f.area]; if (!(a.area >= b.min && a.area < b.max)) return false; }
      return true;
    });
    if (f.sort === 'areaAsc') filtered.sort(function (a, b) { return a.area - b.area || a.id - b.id; });
    else if (f.sort === 'areaDesc') filtered.sort(function (a, b) { return b.area - a.area || a.id - b.id; });
    else filtered.sort(function (a, b) { return a.floor - b.floor || a.id - b.id; });
    if (!opts || !opts.keepLimit) limit = PAGE;
    render();
  }
  function render() {
    var frag = document.createDocumentFragment();
    var visible = {};
    filtered.forEach(function (a, i) { var li = cards[a.id]; li.hidden = i >= limit; frag.appendChild(li); visible[a.id] = true; });
    APTS.forEach(function (a) { if (!visible[a.id]) { cards[a.id].hidden = true; frag.appendChild(cards[a.id]); } });
    list.appendChild(frag);
    var shown = Math.min(limit, filtered.length);
    countEl.textContent = filtered.length && shown < filtered.length ? fmt(T.catalog.shown, { shown: shown, total: filtered.length }) : fmt(T.catalog.found, { n: filtered.length });
    emptyEl.hidden = filtered.length > 0;
    moreBtn.hidden = shown >= filtered.length;
    session.set('ipr-limit', String(limit));
    renderActive();
  }
  // phones: collapsible filter panel, sticky bar with count, removable chips for active filters
  var fBar = $('[data-filters-bar]'), fToggle = $('[data-filters-toggle]'), fN = $('[data-filters-n]'), fCount = $('[data-count-bar]');
  var fActive = $('[data-filters-active]'), fApply = $('[data-filters-apply]');
  var mqPhone = window.matchMedia('(max-width: 700px)');
  function setPanel(open) {
    form.classList.toggle('is-open', open);
    fToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function renderActive() {
    if (!fBar) return;
    var f = readFilters(), items = [];
    if (f.rooms !== 'all') items.push(['rooms', T.catalog.roomsLabel[f.rooms]]);
    if (f.area !== 'all' && bands[f.area]) items.push(['area', bands[f.area].label]);
    if (f.floor !== 'all') items.push(['floor', fmt(T.catalog.floorShort, { n: f.floor })]);
    fActive.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'chip-x'; b.setAttribute('data-remove-filter', it[0]);
      b.setAttribute('aria-label', T.catalog.removeFilter + ': ' + it[1]);
      b.innerHTML = '<span></span><i aria-hidden="true">×</i>'; b.firstChild.textContent = it[1];
      li.appendChild(b); fActive.appendChild(li);
    });
    fActive.hidden = !items.length;
    fN.textContent = items.length; fN.hidden = !items.length;
    $$('[data-filters-clear]').forEach(function (b) { if (b.closest('[data-filters-bar]')) b.hidden = !items.length && f.sort === 'floor'; });
    fCount.textContent = fmt(T.catalog.countShort, { n: filtered.length });
    fApply.textContent = fmt(T.catalog.showN, { n: filtered.length });
  }
  if (fBar) {
    setPanel(!mqPhone.matches);
    if (mqPhone.addEventListener) mqPhone.addEventListener('change', function () { setPanel(!mqPhone.matches); });
    fToggle.addEventListener('click', function () { setPanel(!form.classList.contains('is-open')); });
    fActive.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove-filter]'); if (!b) return;
      var k = b.getAttribute('data-remove-filter'), f = readFilters(); f[k] = 'all'; writeFilters(f); applyFilters();
      var next = $('[data-remove-filter]', fActive); (next || fToggle).focus({ preventScroll: true });
    });
    fApply.addEventListener('click', function () {
      setPanel(false);
      var top = list.getBoundingClientRect().top + window.pageYOffset - fBar.offsetHeight - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 72) - 12;
      window.scrollTo({ top: top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      fToggle.focus({ preventScroll: true });
    });
  }
  $$('[data-filters-clear]').forEach(function (b) { b.addEventListener('click', function () { form.reset(); }); });
  form.addEventListener('change', function () { applyFilters(); });
  form.addEventListener('reset', function () { setTimeout(function () { applyFilters(); }, 0); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  moreBtn.addEventListener('click', function () {
    var firstNew = filtered[limit];
    limit += PAGE; render();
    if (firstNew) { var b = $('[data-open-apt]', cards[firstNew.id]); if (b) b.focus({ preventScroll: false }); }
  });
  try { var saved = JSON.parse(session.get('ipr-filters') || 'null'); if (saved) writeFilters(saved); } catch (e) {}
  // keep "show more" depth across reloads / Back so the browser can restore the scroll position
  var savedLimit = parseInt(session.get('ipr-limit') || '', 10);
  if (savedLimit > PAGE && savedLimit <= APTS.length) limit = savedLimit;
  applyFilters({ keepLimit: true });

  // typical layouts -> similar apartments
  $$('[data-similar-rooms]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = parseFloat(b.getAttribute('data-similar-area'));
      var band = T.catalog.areaBands.filter(function (x) { return a >= x.min && a < x.max; })[0];
      writeFilters({ rooms: b.getAttribute('data-similar-rooms'), area: band ? band.id : 'all', floor: 'all', sort: 'areaAsc' });
      applyFilters();
      document.getElementById('apartments').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      setTimeout(function () { countEl.setAttribute('tabindex', '-1'); countEl.focus({ preventScroll: true }); }, 400);
    });
  });

  // floor tabs
  (function () {
    var tabs = $$('.floors [role="tab"]');
    function select(t, focus) {
      tabs.forEach(function (x) {
        var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); }
      });
    });
  })();

  // ---------- apartment dialog ----------
  var dlg = $('#apt-dialog');
  var openApt = null, pushed = false, lastFocus = null, keepY = null;
  // the list position is ours to keep: history traversal (Back / closing via history) must not jump the page
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function restoreY() { if (keepY === null) return; var y = keepY; window.scrollTo(0, y); requestAnimationFrame(function () { window.scrollTo(0, y); }); }
  window.addEventListener('popstate', function () { if (!dlg.open) { restoreY(); setTimeout(function () { keepY = null; }, 100); } });
  // reload / coming back from another page: put the reader where they were (manual restoration is on)
  window.addEventListener('pagehide', function () { session.set('ipr-y:' + location.pathname, String(Math.round(window.pageYOffset))); });
  (function () {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var y = parseInt(session.get('ipr-y:' + location.pathname) || '', 10);
    if (nav && (nav.type === 'reload' || nav.type === 'back_forward') && y > 0 && !/^#(apt|floor)-/.test(location.hash)) {
      var go = function () { window.scrollTo(0, y); };
      if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
      requestAnimationFrame(go);
    }
  })();
  var planView = $('[data-plan-view]', dlg), planImg = $('[data-plan-img]', dlg), planNone = $('[data-plan-none]', dlg), planScroll = $('[data-plan-scroll]', dlg);
  var zoomIn = $('[data-zoom="in"]', dlg), zoomOut = $('[data-zoom="out"]', dlg);
  var planOrig = $('[data-plan-original]', dlg);
  var v3d = $('[data-v3d]', dlg), v3dImg = $('[data-v3d-img]', dlg), vTabs = $$('[data-view]', dlg), no3d = $('[data-no3d]', dlg);
  var planErr = $('[data-plan-error]', dlg), err3d = $('[data-err3d]', dlg), failed3d = {};
  // a render or plan that fails to load never shows as a broken image
  planImg.addEventListener('error', function () {
    if ((planImg.getAttribute('src') || '').indexOf('apt-' + openApt + '-') < 0) return;
    planImg.hidden = true; planErr.hidden = false; zoomIn.hidden = zoomOut.hidden = true;
  });
  v3dImg.addEventListener('error', function () {
    var a = byId[openApt]; if (!a || !a.t3d || (v3dImg.getAttribute('src') || '').indexOf('apt3d-' + a.t3d + '-') < 0) return;
    failed3d[a.t3d] = true; vTabs[0].disabled = true; err3d.hidden = false; setView('plan');
  });
  function setView(view, focus) {
    var a = byId[openApt];
    if (view === '3d' && a && (!a.t3d || failed3d[a.t3d])) view = 'plan';
    vTabs.forEach(function (b) {
      var on = b.getAttribute('data-view') === view;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    v3d.hidden = view !== '3d'; planView.hidden = view !== 'plan';
  }
  vTabs.forEach(function (b, i) {
    b.addEventListener('click', function () { if (!b.disabled) setView(b.getAttribute('data-view')); });
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); var o = vTabs[1 - i]; if (!o.disabled) setView(o.getAttribute('data-view'), true);
    });
  });
  $('[data-v3d-open]', dlg).addEventListener('click', function () { setView('plan'); vTabs[1].focus(); track('view_plan', { apartment_id: openApt, source: '3d' }); });

  function fillDialog(a) {
    var c = T.catalog;
    $('[data-apt-title]', dlg).textContent = fmt(T.modal.title, { n: a.id });
    $('[data-apt-sub]', dlg).textContent = fmt(T.modal.subtitle, { floor: a.floor, rooms: c.roomsLabel[a.rooms] });
    $('[data-apt-area]', dlg).textContent = area(a.area);
    var rows = [[c.apartment, c.no + ' ' + a.id], [c.floor, fmt(c.floorShort, { n: a.floor })], [c.rooms, c.roomsLabel[a.rooms]], [c.total, area(a.area)], [c.interior, area(a.inner)], [c.summer + ' (' + c.summerHint + ')', area(a.summer)]];
    var specs = $('[data-apt-specs]', dlg); specs.textContent = '';
    rows.forEach(function (r) { var d = document.createElement('div'); var dt = document.createElement('dt'); dt.textContent = r[0]; var dd = document.createElement('dd'); dd.textContent = r[1]; d.appendChild(dt); d.appendChild(dd); specs.appendChild(d); });
    pz.reset();
    planErr.hidden = true; err3d.hidden = true;
    if (a.plan) {
      planImg.hidden = false; planNone.hidden = true;
      planImg.removeAttribute('srcset');
      planImg.src = D.assets + 'plans/img/apt-' + a.id + '-1000.webp';
      if (D.pdf !== false) { planImg.srcset = D.assets + 'plans/img/apt-' + a.id + '-1000.webp 1000w, ' + D.assets + 'plans/img/apt-' + a.id + '-2000.webp 2000w'; planImg.sizes = '(min-width: 900px) 640px, 100vw'; }
      planOrig.href = D.assets + 'plans/pdf/isani-park-residence-E-apartment-' + a.id + '.pdf'; planOrig.hidden = D.pdf === false;
      planImg.height = Math.round(1000 * a.ratio);
      planImg.alt = fmt(c.planAlt, { n: a.id, floor: a.floor });
      $('[data-apt-pdf]', dlg).href = D.assets + 'plans/pdf/isani-park-residence-E-apartment-' + a.id + '.pdf';
      $('[data-apt-pdf]', dlg).hidden = D.pdf === false;
      zoomIn.hidden = zoomOut.hidden = false;
    } else {
      planImg.hidden = true; planNone.hidden = false; $('[data-apt-pdf]', dlg).hidden = true; zoomIn.hidden = zoomOut.hidden = planOrig.hidden = true;
    }
    var has3d = a.t3d && !failed3d[a.t3d];
    if (has3d) {
      var r = D.floormap.renders[a.t3d];
      v3dImg.src = D.assets + 'img/3d/apt3d-' + a.t3d + '-800.webp';
      v3dImg.srcset = D.assets + 'img/3d/apt3d-' + a.t3d + '-800.webp 800w, ' + D.assets + 'img/3d/apt3d-' + a.t3d + '-1600.webp 1600w';
      v3dImg.sizes = '(min-width: 900px) 60vw, 100vw';
      if (r) { v3dImg.width = 800; v3dImg.height = Math.round(800 * r.h / r.w); }
      v3dImg.alt = fmt(T.modal.alt3d, { n: a.id });
    }
    vTabs[0].disabled = !has3d; no3d.hidden = !!a.t3d; err3d.hidden = !(a.t3d && failed3d[a.t3d]);
    var idx = filtered.indexOf(a);
    $('[data-apt-prev]', dlg).disabled = idx <= 0;
    $('[data-apt-next]', dlg).disabled = idx < 0 || idx >= filtered.length - 1;
  }
  function openDialog(id, opts) {
    var a = byId[id]; if (!a) return;
    if (dlg.open && !reduceMotion.matches) { var bd = $('.apt-dialog__body', dlg); bd.classList.remove('is-swapping'); void bd.offsetWidth; bd.classList.add('is-swapping'); }
    if (!dlg.open) lastFocus = document.activeElement;
    openApt = a.id;
    fillDialog(a);
    setView(opts && opts.view ? opts.view : '3d');
    if (!dlg.open) { keepY = window.pageYOffset; dlg.showModal(); document.body.style.overflow = 'hidden'; }
    if (!opts || !opts.fromHistory) {
      var h = '#apt-' + a.id;
      if (pushed) history.replaceState({ apt: a.id }, '', h); else { history.pushState({ apt: a.id }, '', h); pushed = true; }
    }
    track('select_apartment', { apartment_id: a.id, apartment_rooms: a.rooms, apartment_area: a.area, apartment_floor: a.floor });
    setMobileBar();
  }
  function closeDialog(fromHistory) {
    if (!dlg.open) return;
    dlg.close();
  }
  dlg.addEventListener('close', function () {
    document.body.style.overflow = '';
    restoreY();
    openApt = null;
    if (pushed) { pushed = false; if (location.hash.indexOf('#apt-') === 0) history.back(); }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    setMobileBar();
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('[data-apt-close]', dlg).addEventListener('click', function () { dlg.close(); });
  $('[data-apt-prev]', dlg).addEventListener('click', function () { var i = filtered.indexOf(byId[openApt]); if (i > 0) openDialog(filtered[i - 1].id); });
  $('[data-apt-next]', dlg).addEventListener('click', function () { var i = filtered.indexOf(byId[openApt]); if (i >= 0 && i < filtered.length - 1) openDialog(filtered[i + 1].id); });
  // plan viewer: pinch (2 fingers), pan (1 finger when zoomed), double-tap, ctrl+wheel / trackpad pinch, +/- buttons.
  // At 1x a one-finger vertical drag scrolls the dialog, so the plan never traps the page.
  var pz = (function () {
    var lastType = 'mouse', box = planScroll, im = planImg, s = 1, tx = 0, ty = 0, MAX = 5, pts = {}, start = null, lastTap = 0, body = $('.apt-dialog__body', dlg), hint = $('[data-zoom-hint]', dlg);
    function base() { return { w: im.offsetWidth, h: im.offsetHeight, bw: box.clientWidth, bh: box.clientHeight, ox: im.offsetLeft, oy: im.offsetTop }; }
    function clamp() {
      var b = base(), w = b.w * s, h = b.h * s;
      // keep the plan covering the viewport when it is larger, centred when smaller
      var minX = Math.min(0, b.bw - w - b.ox) , maxX = Math.max(0, -b.ox);
      var minY = Math.min(0, b.bh - h - b.oy), maxY = Math.max(0, -b.oy);
      if (w <= b.bw) tx = (b.w - w) / 2; else tx = Math.min(maxX, Math.max(minX, tx));
      if (h <= b.bh) ty = (b.h - h) / 2; else ty = Math.min(maxY, Math.max(minY, ty));
    }
    function apply(anim) {
      clamp();
      im.style.transition = anim && !reduceMotion.matches ? 'transform 0.2s ease' : 'none';
      im.style.transform = s === 1 ? '' : 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      planView.classList.toggle('is-zoomed', s > 1.01);
      zoomIn.disabled = s >= MAX - 0.01; zoomOut.disabled = s <= 1.01;
      if (s > 1.3 && /-1000\.webp$/.test(im.currentSrc || im.src) && D.pdf !== false) { im.srcset = ''; im.src = im.src.replace(/-1000\.webp$/, '-2000.webp'); }
      if (s > 1.01 && hint) hint.hidden = true;
    }
    function zoomAt(ns, cx, cy, anim) {  // cx, cy: point in box coordinates that stays put
      ns = Math.min(MAX, Math.max(1, ns));
      var b = base(), px = cx - b.ox, py = cy - b.oy;
      tx = px - (px - tx) * ns / s; ty = py - (py - ty) * ns / s; s = ns;
      if (s === 1) { tx = 0; ty = 0; }
      apply(anim);
    }
    function local(e) { var r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    box.addEventListener('pointerdown', function (e) {
      lastType = e.pointerType || 'mouse';
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts[e.pointerId] = local(e); box.setPointerCapture && box.setPointerCapture(e.pointerId);
      var ids = Object.keys(pts);
      if (ids.length === 2) { var a = pts[ids[0]], c = pts[ids[1]]; start = { d: Math.hypot(a.x - c.x, a.y - c.y), s: s, mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2, tx: tx, ty: ty }; }
      else start = { x: pts[ids[0]].x, y: pts[ids[0]].y, tx: tx, ty: ty, st: body ? body.scrollTop : 0, moved: false };
    });
    box.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId] || !start) return;
      pts[e.pointerId] = local(e);
      var ids = Object.keys(pts);
      if (ids.length >= 2 && start.d) {
        var a = pts[ids[0]], c = pts[ids[1]], d = Math.hypot(a.x - c.x, a.y - c.y), mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
        s = start.s; tx = start.tx + (mx - start.mx); ty = start.ty + (my - start.my);
        zoomAt(start.s * d / start.d, mx, my, false);
      } else if (ids.length === 1 && start.x !== undefined) {
        var p = pts[ids[0]], dx = p.x - start.x, dy = p.y - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) start.moved = true;
        if (s > 1.01) { tx = start.tx + dx; ty = start.ty + dy; apply(false); }
        else if (body && e.pointerType !== 'mouse') body.scrollTop = start.st - dy;
      }
    });
    function end(e) {
      if (!pts[e.pointerId]) return;
      var wasTap = start && start.x !== undefined && !start.moved && Object.keys(pts).length === 1;
      delete pts[e.pointerId];
      var ids = Object.keys(pts);
      if (ids.length === 1) start = { x: pts[ids[0]].x, y: pts[ids[0]].y, tx: tx, ty: ty, st: body ? body.scrollTop : 0, moved: true };
      else start = null;
      if (wasTap && e.type === 'pointerup' && e.pointerType !== 'mouse') {
        var now = Date.now(), p = local(e);
        if (now - lastTap < 320) { zoomAt(s > 1.01 ? 1 : 2.5, p.x, p.y, true); lastTap = 0; } else lastTap = now;
      }
    }
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    box.addEventListener('dblclick', function (e) { if (lastType !== 'mouse') return; var p = local(e); zoomAt(s > 1.01 ? 1 : 2.5, p.x, p.y, true); });
    box.addEventListener('wheel', function (e) { if (!e.ctrlKey && s <= 1.01) return; e.preventDefault(); var p = local(e); if (e.ctrlKey) zoomAt(s * Math.exp(-e.deltaY / 200), p.x, p.y, false); else { tx -= e.deltaX; ty -= e.deltaY; apply(false); } }, { passive: false });
    zoomIn.addEventListener('click', function () { zoomAt(s * 1.6, box.clientWidth / 2, box.clientHeight / 2, true); });
    zoomOut.addEventListener('click', function () { zoomAt(s / 1.6, box.clientWidth / 2, box.clientHeight / 2, true); (zoomOut.disabled ? zoomIn : zoomOut).focus(); });
    box.addEventListener('keydown', function (e) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn.click(); }
      else if (e.key === '-') { e.preventDefault(); zoomOut.click(); }
      else if (s > 1.01 && /^Arrow/.test(e.key)) { e.preventDefault(); var k = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; tx += k[0]; ty += k[1]; apply(false); }
    });
    window.addEventListener('resize', function () { if (s > 1.01) apply(false); });
    return { reset: function () { s = 1; tx = ty = 0; pts = {}; start = null; im.style.transform = ''; planView.classList.remove('is-zoomed'); zoomIn.disabled = false; zoomOut.disabled = true; if (hint) hint.hidden = false; } };
  })();
  $('[data-apt-request]', dlg).addEventListener('click', function (e) {
    e.preventDefault();
    var id = openApt;
    pushed = false; // replace the #apt- entry instead of going back
    keepY = null;
    dlg.close();
    history.replaceState(null, '', '#contact');
    selectApartment(id);
    goToForm();
  });
  list.addEventListener('click', function (e) {
    if (e.target.closest('a, button')) return;
    var li = e.target.closest('[data-apt]'); if (li && !window.getSelection().toString()) openDialog(parseInt(li.getAttribute('data-apt'), 10));
  });
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open-apt]');
    if (o) { e.preventDefault(); openDialog(parseInt(o.getAttribute('data-open-apt'), 10)); return; }
    var r = e.target.closest('[data-request-apt]');
    if (r) { e.preventDefault(); selectApartment(parseInt(r.getAttribute('data-request-apt'), 10)); goToForm(); track('select_apartment', { apartment_id: parseInt(r.getAttribute('data-request-apt'), 10), source: 'card_price' }); }
  });
  window.addEventListener('popstate', function (e) {
    var m = /^#apt-(\d+)$/.exec(location.hash);
    if (m && byId[m[1]]) { pushed = false; openDialog(parseInt(m[1], 10), { fromHistory: true }); }
    else if (dlg.open) { pushed = false; dlg.close(); }
  });
  (function () { var m = /^#apt-(\d+)$/.exec(location.hash); if (m && byId[m[1]]) { history.replaceState(null, '', '#apartments'); openDialog(parseInt(m[1], 10)); } })();

  // ---------- facade -> floor -> apartment picker ----------
  (function () {
    var root = $('[data-picker]'); if (!root) return;
    var facade = $('[data-pk-facade]', root), floorBox = $('[data-pk-floor]', root);
    var tip = $('[data-pk-tip]', root), tip2 = $('[data-pk-tip2]', root);
    var svg = $('[data-pk-svg]', root), img = $('[data-pk-img]', root), title = $('[data-pk-title]', root), list = $('[data-pk-list]', root);
    var NS = 'http://www.w3.org/2000/svg', cur = null;
    var scene = $('[data-pk-scene]', root), box3d = $('[data-pk-scroll]', root), fbtns = $$('[data-floor-btn]', root);
    function size3d() { if (!floorBox.hidden) { var cw = box3d.clientWidth; scene.style.setProperty('--W', Math.round(cw < 700 ? cw * 0.9 : Math.min(cw * 0.8, 1300)) + 'px'); } }
    if ('ResizeObserver' in window) new ResizeObserver(size3d).observe(box3d); else window.addEventListener('resize', size3d);
    fbtns.forEach(function (b) { b.addEventListener('click', function () { openFloor(parseInt(b.getAttribute('data-floor-btn'), 10), true); }); });
    var byFloor = {}; APTS.forEach(function (a) { (byFloor[a.floor] = byFloor[a.floor] || []).push(a); });
    Object.keys(byFloor).forEach(function (f) { byFloor[f].sort(function (a, b) { return a.pos - b.pos; }); });
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    function aptLabel(a) { return T.catalog.apartment + ' ' + T.catalog.no + ' ' + a.id + ' · ' + T.catalog.roomsLabel[a.rooms] + ' · ' + area(a.area); }
    function showTip(el, box, text, e) {
      if (!fine) return;
      var r = box.getBoundingClientRect();
      el.textContent = text; el.hidden = false;
      var x = e.clientX - r.left + box.scrollLeft, y = e.clientY - r.top + box.scrollTop;
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }
    // facade: mouse click opens a floor; a tap first selects (highlight + confirm), a second tap or the button opens it
    var frame = $('.picker__canvas', facade), pan = $('[data-pk-pan]', facade), zoomBtn = $('[data-pk-zoom]', facade);
    var pick = $('[data-pk-pick]', root), pickLabel = $('[data-pk-pick-label]', root), selected = null, lastPointer = 'mouse';
    var bands = $$('[data-floor-pick]', facade);
    function markFloor(f) {
      selected = f;
      bands.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-floor-pick') === String(f)); });
      fbtns.forEach(function (b) { b.classList.toggle('is-last', b.getAttribute('data-floor-btn') === String(f)); });
    }
    function selectFloor(f) {
      markFloor(f);
      pickLabel.textContent = fmt(T.picker.floorCount, { n: f, count: (byFloor[f] || []).length });
      pick.hidden = false;
    }
    bands.forEach(function (b) {
      b.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; });
      b.addEventListener('mousemove', function (e) { showTip(tip, frame, b.getAttribute('data-tip'), e); });
      b.addEventListener('mouseleave', function () { tip.hidden = true; });
      b.addEventListener('click', function (e) {
        e.preventDefault(); tip.hidden = true;
        var f = parseInt(b.getAttribute('data-floor-pick'), 10);
        if (lastPointer === 'touch' && selected !== f) { selectFloor(f); return; }
        openFloor(f, true);
      });
    });
    $('[data-pk-pick-open]', root).addEventListener('click', function () { if (selected) openFloor(selected, true); });
    function setZoom(on) {
      facade.classList.toggle('is-zoomed', on);
      zoomBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      zoomBtn.setAttribute('aria-label', zoomBtn.getAttribute(on ? 'data-label-out' : 'data-label-in'));
      if (on) pan.scrollLeft = (pan.scrollWidth - pan.clientWidth) / 2;
    }
    zoomBtn.addEventListener('click', function () { setZoom(!facade.classList.contains('is-zoomed')); });
    function showFacade() {
      floorBox.hidden = true; facade.hidden = false; tip2.hidden = true;
      fbtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      if (cur) { selectFloor(cur); }
    }
    function openFloor(f, focus, fromHistory) {
      var wasOpen = !floorBox.hidden;
      cur = f; markFloor(f); pick.hidden = true;
      if (!fromHistory) {
        if (wasOpen && /^#floor-\d+$/.test(location.hash)) history.replaceState({ pkFloor: f }, '', '#floor-' + f);
        else history.pushState({ pkFloor: f }, '', '#floor-' + f);
      }
      var apts = byFloor[f] || [], fid = f === 1 ? 'floor-1' : 'floor-typical', shapes = D.floormap.shapes[fid];
      title.textContent = fmt(T.picker.floorCount, { n: f, count: apts.length });
      img.src = D.assets + 'img/floors/' + fid + '-1200.webp';
      img.srcset = D.assets + 'img/floors/' + fid + '-1200.webp 1200w, ' + D.assets + 'img/floors/' + fid + '-2400.webp 2400w';
      img.sizes = '(min-width: 1300px) 1240px, 1100px';
      img.alt = fmt(T.picker.planAlt, { n: f });
      svg.setAttribute('aria-label', fmt(T.picker.planAlt, { n: f }));
      svg.textContent = ''; list.textContent = '';
      apts.forEach(function (a) {
        var pts = shapes[a.pos]; if (!pts) return;
        var link = document.createElementNS(NS, 'a');
        link.setAttribute('href', '#apt-' + a.id); link.setAttribute('data-open-apt', a.id);
        link.setAttribute('class', 'pk-apt pk-apt--r' + a.rooms); link.setAttribute('aria-label', aptLabel(a));
        var poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '));
        var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
        var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pk-apt__tag'); g.setAttribute('aria-hidden', 'true');
        var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 34);
        var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', cx); tx.setAttribute('y', cy + 11); tx.textContent = a.id;
        g.appendChild(c); g.appendChild(tx); link.appendChild(poly); link.appendChild(g);
        link.addEventListener('mousemove', function (e) { showTip(tip2, box3d, aptLabel(a), e); });
        link.addEventListener('mouseleave', function () { tip2.hidden = true; });
        link.addEventListener('click', function () { tip2.hidden = true; track('picker_select', { apartment_id: a.id, apartment_floor: a.floor }); });
        svg.appendChild(link);
        var li = document.createElement('li'), btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'chip-btn'; btn.setAttribute('data-open-apt', a.id);
        btn.innerHTML = '<b></b><span></span>';
        btn.firstChild.textContent = T.catalog.no + ' ' + a.id;
        btn.lastChild.textContent = T.catalog.roomsLabel[a.rooms] + ' · ' + area(a.area);
        li.appendChild(btn); list.appendChild(li);
      });
      $$('[data-pk-step]', root).forEach(function (b) { var n = f + parseInt(b.getAttribute('data-pk-step'), 10); b.disabled = !byFloor[n]; });
      fbtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-floor-btn') === String(f) ? 'true' : 'false'); });
      if (wasOpen && !reduceMotion.matches) { box3d.classList.add('is-swapping'); var done = function () { box3d.classList.remove('is-swapping'); }; img.addEventListener('load', done, { once: true }); setTimeout(done, 400); }
      scene.style.setProperty('--n', f);
      facade.hidden = true; floorBox.hidden = false; size3d();
      if (focus) { title.focus({ preventScroll: true }); var top = root.getBoundingClientRect().top + window.pageYOffset - 90; if (Math.abs(window.pageYOffset - top) > 40) window.scrollTo({ top: top, behavior: reduce() ? 'auto' : 'smooth' }); }
      track('picker_floor', { apartment_floor: f });
    }
    function reduce() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
    $$('[data-pk-step]', root).forEach(function (b) {
      b.addEventListener('click', function () { var n = cur + parseInt(b.getAttribute('data-pk-step'), 10); if (byFloor[n]) { openFloor(n); b.disabled ? title.focus() : b.focus(); } });
    });
    $('[data-pk-back]', root).addEventListener('click', function () {
      if (/^#floor-\d+$/.test(location.hash) && history.state && history.state.pkFloor) history.back(); else { history.replaceState(null, '', '#choose'); showFacade(); }
      var back = $('[data-floor-pick="' + cur + '"]', facade); if (back) back.focus({ preventScroll: true });
    });
    window.addEventListener('popstate', function () {
      var m = /^#floor-(\d+)$/.exec(location.hash);
      if (m && byFloor[m[1]]) { if (floorBox.hidden || cur !== +m[1]) openFloor(+m[1], false, true); }
      else if (!/^#apt-/.test(location.hash) && !floorBox.hidden) showFacade();
    });
    (function () { var m = /^#floor-(\d+)$/.exec(location.hash); if (m && byFloor[m[1]]) { openFloor(+m[1], false, true); root.scrollIntoView(); } })();
  })();

  // ---------- gallery ----------
  (function () {
    var track = $('[data-gallery-track]'); if (!track) return;
    var slides = $$('.gallery__slide', track), thumbs = $$('[data-gallery-go]'), counter = $('[data-gallery-counter]');
    var cur = 0;
    if (slides[0]) slides[0].classList.add('is-current');
    function setCur(i) {
      cur = i; counter.textContent = fmt(T.gallery.counter, { i: i + 1, n: slides.length });
      slides.forEach(function (s, k) { s.classList.toggle('is-current', k === i); });
      thumbs.forEach(function (t, k) { if (k === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
      var th = thumbs[i]; if (th) { var p = th.parentNode.parentNode; var l = th.offsetLeft - p.clientWidth / 2 + th.offsetWidth / 2; p.scrollTo({ left: l, behavior: 'auto' }); }
    }
    function go(i) {
      i = (i + slides.length) % slides.length;
      var s = slides[i];
      track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      setCur(i);
    }
    $('[data-gallery-prev]').addEventListener('click', function () { go(cur - 1); });
    $('[data-gallery-next]').addEventListener('click', function () { go(cur + 1); });
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { go(i); }); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    });
    // full-screen viewer: the slide's own <picture> (AVIF/WebP up to 3840px) shown at viewport size
    var lb = $('[data-lightbox]');
    if (lb && lb.showModal) {
      var stage = $('[data-lb-stage]', lb), cap = $('[data-lb-caption]', lb), cnt = $('[data-lb-count]', lb), lbCur = 0, lastF = null;
      function show(i) {
        lbCur = (i + slides.length) % slides.length;
        var pic = $('picture', slides[lbCur]).cloneNode(true);
        $$('source', pic).forEach(function (s) { s.sizes = '100vw'; });
        var im = $('img', pic); im.loading = 'eager'; im.sizes = '100vw'; im.removeAttribute('class');
        stage.textContent = ''; stage.appendChild(pic);
        cap.textContent = $('figcaption span:last-child', slides[lbCur]).textContent;
        cnt.textContent = fmt(T.gallery.counter, { i: lbCur + 1, n: slides.length });
      }
      function openLb(i) { lastF = document.activeElement; show(i); lb.showModal(); document.body.style.overflow = 'hidden'; }
      lb.addEventListener('close', function () { document.body.style.overflow = ''; stage.textContent = ''; go(lbCur); if (lastF && lastF.focus) lastF.focus({ preventScroll: true }); });
      $('[data-gallery-full]').addEventListener('click', function () { openLb(cur); });
      slides.forEach(function (s, i) { var im = $('img', s); im.style.cursor = 'zoom-in'; im.addEventListener('click', function () { openLb(i); }); });
      $('[data-lb-close]', lb).addEventListener('click', function () { lb.close(); });
      $('[data-lb-prev]', lb).addEventListener('click', function () { show(lbCur - 1); });
      $('[data-lb-next]', lb).addEventListener('click', function () { show(lbCur + 1); });
      lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); show(lbCur + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); show(lbCur - 1); } });
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target === stage) lb.close(); });
      var sx = null, sy = 0;
      stage.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null; }, { passive: true });
      stage.addEventListener('touchend', function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(lbCur + (dx < 0 ? 1 : -1)); }, { passive: true });
    } else { var fb = $('[data-gallery-full]'); if (fb) fb.hidden = true; }
    if ('IntersectionObserver' in window) {
      var gio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio > 0.6) setCur(slides.indexOf(en.target)); }); }, { root: track, threshold: [0.6] });
      slides.forEach(function (s) { gio.observe(s); });
    }
  })();

  // ---------- map (loaded only on request) ----------
  (function () {
    var m = $('[data-map]'), b = $('[data-map-load]'); if (!m || !b) return;
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = m.getAttribute('data-map-src'); f.title = m.getAttribute('data-map-title');
      f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.setAttribute('allowfullscreen', '');
      m.appendChild(f); f.focus();
      track('map_open');
    });
  })();

  // ---------- copy phone ----------
  $$('[data-copy]').forEach(function (b) {
    var original = b.textContent;
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      function done() { b.textContent = b.getAttribute('data-copied'); setTimeout(function () { b.textContent = original; }, 2200); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { selectText(b.previousElementSibling); });
      else selectText(b.previousElementSibling);
    });
  });
  function selectText(el) { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  // phone clicks are measured as clicks, not as calls
  document.addEventListener('click', function (e) { var a = e.target.closest('[data-phone-link]'); if (a) track('click_phone', { link_location: a.closest('.mobile-bar') ? 'mobile_bar' : (a.closest('footer') ? 'footer' : 'contact') }); });
  document.addEventListener('click', function (e) { var a = e.target.closest('[data-cta]'); if (a) track('cta_click', { cta: a.getAttribute('data-cta') }); });

  // ---------- lead form ----------
  var lf = $('[data-lead-form]');
  var success = $('[data-lead-success]');
  var selBox = $('[data-selected]'), selVal = $('[data-selected-value]');
  var statusEl = $('[data-form-status]'), summaryEl = $('[data-form-summary]');
  var submitBtn = $('[data-submit]'), submitText = $('[data-submit-text]');
  var startedAt = Date.now(), started = false, sending = false;

  function selectApartment(id) {
    var a = byId[id]; if (!a) return;
    lf.elements.apartment.value = String(a.id);
    selVal.textContent = T.catalog.no + ' ' + a.id + ' · ' + fmt(T.catalog.floorShort, { n: a.floor }) + ' · ' + T.catalog.roomsLabel[a.rooms] + ' · ' + area(a.area);
    selBox.hidden = false;
    if (!success.hidden) { success.hidden = true; lf.hidden = false; }
    saveDraft();
  }
  function goToForm() {
    var sec = document.getElementById('contact');
    sec.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { var n = lf.elements.name; (n.value ? lf.elements.phone : n).focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 500);
  }
  $('[data-selected-remove]').addEventListener('click', function () { lf.elements.apartment.value = ''; selBox.hidden = true; saveDraft(); lf.elements.name.focus(); });

  var DRAFT_TTL = 14 * 864e5;
  function saveDraft() {
    if (!lf) return;
    var d = { name: lf.elements.name.value, phone: lf.elements.phone.value, comment: lf.elements.comment.value, apartment: lf.elements.apartment.value, t: Date.now() };
    if (d.name || d.phone || d.comment || d.apartment) local.set('ipr-draft', JSON.stringify(d)); else local.del('ipr-draft');
  }
  (function restoreDraft() {
    try {
      var d = JSON.parse(local.get('ipr-draft') || session.get('ipr-draft') || 'null'); if (!d) return;
      if (d.t && Date.now() - d.t > DRAFT_TTL) { local.del('ipr-draft'); return; }
      ['name', 'phone', 'comment'].forEach(function (k) { if (d[k] && !lf.elements[k].value) lf.elements[k].value = d[k]; });
      if (d.apartment && byId[d.apartment]) selectApartment(parseInt(d.apartment, 10));
    } catch (e) {}
  })();
  lf.addEventListener('input', function () {
    saveDraft();
    if (!started) { started = true; track('form_start', { form: 'lead' }); }
  });

  var rules = {
    name: function (v) { v = v.trim(); return v.length >= 2 && v.length <= 80 && /\p{L}/u.test(v); },
    phone: function (v) { var digits = v.replace(/\D/g, ''); return /^[+\d][\d\s()\-.]*$/.test(v.trim()) && digits.length >= 7 && digits.length <= 15; },
    comment: function (v) { return v.length <= 1000; }
  };
  function setError(name, ok) {
    var input = lf.elements[name], field = input.closest('.field'), err = document.getElementById('lead-' + name + '-error');
    field.classList.toggle('is-invalid', !ok);
    input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    err.hidden = ok; err.textContent = ok ? '' : T.contact.errors[name];
    return ok;
  }
  ['name', 'phone', 'comment'].forEach(function (n) {
    lf.elements[n].addEventListener('blur', function () { if (lf.elements[n].value || lf.elements[n].getAttribute('aria-invalid') === 'true') setError(n, rules[n](lf.elements[n].value)); });
    lf.elements[n].addEventListener('input', function () {
      if (lf.elements[n].getAttribute('aria-invalid') === 'true') setError(n, rules[n](lf.elements[n].value));
      if (!summaryEl.hidden && !lf.querySelector('[aria-invalid="true"]')) summaryEl.hidden = true;
    });
  });

  function uuid() { return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
  var submissionId = uuid();

  lf.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    statusEl.hidden = true;
    var bad = [];
    ['name', 'phone', 'comment'].forEach(function (n) { if (!setError(n, rules[n](lf.elements[n].value))) bad.push(n); });
    if (bad.length) {
      summaryEl.textContent = fmt(T.contact.errors.summary, { n: bad.map(function (n) { return T.contact[n]; }).join(', ') });
      summaryEl.hidden = false;
      lf.elements[bad[0]].focus();
      return;
    }
    summaryEl.hidden = true;
    var attr = {}; try { attr = JSON.parse(session.get('ipr-attr') || '{}'); } catch (err) {}
    var payload = {
      id: submissionId,
      name: lf.elements.name.value.trim(),
      phone: lf.elements.phone.value.trim(),
      comment: lf.elements.comment.value.trim(),
      apartment: lf.elements.apartment.value ? parseInt(lf.elements.apartment.value, 10) : null,
      company: lf.elements.company.value,
      elapsed: Date.now() - startedAt,
      lang: D.lang,
      page: location.pathname,
      attribution: attr
    };
    if (navigator.onLine === false) { showStatus(T.contact.errors.network); return; }
    sending = true; submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true'); submitText.textContent = T.contact.sending;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch(D.config.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok && res.body && res.body.ok === true) {
          track('generate_lead', { form: 'lead', apartment_id: payload.apartment || undefined });
          if (window.gtag && D.config.analytics.googleAdsId && D.config.analytics.googleAdsLeadLabel) {
            window.gtag('event', 'conversion', { send_to: D.config.analytics.googleAdsId + '/' + D.config.analytics.googleAdsLeadLabel, transaction_id: submissionId });
          }
          lf.reset(); lf.elements.apartment.value = ''; selBox.hidden = true; session.del('ipr-draft'); local.del('ipr-draft');
          submissionId = uuid(); started = false;
          lf.hidden = true; success.hidden = false; success.focus();
        } else {
          showStatus(res.status === 429 ? T.contact.errors.rate : T.contact.errors.server);
        }
      })
      .catch(function () { showStatus(T.contact.errors.network); })
      .then(function () { clearTimeout(timer); sending = false; submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); submitText.textContent = T.contact.submit; });
  });
  function showStatus(msg) { statusEl.textContent = msg; statusEl.hidden = false; }
  window.addEventListener('pagehide', saveDraft);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saveDraft(); });

  // ---------- connection state: a short, non-blocking notice ----------
  (function () {
    var n = document.createElement('p'); n.className = 'net-note'; n.setAttribute('role', 'status'); n.hidden = true; document.body.appendChild(n);
    var t = null;
    function show(msg, ms) { clearTimeout(t); n.textContent = msg; n.hidden = false; if (ms) t = setTimeout(function () { n.hidden = true; }, ms); }
    window.addEventListener('offline', function () { show(T.net.offline); });
    window.addEventListener('online', function () { show(T.net.online, 3000); if (!statusEl.hidden && statusEl.textContent === T.contact.errors.network) statusEl.hidden = true; });
    if (navigator.onLine === false) show(T.net.offline);
  })();
  $('[data-lead-again]').addEventListener('click', function () { success.hidden = true; lf.hidden = false; startedAt = Date.now(); lf.elements.name.focus(); });

  // ---------- mobile bottom bar: never covers the form, dialogs or the keyboard ----------
  var bar = $('[data-mobile-bar]');
  var formVisible = false, typing = false, heroVisible = true;
  function setMobileBar() { if (bar) bar.classList.toggle('is-hidden', heroVisible || formVisible || typing || !!document.querySelector('dialog[open]')); }
  if (bar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { formVisible = e[0].isIntersecting; setMobileBar(); }, { rootMargin: '0px 0px -10% 0px' }).observe($('.lead-card'));
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; setMobileBar(); }, { threshold: 0 }).observe($('.hero__actions'));
  }
  document.addEventListener('focusin', function (e) { typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.closest('.filters'); setMobileBar(); });
  document.addEventListener('focusout', function () { typing = false; setTimeout(setMobileBar, 50); });
  if (sheet) { sheet.addEventListener('close', setMobileBar); }

  // ---------- gentle reveal (content is readable before and without it) ----------
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    var targets = $$('.section-head, .project__figure, .facts, .benefits, .installment, .steps, .developer__mark, .map, .lead-card');
    var vh = window.innerHeight;
    targets = targets.filter(function (el) { return el.getBoundingClientRect().top > vh; });
    targets.forEach(function (el) { el.setAttribute('data-reveal', ''); });
    root.classList.add('reveal-ready');
    var rio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); rio.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { rio.observe(el); });
  }

  // ---------- analytics loader (only with configured ids and consent) ----------
  (function () {
    var a = D.config.analytics; var id = a.ga4MeasurementId || a.googleAdsId;
    var banner = $('[data-consent]');
    if (!id || !banner) return;
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });
    function loadTag() {
      if (window.__iprTag) return; window.__iprTag = true;
      var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id); document.head.appendChild(s);
      window.gtag('js', new Date());
      if (a.ga4MeasurementId) window.gtag('config', a.ga4MeasurementId);
      if (a.googleAdsId) window.gtag('config', a.googleAdsId);
    }
    function grant() { window.gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'denied', analytics_storage: 'granted' }); loadTag(); }
    var choice = local.get('ipr-consent');
    if (choice === 'granted') grant();
    else if (choice !== 'denied') banner.hidden = false;
    $('[data-consent-accept]').addEventListener('click', function () { local.set('ipr-consent', 'granted'); banner.hidden = true; grant(); });
    $('[data-consent-decline]').addEventListener('click', function () { local.set('ipr-consent', 'denied'); banner.hidden = true; });
  })();
})();
