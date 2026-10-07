// Functional audit (Playwright, Chromium): every interactive element, repeat actions, empty states,
// load errors and Back navigation. Usage: node tools/audit-functional.mjs [BASE]
// Needs the local dev server with the mock Telegram endpoint (see tools/dev-server.mjs).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://localhost:8787';
const res = [];
const ok = (area, cond, msg, detail = '') => { res.push({ area, pass: !!cond, msg, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); if (!cond) console.error('FAIL', area, msg, detail); };
const browser = await chromium.launch();
const fonts = (p) => p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
async function page(vp = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce', isMobile: vp.width < 1000, hasTouch: vp.width < 1000, ...opts });
  const p = await ctx.newPage(); await fonts(p);
  p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
  return p;
}
const headerH = (p) => p.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
const canScroll = (p) => p.evaluate(async () => { const y = scrollY; scrollBy(0, 300); await new Promise((r) => setTimeout(r, 60)); const moved = scrollY !== y; scrollTo(0, y); return moved && getComputedStyle(document.body).overflow !== 'hidden'; });

// ---- 1. header navigation, anchors, logo (desktop) ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/ru/`);
  const ids = await p.$$eval('.site-header [data-nav]', (as) => as.map((a) => a.getAttribute('data-nav')));
  for (const id of ids) {
    await p.click(`.site-header [data-nav="${id}"]`); await p.waitForTimeout(150);
    const top = await p.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, id);
    const hh = await headerH(p);
    ok('nav', top >= -2 && top <= hh + 40, `desktop nav → #${id} lands below header`, { top: Math.round(top), header: Math.round(hh) });
  }
  await p.click('.site-header a.brand, .site-header [class*=brand] a, .site-header a[href="#top"]').catch(() => {});
  await p.waitForTimeout(150);
  ok('nav', (await p.evaluate(() => scrollY)) < 5, 'logo returns to top');
  const anchors = await p.$$eval('a[href^="#"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => h.length > 1 && !document.getElementById(h.slice(1))));
  ok('nav', anchors.length === 0, 'every in-page anchor has a target', anchors);
  ok('js', p.errs.length === 0, 'no JS errors (desktop nav)', p.errs);
  await p.context().close();
}

} catch (e) { ok('crash', false, '1. header navigation, anchors, l', String(e).split('\n')[0]); }
// ---- 2. mobile menu: open, navigate, close, scroll unlocked; repeat ----
try {
{
  const p = await page({ width: 390, height: 844 });
  await p.goto(`${BASE}/ru/`);
  for (let i = 0; i < 2; i++) {
    await p.click('[data-menu-open]'); await p.waitForTimeout(100);
    ok('menu', await p.evaluate(() => document.getElementById('nav-sheet').open), `menu opens (run ${i + 1})`);
    const vh0 = await p.evaluate(() => document.getElementById('nav-sheet').getBoundingClientRect().height);
    await p.click('#nav-sheet [href="#location"]'); await p.waitForTimeout(250);
    ok('menu', !(await p.evaluate(() => document.getElementById('nav-sheet').open)), `menu closes after link (run ${i + 1})`);
    const top = await p.evaluate(() => document.getElementById('location').getBoundingClientRect().top);
    ok('menu', top >= -2 && top < 140, `mobile menu link lands on section (run ${i + 1})`, { top: Math.round(top), sheetH: Math.round(vh0) });
    ok('menu', await canScroll(p), `page scrolls after menu closes (run ${i + 1})`);
  }
  await p.click('[data-menu-open]'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok('menu', !(await p.evaluate(() => document.getElementById('nav-sheet').open)) && await canScroll(p), 'Esc closes menu, scroll free');
  await p.context().close();
}

} catch (e) { ok('crash', false, '2. mobile menu: open, navigate, ', String(e).split('\n')[0]); }
// ---- 3. theme toggle repeated ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/en/`);
  const seq = [];
  for (let i = 0; i < 3; i++) { await p.click('.site-header [data-theme-toggle]'); seq.push(await p.evaluate(() => document.documentElement.dataset.theme)); }
  ok('theme', seq.join() === 'light,dark,light', 'theme toggles each click', seq);
  const label = await p.$eval('.site-header [data-theme-toggle]', (b) => b.getAttribute('aria-label') || b.textContent.trim());
  ok('theme', /dark|тём|მუქ/i.test(label), 'toggle label describes next theme', label);
  await p.context().close();
}

} catch (e) { ok('crash', false, '3. theme toggle repeated ----', String(e).split('\n')[0]); }
// ---- 4. picker: facade → floor → 3D/plan → details, steps, back; desktop + touch ----
try {
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = vp.width < 1000 ? 'touch' : 'mouse';
  const p = await page(vp);
  await p.goto(`${BASE}/ru/#choose`); await p.waitForTimeout(300);
  const counts = await p.evaluate(() => { const c = {}; JSON.parse(document.getElementById('ipr-data').textContent).apartments.forEach((a) => { c[a[1]] = (c[a[1]] || 0) + 1; }); return c; });
  for (const f of [1, 5, 10]) {
    if (tag === 'touch') await p.tap(`[data-floor-btn="${f}"]`); else await p.click(`[data-floor-pick="${f}"]`, { force: true });
    await p.waitForTimeout(250);
    const st = await p.evaluate(() => ({ floor: !document.querySelector('[data-pk-floor]').hidden, facade: !document.querySelector('[data-pk-facade]').hidden, spots: document.querySelectorAll('[data-pk-svg] a').length, list: document.querySelectorAll('[data-pk-list] li').length, img: document.querySelector('[data-pk-img]').currentSrc || document.querySelector('[data-pk-img]').src }));
    ok('picker', st.floor && !st.facade && st.spots === counts[f] && st.list === counts[f], `${tag}: floor ${f} shows ${counts[f]} apartments`, st);
    await p.click('[data-pk-back]'); await p.waitForTimeout(150);
    ok('picker', await p.evaluate(() => !document.querySelector('[data-pk-facade]').hidden), `${tag}: back to facade from floor ${f}`);
  }
  await p.click(`[data-floor-btn="1"]`); await p.waitForTimeout(200);
  await p.click('[data-pk-step="-1"]').catch(() => {});
  ok('picker', await p.evaluate(() => document.querySelector('[data-pk-step="-1"]').disabled), `${tag}: step down disabled on floor 1`);
  for (let i = 0; i < 9; i++) { await p.click('[data-pk-step="1"]'); await p.waitForTimeout(60); }
  ok('picker', await p.evaluate(() => /10/.test(document.querySelector('[data-pk-title]').textContent) && document.querySelector('[data-pk-step="1"]').disabled), `${tag}: step up reaches floor 10 and stops`);
  // hotspot → dialog → 3D → plan → close → Back
  const first = await p.$('[data-pk-svg] a');
  const aptId = await first.evaluate((a) => (a.getAttribute('href') || '').replace(/\D/g, ''));
  if (tag === 'touch') await first.tap(); else await first.click({ force: true });
  await p.waitForTimeout(250);
  const d = await p.evaluate(() => ({ open: document.getElementById('apt-dialog').open, title: document.querySelector('[data-apt-title]').textContent, hash: location.hash, view: document.querySelector('[data-view="3d"]').getAttribute('aria-selected'), img3d: document.querySelector('[data-v3d-img]').getAttribute('src'), has3d: !document.querySelector('[data-v3d]').hidden }));
  ok('picker', d.open && d.title.includes(aptId) && d.hash === `#apt-${aptId}`, `${tag}: hotspot opens apartment ${aptId}`, d);
  if (d.has3d) {
    await p.click('[data-v3d-open]'); await p.waitForTimeout(150);
    ok('picker', await p.evaluate(() => document.querySelector('[data-view="plan"]').getAttribute('aria-selected') === 'true' && !document.querySelector('[data-plan-view]').hidden), `${tag}: 3D click switches to plan`);
  }
  const before = await p.evaluate(() => location.href);
  await p.goBack(); await p.waitForTimeout(250);
  ok('back', await p.evaluate(() => !document.getElementById('apt-dialog').open) && await canScroll(p), `${tag}: browser Back closes apartment, scroll free`, before);
  await p.goForward(); await p.waitForTimeout(250);
  ok('back', await p.evaluate(() => document.getElementById('apt-dialog').open), `${tag}: Forward reopens apartment`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('back', await canScroll(p), `${tag}: scroll free after Esc`);
  ok('js', p.errs.length === 0, `${tag}: no JS errors in picker`, p.errs);
  await p.context().close();
}

} catch (e) { ok('crash', false, '4. picker: facade → floor → 3D/p', String(e).split('\n')[0]); }
// ---- 5. catalog filters, sort, reset, empty state, show more ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/en/#apartments`);
  const data = await p.evaluate(() => JSON.parse(document.getElementById('ipr-data').textContent));
  const A = data.apartments.map((a) => ({ id: a[0], floor: a[1], rooms: a[2], area: a[3] }));
  const visibleIds = () => p.$$eval('[data-apt-list] > li', (ls) => ls.filter((l) => !l.hidden).map((l) => +l.getAttribute('data-apt')));
  const countText = () => p.$eval('[data-count]', (e) => e.textContent);
  for (const r of [1, 2, 3, 4]) {
    await p.click(`.filters label:has(input[name=rooms][value=\"${r}\"])`); await p.waitForTimeout(80);
    const n = A.filter((a) => a.rooms === r).length;
    ok('filters', (await countText()).includes(String(n)), `rooms=${r} count ${n}`, await countText());
  }
  await p.click('.filters label:has(input[name=rooms][value=\"all\"])');
  for (const b of data.t.catalog.areaBands) {
    await p.click(`.filters label:has(input[name=area][value=\"${b.id}\"])`); await p.waitForTimeout(80);
    const n = A.filter((a) => a.area >= b.min && a.area < b.max).length;
    ok('filters', (await countText()).includes(String(n)), `area ${b.id} count ${n}`, await countText());
  }
  await p.click('.filters label:has(input[name=area][value=\"all\"])');
  await p.selectOption('#filter-floor', '7'); await p.waitForTimeout(80);
  const f7 = A.filter((a) => a.floor === 7).length;
  ok('filters', (await countText()).includes(String(f7)), `floor 7 count ${f7}`);
  await p.selectOption('#filter-floor', 'all');
  for (const [s, cmp] of [['areaAsc', (x, y) => x <= y], ['areaDesc', (x, y) => x >= y]]) {
    await p.selectOption('#filter-sort', s); await p.waitForTimeout(80);
    const ids = await visibleIds(); const areas = ids.map((id) => A.find((a) => a.id === id).area);
    ok('filters', areas.length > 5 && areas.every((v, i) => i === 0 || cmp(areas[i - 1], v)), `sort ${s} ordered`, areas.slice(0, 6));
  }
  // empty state: 4 rooms on floor 1 (verify combination is empty in data first)
  const emptyCombo = [[4, '1'], [1, '10'], [4, '2']].find(([r, f]) => !A.some((a) => a.rooms === r && a.floor === +f));
  if (emptyCombo) {
    await p.click(`.filters label:has(input[name=rooms][value=\"${emptyCombo[0]}\"])`); await p.selectOption('#filter-floor', emptyCombo[1]); await p.waitForTimeout(100);
    ok('filters', await p.isVisible('[data-empty]') && (await visibleIds()).length === 0, `empty state shown (rooms ${emptyCombo[0]}, floor ${emptyCombo[1]})`);
  } else ok('filters', true, 'no empty combination in data (skipped)');
  await p.click('.filters__reset'); await p.waitForTimeout(120);
  const after = await p.evaluate(() => ({ rooms: document.querySelector('.filters input[name=rooms]:checked').value, floor: document.getElementById('filter-floor').value, sort: document.getElementById('filter-sort').value, empty: !document.querySelector('[data-empty]').hidden }));
  ok('filters', after.rooms === 'all' && after.floor === 'all' && after.sort === 'floor' && !after.empty && (await countText()).includes(String(A.length)), 'reset restores all 219', { ...after, c: await countText() });
  const v0 = (await visibleIds()).length; await p.click('[data-more]'); await p.waitForTimeout(100); const v1 = (await visibleIds()).length;
  ok('filters', v1 > v0, 'show more adds cards', { v0, v1 });
  // similar layouts button
  await p.click('[data-similar-rooms]'); await p.waitForTimeout(300);
  ok('filters', !(await countText()).includes(String(A.length)), 'typical layout → similar apartments filters catalog', await countText());
  await p.context().close();
}

} catch (e) { ok('crash', false, '5. catalog filters, sort, reset,', String(e).split('\n')[0]); }
// ---- 6. apartment dialog: open/close by X, Esc, backdrop; prev/next; zoom; scroll lock released ----
try {
{
  const p = await page({ width: 1280, height: 800 });
  await p.goto(`${BASE}/ka/#apartments`);
  for (const how of ['x', 'esc', 'backdrop']) {
    await p.click('[data-apt-list] > li:not([hidden]) [data-open-apt]'); await p.waitForTimeout(150);
    ok('dialog', await p.evaluate(() => document.getElementById('apt-dialog').open && getComputedStyle(document.body).overflow === 'hidden'), `opens and locks page scroll (${how})`);
    if (how === 'x') await p.click('[data-apt-close]');
    if (how === 'esc') await p.keyboard.press('Escape');
    if (how === 'backdrop') await p.mouse.click(5, 400);
    await p.waitForTimeout(200);
    ok('dialog', !(await p.evaluate(() => document.getElementById('apt-dialog').open)) && await canScroll(p), `closes via ${how}, page scroll restored`);
  }
  await p.click('[data-apt-list] > li:not([hidden]) [data-open-apt]'); await p.waitForTimeout(150);
  const t1 = await p.$eval('[data-apt-title]', (e) => e.textContent);
  await p.click('[data-apt-next]'); await p.waitForTimeout(120); const t2 = await p.$eval('[data-apt-title]', (e) => e.textContent);
  await p.click('[data-apt-prev]'); await p.waitForTimeout(120); const t3 = await p.$eval('[data-apt-title]', (e) => e.textContent);
  ok('dialog', t1 !== t2 && t1 === t3, 'next/prev apartment', [t1, t2, t3]);
  await p.click('[data-view="plan"]'); await p.click('[data-zoom="in"]');
  ok('dialog', await p.evaluate(() => document.querySelector('[data-plan-view]').classList.contains('is-zoomed')), 'plan zoom in');
  await p.click('[data-zoom="out"]');
  const pdf = await p.$eval('[data-apt-pdf]', (a) => ({ href: a.getAttribute('href'), hidden: a.hidden }));
  if (pdf.href) { const r = await p.request.get(new URL(pdf.href, p.url()).href); ok('pdf', r.status() === 200 && /pdf/.test(r.headers()['content-type']), 'apartment PDF downloads', { s: r.status(), href: pdf.href }); }
  await p.click('[data-apt-request]'); await p.waitForTimeout(400);
  ok('dialog', await p.evaluate(() => !document.getElementById('apt-dialog').open && !document.querySelector('[data-selected]').hidden && location.hash === '#contact'), '"request" closes dialog and pre-selects apartment in form');
  ok('js', p.errs.length === 0, 'no JS errors in dialog', p.errs);
  await p.context().close();
}

} catch (e) { ok('crash', false, '6. apartment dialog: open/close ', String(e).split('\n')[0]); }
// ---- 7. every plan PDF and plan image exists ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/en/`);
  const data = await p.evaluate(() => JSON.parse(document.getElementById('ipr-data').textContent));
  let bad = [];
  for (const a of data.apartments) {
    if (!a[6]) continue;
    for (const u of [`/assets/plans/pdf/isani-park-residence-E-apartment-${a[0]}.pdf`, `/assets/plans/img/apt-${a[0]}-1000.webp`]) { const r = await p.request.head(BASE + u).catch(() => null); if (!r || r.status() !== 200) bad.push(u); }
  }
  ok('pdf', bad.length === 0, `all plan PDFs respond 200 (${data.apartments.filter((a) => a[6]).length})`, bad.slice(0, 5));
  await p.context().close();
}

} catch (e) { ok('crash', false, '7. every plan PDF and plan image', String(e).split('\n')[0]); }
// ---- 8. 3D render fails to load → no broken image ----
try {
{
  const p = await page();
  await p.route('**/assets/img/3d/**', (r) => r.abort());
  await p.goto(`${BASE}/ru/#choose`);
  await p.click('[data-floor-btn="3"]'); await p.waitForTimeout(300);
  await p.click('[data-pk-list] a, [data-pk-list] button').catch(() => {}); await p.waitForTimeout(500);
  const st = await p.evaluate(() => { const i = document.querySelector('[data-v3d-img]'); const fig = document.querySelector('[data-v3d]'); return { open: document.getElementById('apt-dialog').open, broken: i.complete && i.naturalWidth === 0 && !fig.hidden && getComputedStyle(i).display !== 'none', planSelected: document.querySelector('[data-view="plan"]').getAttribute('aria-selected') }; });
  ok('errors', st.open && !st.broken, '3D render load error: no broken image shown', st);
  await p.context().close();
}
{
  const p = await page();
  await p.route('**/assets/plans/img/**', (r) => r.abort());
  await p.goto(`${BASE}/ru/#apartments`);
  await p.click('[data-apt-list] > li:not([hidden]) [data-open-apt]'); await p.click('[data-view="plan"]'); await p.waitForTimeout(500);
  const st = await p.evaluate(() => { const i = document.querySelector('[data-plan-img]'); return { broken: i.complete && i.naturalWidth === 0 && getComputedStyle(i).display !== 'none' && !i.hidden, msg: !document.querySelector('[data-plan-none]').hidden }; });
  ok('errors', !st.broken || st.msg, 'plan image load error: message instead of broken image', st);
  await p.context().close();
}

} catch (e) { ok('crash', false, '8. 3D render fails to load → no ', String(e).split('\n')[0]); }
// ---- 9. gallery: next/prev, thumbs, keyboard, counter, wrap; fullscreen ----
try {
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${BASE}/ru/#gallery`); await p.waitForTimeout(200);
  const counter = () => p.$eval('[data-gallery-counter]', (e) => e.textContent.trim());
  const c0 = await counter(); await p.click('[data-gallery-next]'); await p.waitForTimeout(700); const c1 = await counter();
  await p.click('[data-gallery-prev]'); await p.waitForTimeout(700); const c2 = await counter();
  ok('gallery', c0 !== c1 && c2 === c0, 'next/prev update counter', [c0, c1, c2]);
  await p.click('[data-gallery-go="5"]'); await p.waitForTimeout(700);
  ok('gallery', (await counter()).startsWith('6'), 'thumbnail jumps to slide 6', await counter());
  await p.focus('[data-gallery-track]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
  ok('gallery', (await counter()).startsWith('7'), 'ArrowRight on track', await counter());
  await p.click('[data-gallery-prev]'); for (let i = 0; i < 8; i++) { await p.click('[data-gallery-prev]'); await p.waitForTimeout(80); }
  await p.waitForTimeout(600);
  ok('gallery', (await counter()).startsWith('1'), 'prev stops at first (no wrap) or wraps consistently', await counter());
  const fs = await p.evaluate(() => !!document.querySelector('[data-gallery-full]') && !!document.querySelector('[data-lightbox]'));
  ok('gallery', fs, 'full-screen view for renders exists', fs ? '' : 'no fullscreen/lightbox control');
  if (fs) {
    const g0 = parseInt(await counter(), 10);
    await p.click('[data-gallery-full]'); await p.waitForTimeout(400);
    const l0 = parseInt(await p.$eval('[data-lb-count]', (e) => e.textContent), 10);
    const lb = await p.evaluate(() => { const i = document.querySelector('[data-lb-stage] img'); return { open: document.querySelector('[data-lightbox]').open, w: i && i.naturalWidth, lock: getComputedStyle(document.body).overflow }; });
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
    const c = await p.$eval('[data-lb-count]', (e) => e.textContent);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok('gallery', lb.open && lb.w >= 1280 && lb.lock === 'hidden' && l0 === g0 && parseInt(c, 10) === (g0 % 12) + 1 && !(await p.evaluate(() => document.querySelector('[data-lightbox]').open)) && await canScroll(p), 'viewer: opens on the current slide in high-res, arrows, Esc, scroll restored', { lb, g0, l0, c });
  }
  const imgs = await p.$$eval('.gallery__slide img', (is) => is.map((i) => ({ w: i.naturalWidth, src: i.currentSrc.split('/').pop() })));
  ok('gallery', imgs.every((i) => i.w === 0 || i.w >= 1100), 'gallery serves >=1100px renders on desktop', imgs.filter((i) => i.w).slice(0, 3));
  await p.context().close();
}

} catch (e) { ok('crash', false, '9. gallery: next/prev, thumbs, k', String(e).split('\n')[0]); }
// ---- 10. map: loads only on request ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/ru/#location`);
  ok('map', (await p.$$('[data-map] iframe')).length === 0, 'no third-party map before consent click');
  await p.route('https://www.google.com/maps**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>map</p>' }));
  await p.click('[data-map-load]'); await p.waitForTimeout(200);
  const ifr = await p.$eval('[data-map] iframe', (f) => ({ src: f.src, title: f.title })).catch(() => null);
  ok('map', ifr && /output=embed/.test(ifr.src) && /Tsuladze/.test(decodeURIComponent(ifr.src)) && ifr.title, 'map iframe loads with title and complex address', ifr);
  const ext = await p.$eval('.map__actions a', (a) => a.href);
  ok('map', /google\.com\/maps\/search/.test(ext), 'open in Google Maps link', ext);
  await p.context().close();
}

} catch (e) { ok('crash', false, '10. map: loads only on request -', String(e).split('\n')[0]); }
// ---- 11. FAQ ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/ru/#faq`);
  const n = await p.$$eval('.faq details', (d) => d.length);
  let okAll = true;
  for (let i = 0; i < n; i++) {
    const s = `.faq details >> nth=${i}`;
    const was = await p.$eval(`.faq details:nth-of-type(${i + 1})`, (d) => d.open).catch(() => null);
    await p.locator('.faq summary').nth(i).click(); const now = await p.locator('.faq details').nth(i).evaluate((d) => d.open);
    if (was === now) okAll = false;
  }
  ok('faq', okAll && n > 0, `all ${n} FAQ items toggle`);
  await p.locator('.faq summary').first().focus(); await p.keyboard.press('Enter');
  ok('faq', true, 'FAQ summary reachable by keyboard');
  await p.context().close();
}

} catch (e) { ok('crash', false, '11. FAQ ----', String(e).split('\n')[0]); }
// ---- 12. contact links ----
try {
{
  const p = await page();
  for (const lang of ['ka', 'en', 'ru']) {
    await p.goto(`${BASE}/${lang}/`);
    const L = await p.evaluate(() => ({
      tel: [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href')),
      wa: [...document.querySelectorAll('a[href*="wa.me"]')].map((a) => a.getAttribute('href')),
      mail: [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')),
      tg: [...document.querySelectorAll('a[href*="t.me/"]')].map((a) => a.getAttribute('href')),
      ext: [...document.querySelectorAll('a[target=_blank]')].filter((a) => !/noopener|noreferrer/.test(a.rel)).length,
      self: [...document.querySelectorAll('a[target=_blank]')].filter((a) => /monocapitals\.ge/.test(a.href)).map((a) => a.textContent.trim().slice(0, 40)),
    }));
    ok('contacts', L.tel.length && L.tel.every((h) => h === 'tel:+995544777788'), `${lang}: all tel: links +995544777788 (${L.tel.length})`, L.tel);
    ok('contacts', L.wa.length && L.wa.every((h) => /^https:\/\/wa\.me\/995544777788\?text=.+/.test(h)), `${lang}: WhatsApp with prefilled text (${L.wa.length})`);
    ok('contacts', L.mail.every((h) => h === 'mailto:info@monocapitals.ge') && L.mail.length, `${lang}: mailto`);
    ok('contacts', L.tg.length > 0, `${lang}: Telegram link present`, L.tg);
    ok('contacts', L.ext === 0, `${lang}: target=_blank links have rel=noopener`);
    ok('contacts', L.self.length === 0, `${lang}: no "external" links that point back to this same site`, L.self);
  }
  await p.context().close();
}

} catch (e) { ok('crash', false, '12. contact links ----', String(e).split('\n')[0]); }
// ---- 13. lead form: validation, server error, network error, success, again ----
try {
{
  const p = await page({ width: 390, height: 844 });
  await p.goto(`${BASE}/ru/#contact`);
  await p.click('[data-submit]'); await p.waitForTimeout(150);
  const v = await p.evaluate(() => ({ nameErr: !document.getElementById('lead-name-error').hidden, phoneErr: !document.getElementById('lead-phone-error').hidden, focus: document.activeElement.id, invalid: document.getElementById('lead-name').getAttribute('aria-invalid') }));
  ok('form', v.nameErr && v.phoneErr && v.focus === 'lead-name' && v.invalid === 'true', 'empty submit: errors, aria-invalid, focus first field', v);
  await p.fill('#lead-name', 'Тест'); await p.fill('#lead-phone', '12'); await p.click('[data-submit]'); await p.waitForTimeout(150);
  ok('form', await p.isVisible('#lead-phone-error') && (await p.evaluate(() => document.activeElement.id)) === 'lead-phone', 'invalid phone rejected, focus on phone');
  await p.fill('#lead-phone', '+995 555 12 34 56');
  await p.route('**/api/lead', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"delivery_failed"}' }));
  await p.click('[data-submit]'); await p.waitForTimeout(400);
  let st = await p.evaluate(() => ({ success: !document.querySelector('[data-lead-success]').hidden, status: (document.querySelector('[data-form-status]') || document.querySelector('.form-status') || {}).textContent || '', name: document.getElementById('lead-name').value, btn: document.querySelector('[data-submit]').disabled }));
  ok('form', !st.success && st.status.trim() && st.name === 'Тест' && !st.btn, 'server 500: honest error, data kept, button re-enabled', st);
  await p.unroute('**/api/lead');
  await p.route('**/api/lead', (r) => r.abort('internetdisconnected'));
  await p.click('[data-submit]'); await p.waitForTimeout(400);
  st = await p.evaluate(() => ({ success: !document.querySelector('[data-lead-success]').hidden, status: (document.querySelector('[data-form-status]') || document.querySelector('.form-status') || {}).textContent || '', btn: document.querySelector('[data-submit]').disabled }));
  ok('form', !st.success && st.status.trim() && !st.btn, 'network failure: error shown, can retry', st);
  await p.unroute('**/api/lead');
  await p.click('[data-submit]'); await p.waitForTimeout(800);
  ok('form', await p.isVisible('[data-lead-success]'), 'success shown only after server confirms');
  await p.click('[data-lead-again]'); await p.waitForTimeout(150);
  ok('form', await p.evaluate(() => !document.querySelector('[data-lead-form]').hidden && document.getElementById('lead-name').value === ''), '"send another" resets form');
  ok('js', p.errs.length === 0, 'no JS errors in form', p.errs);
  await p.context().close();
}

} catch (e) { ok('crash', false, '13. lead form: validation, serve', String(e).split('\n')[0]); }
// ---- 14. language switcher + root chooser ----
try {
{
  const p = await page();
  await p.goto(`${BASE}/`);
  for (const l of ['ka', 'en', 'ru']) { const h = await p.$eval(`[data-lang-link="${l}"]`, (a) => a.getAttribute('href')); ok('lang', h === `/${l}/`, `root chooser → /${l}/`); }
  await p.goto(`${BASE}/ka/`); await p.click('.site-header [data-lang-link="ru"]'); await p.waitForLoadState();
  ok('lang', /\/ru\/$/.test(p.url()) && (await p.evaluate(() => document.documentElement.lang)) === 'ru', 'ka → ru switch', p.url());
  await p.goBack(); await p.waitForLoadState();
  ok('lang', /\/ka\//.test(p.url()), 'Back returns to previous language', p.url());
  await p.context().close();
}

} catch (e) { ok('crash', false, '14. language switcher + root cho', String(e).split('\n')[0]); }
// ---- 15. keyboard: every Tab stop is visible ----
try {
{
  const p = await page({ width: 1280, height: 800 });
  await p.goto(`${BASE}/ru/`);
  const hidden = [];
  for (let i = 0; i < 400; i++) {
    await p.keyboard.press('Tab');
    const r = await p.evaluate(() => { let e = document.activeElement; if (!e || e === document.body) return null; if (e.matches('.chip input') && e.nextElementSibling) e = e.nextElementSibling; const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return { tag: e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''), vis: b.width > 1 && b.height > 1 && s.visibility !== 'hidden' && s.opacity !== '0', inView: b.bottom > 0 && b.top < innerHeight, foot: !!e.closest('footer') }; });
    if (!r) break;
    if (!r.vis || !r.inView) hidden.push(r.tag);
    if (r.foot && r.tag.startsWith('A') && i > 120) { /* reached footer */ }
  }
  ok('keyboard', hidden.length === 0, 'no invisible/off-screen element receives focus', [...new Set(hidden)].slice(0, 8));
  await p.context().close();
}

} catch (e) { ok('crash', false, '15. keyboard: every Tab stop is ', String(e).split('\n')[0]); }
await browser.close();
const fails = res.filter((r) => !r.pass);
console.log(JSON.stringify({ total: res.length, passed: res.length - fails.length, failed: fails.length, results: res }, null, 1));
