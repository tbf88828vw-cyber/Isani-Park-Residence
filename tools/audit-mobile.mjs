// Mobile UX audit (Playwright, Chromium with touch + device emulation). Usage: node tools/audit-mobile.mjs [BASE]
// Needs tools/dev-server.mjs with the mock Telegram endpoint on :8787.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://localhost:8787';
const res = [];
const ok = (area, cond, msg, detail = '') => { res.push({ area, pass: !!cond, msg, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); if (!cond) console.error('FAIL', area, msg, typeof detail === 'string' ? detail : JSON.stringify(detail)); };
const browser = await chromium.launch();
const IPHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const ANDROID = { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' };
async function page(dev = IPHONE, extra = {}) {
  const ctx = await browser.newContext({ ...dev, reducedMotion: 'reduce', ...extra });
  const p = await ctx.newPage();
  await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e)));
  return p;
}
const touch = async (p) => { const cdp = await p.context().newCDPSession(p); return (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) }); };
const overflowX = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const block = async (name, fn) => { try { await fn(); } catch (e) { ok('crash', false, name, String(e).split('\n')[0]); } };

// 1. first screen: name, place, benefit and the main action visible without scrolling
await block('hero', async () => {
  for (const [w, h] of [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915], [430, 932], [667, 375], [844, 390]]) {
    for (const lang of ['ka', 'en', 'ru']) {
      const p = await page({ ...IPHONE, viewport: { width: w, height: h } });
      await p.goto(`${BASE}/${lang}/`);
      const r = await p.evaluate(() => {
        const vis = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent); if (!e) return null; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1; };
        return { ctx: vis('.hero__context'), title: vis('.hero__title svg:not([style*="none"])') ?? vis('.hero__title'), offer: vis('.hero__offer'), cta: vis('.hero__actions .btn--primary'), ctaHref: document.querySelector('.hero__actions .btn--primary').getAttribute('href') };
      });
      ok('hero', r.ctx && r.title && r.offer && r.cta && r.ctaHref === '#choose', `${lang} ${w}x${h}: place, name, benefit and "choose" CTA on first screen`, r);
      await p.context().close();
    }
  }
});

// 2. menu: opens/closes smoothly, locks page scroll, links land, Esc / backdrop close, landscape scrolls
await block('menu', async () => {
  const p = await page(IPHONE, { reducedMotion: 'no-preference' });
  await p.goto(`${BASE}/ru/`); await p.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' })); await p.waitForTimeout(150);
  await p.tap('[data-menu-open]'); await p.waitForTimeout(260);
  const st = await p.evaluate(() => ({ open: document.getElementById('nav-sheet').open, locked: document.documentElement.classList.contains('is-locked'), anim: getComputedStyle(document.getElementById('nav-sheet')).animationName, y: scrollY }));
  await p.mouse.wheel(0, 600); await p.waitForTimeout(150);
  ok('menu', st.open && st.locked && st.anim === 'sheet-in', 'opens with a short slide-in, page scroll locked', st);
  ok('menu', (await p.evaluate(() => scrollY)) === st.y, 'page does not scroll behind the open menu');
  await p.tap('[data-menu-close]'); await p.waitForTimeout(260);
  ok('menu', await p.evaluate(() => !document.getElementById('nav-sheet').open && !document.documentElement.classList.contains('is-locked')), 'close button: animated close, scroll unlocked');
  await p.tap('[data-menu-open]'); await p.waitForTimeout(260); await p.tap('#nav-sheet [href="#purchase"]'); await p.waitForTimeout(1500);  // smooth scroll
  const top = await p.evaluate(() => document.getElementById('purchase').getBoundingClientRect().top);
  ok('menu', top > -5 && top < 140 && await p.evaluate(() => !document.documentElement.classList.contains('is-locked')), 'link closes the menu and lands on the section', { top });
  await p.tap('[data-menu-open]'); await p.waitForTimeout(260); await p.keyboard.press('Escape'); await p.waitForTimeout(260);
  ok('menu', await p.evaluate(() => !document.getElementById('nav-sheet').open), 'Esc / system back closes the menu');
  const css = await p.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch (e) { return []; } }).find((t) => t.startsWith('.nav-sheet {')) || '');
  ok('menu', /safe-area-inset-top/.test(css) && /safe-area-inset-bottom/.test(css) && /safe-area-inset-left/.test(css), 'menu padding honours safe areas (notch, home indicator)');
  await p.setViewportSize({ width: 844, height: 390 }); await p.tap('[data-menu-open]'); await p.waitForTimeout(260);
  const ls = await p.evaluate(() => { const s = document.getElementById('nav-sheet'); const last = [...s.querySelectorAll('.nav-sheet__links a')].pop(); s.scrollTop = 9999; return { scrollable: s.scrollHeight > s.clientHeight, lastVisible: last.getBoundingClientRect().bottom <= innerHeight }; });
  ok('menu', ls.lastVisible, 'landscape: every menu link reachable', ls);
  ok('js', p.errs.length === 0, 'menu: no JS errors', p.errs);
  await p.context().close();
});

// 3. facade: touch select → confirm, zoom, highlight, Back keeps state, no hover required
await block('facade', async () => {
  const p = await page();
  await p.goto(`${BASE}/ru/#choose`); await p.waitForTimeout(300);
  ok('facade', !(await p.evaluate(() => /Наведите|наведите/.test(document.querySelector('#choose').textContent))), 'no hover-only instructions');
  const zb = await p.$('[data-pk-zoom]'); ok('facade', zb && await zb.isVisible(), 'zoom button visible on touch screens');
  const h0 = await p.$eval('[data-floor-pick="5"] rect', (r) => r.getBoundingClientRect().height);
  await p.tap('[data-pk-zoom]'); await p.waitForTimeout(150);
  const h1 = await p.$eval('[data-floor-pick="5"] rect', (r) => r.getBoundingClientRect().height);
  ok('facade', h1 >= 24 && h1 > h0 * 2, 'zoom makes floor zones ≥24px tall', { before: Math.round(h0), after: Math.round(h1) });
  await p.evaluate(() => document.querySelector('[data-floor-pick="7"] rect').scrollIntoView({ block: 'center', inline: 'center' })); await p.waitForTimeout(150);
  const bb = await (await p.$('[data-floor-pick="7"] rect')).boundingBox();
  const tapX = Math.max(bb.x, 0) + 60;  // a visible point of the band (the zoomed facade is wider than the screen)
  await p.touchscreen.tap(tapX, bb.y + bb.height / 2); await p.waitForTimeout(150);
  let st = await p.evaluate(() => ({ pick: !document.querySelector('[data-pk-pick]').hidden, label: document.querySelector('[data-pk-pick-label]').textContent, floor: !document.querySelector('[data-pk-floor]').hidden, active: document.querySelector('.pk-band.is-active')?.getAttribute('data-floor-pick') }));
  ok('facade', st.pick && !st.floor && st.active === '7' && /7/.test(st.label), 'first tap selects and highlights the floor (no accidental navigation)', st);
  await p.touchscreen.tap(tapX, bb.y + bb.height / 2); await p.waitForTimeout(200);
  ok('facade', await p.evaluate(() => !document.querySelector('[data-pk-floor]').hidden && location.hash === '#floor-7'), 'second tap on the same floor opens it');
  await p.goBack(); await p.waitForTimeout(200);
  st = await p.evaluate(() => ({ facade: !document.querySelector('[data-pk-facade]').hidden, active: document.querySelector('.pk-band.is-active')?.getAttribute('data-floor-pick'), zoomed: document.querySelector('[data-pk-facade]').classList.contains('is-zoomed'), pick: !document.querySelector('[data-pk-pick]').hidden }));
  ok('facade', st.facade && st.active === '7' && st.zoomed && st.pick, 'browser Back returns to the facade with the floor still selected and zoom kept', st);
  await p.tap('[data-pk-pick-open]'); await p.waitForTimeout(200);
  await p.tap('[data-pk-list] button'); await p.waitForTimeout(250);
  await p.goBack(); await p.waitForTimeout(250);
  ok('facade', await p.evaluate(() => !document.getElementById('apt-dialog').open && !document.querySelector('[data-pk-floor]').hidden && location.hash === '#floor-7'), 'Back from an apartment returns to its floor plan');
  await p.tap('[data-pk-back]'); await p.waitForTimeout(200);
  ok('facade', await p.evaluate(() => !document.querySelector('[data-pk-facade]').hidden), '"К фасаду" button returns to the facade');
  const fb = await p.$$eval('[data-floor-btn]', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok('facade', fb.every((x) => x >= 44), 'floor buttons are 44px touch targets', fb);
  ok('facade', (await overflowX(p)) <= 0, 'zoomed facade causes no page-level horizontal scroll');
  ok('js', p.errs.length === 0, 'facade: no JS errors', p.errs);
  await p.context().close();
});

// 4. catalog: compact cards, collapsible filters, chips, reset, empty state, scroll position
await block('catalog', async () => {
  const p = await page();
  await p.goto(`${BASE}/ru/#apartments`); await p.waitForTimeout(200);
  ok('catalog', !(await p.isVisible('#filters-panel')) && await p.isVisible('[data-filters-toggle]'), 'filters start collapsed behind a "Фильтры" button');
  const cardH = await p.$eval('[data-apt-list] > li:not([hidden])', (l) => l.getBoundingClientRect().height);
  ok('catalog', cardH <= 220, 'compact card ≤220px tall', Math.round(cardH));
  const img = await p.$eval('[data-apt-list] > li:not([hidden]) .apt-card__plan img', (i) => getComputedStyle(i).objectFit);
  ok('catalog', img === 'contain', 'plan thumbnails are never cropped (object-fit: contain)', img);
  await p.tap('[data-filters-toggle]'); await p.tap('.filters label:has(input[name=rooms][value="3"])'); await p.tap('.filters label:has(input[name=area][value="l"])'); await p.waitForTimeout(100);
  const applyTxt = await p.$eval('[data-filters-apply]', (b) => b.textContent);
  await p.tap('[data-filters-apply]'); await p.waitForTimeout(300);
  let st = await p.evaluate(() => ({ open: document.getElementById('filters-panel').classList.contains('is-open'), chips: [...document.querySelectorAll('[data-remove-filter]')].map((b) => b.firstChild.textContent), n: document.querySelector('[data-filters-n]').textContent, bar: document.querySelector('[data-count-bar]').textContent, listTop: Math.round(document.querySelector('[data-apt-list]').getBoundingClientRect().top) }));
  ok('catalog', !st.open && st.chips.length === 2 && st.n === '2' && /\d/.test(applyTxt) && st.listTop < 300, '"Show N" closes the panel, shows chips + counter and scrolls to results', { ...st, applyTxt });
  const sticky = await p.evaluate(() => { scrollBy(0, 800); const r = document.querySelector('[data-filters-bar]').getBoundingClientRect(); return Math.round(r.top); });
  ok('catalog', sticky >= 60 && sticky <= 80, 'filter bar stays under the header while scrolling the list', sticky);
  await p.tap('[data-remove-filter="area"]'); await p.waitForTimeout(100);
  ok('catalog', (await p.$$('[data-remove-filter]')).length === 1, 'tapping × on a chip removes just that filter');
  await p.tap('[data-filters-bar] [data-filters-clear]'); await p.waitForTimeout(150);
  ok('catalog', (await p.$eval('[data-count-bar]', (e) => e.textContent)).includes('219') && (await p.$$('[data-remove-filter]')).length === 0, 'one-tap reset back to 219');
  await p.tap('[data-filters-toggle]'); await p.tap('.filters label:has(input[name=rooms][value="1"])'); await p.tap('.filters label:has(input[name=area][value="xl"])'); await p.waitForTimeout(150);  // no 1-room apartment above 80 m²
  const empty = await p.evaluate(() => ({ shown: !document.querySelector('[data-empty]').hidden, reset: !!document.querySelector('[data-empty] [data-filters-clear]') }));
  ok('catalog', empty.shown && empty.reset, 'empty state explains and offers a reset button', empty);
  await p.tap('[data-empty] [data-filters-clear]'); await p.waitForTimeout(150);
  await p.tap('[data-filters-toggle]').catch(() => {});
  // tap on a card body opens it; closing keeps the scroll position
  await p.tap('[data-more]'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('[data-apt-list] > li:nth-child(16)').scrollIntoView({ block: 'center' })); await p.waitForTimeout(150);
  const y0 = await p.evaluate(() => scrollY);
  await p.tap('[data-apt-list] > li:nth-child(16) .apt-card__area'); await p.waitForTimeout(250);
  ok('catalog', await p.evaluate(() => document.getElementById('apt-dialog').open), 'tapping the card body opens the apartment');
  await p.tap('[data-apt-close]'); await p.waitForTimeout(250);
  ok('catalog', Math.abs((await p.evaluate(() => scrollY)) - y0) < 4, 'closing the apartment keeps the scroll position', { y0, y1: await p.evaluate(() => scrollY) });
  const yr = await p.evaluate(() => scrollY);
  await p.reload(); await p.waitForTimeout(600);
  ok('catalog', (await p.$$eval('[data-apt-list] > li:not([hidden])', (l) => l.length)) >= 24, '"Show more" depth survives reload / Back');
  ok('catalog', Math.abs((await p.evaluate(() => scrollY)) - yr) < 40, 'reload returns to the same place in the list', { before: yr, after: await p.evaluate(() => scrollY) });
  await p.goto(`${BASE}/ru/privacy/`); await p.goBack(); await p.waitForTimeout(600);
  ok('catalog', Math.abs((await p.evaluate(() => scrollY)) - yr) < 40, 'Back from another page returns to the same place in the list', { before: yr, after: await p.evaluate(() => scrollY) });
  const t0 = Date.now(); for (const r of ['1', '2', '3', '4', 'all']) await p.evaluate((r) => { const i = document.querySelector(`.filters input[name=rooms][value="${r}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, r);
  const per = (Date.now() - t0) / 5;
  ok('catalog', per < 50, 'filter change re-renders 219 cards quickly', `${per.toFixed(1)} ms per change`);
  ok('js', p.errs.length === 0, 'catalog: no JS errors', p.errs);
  await p.context().close();
});

// 5. plans: pinch, pan, double-tap, drag-scroll at 1x, sharp source, original, close
await block('plans', async () => {
  const p = await page(); const T = await touch(p);
  await p.goto(`${BASE}/ru/#apartments`);
  await p.tap('[data-apt-list] > li:not([hidden]) [data-open-apt]'); await p.tap('[data-view="plan"]'); await p.waitForTimeout(600);
  const b = await (await p.$('[data-plan-scroll]')).boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const st = () => p.evaluate(() => { const i = document.querySelector('[data-plan-img]'); const m = /scale\(([\d.]+)\)/.exec(i.style.transform); return { s: m ? +m[1] : 1, src: i.currentSrc.split('/').pop(), body: document.querySelector('.apt-dialog__body').scrollTop, y: scrollY }; });
  const s0 = await st();
  ok('plans', /-2000\.webp$/.test(s0.src), 'high-DPR phone gets the 2000px plan (no blur)', s0.src);
  await T('touchStart', [[cx - 30, cy], [cx + 30, cy]]); for (let i = 1; i <= 8; i++) { await T('touchMove', [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]); await p.waitForTimeout(16); } await T('touchEnd', []);
  const s1 = await st();
  ok('plans', s1.s > 2.5 && s1.y === s0.y, 'two-finger pinch zooms the plan, not the page', s1);
  const tf = await p.$eval('[data-plan-img]', (i) => i.style.transform);
  await T('touchStart', [[cx, cy]]); for (let i = 1; i <= 5; i++) { await T('touchMove', [[cx + i * 12, cy + i * 8]]); await p.waitForTimeout(16); } await T('touchEnd', []);
  ok('plans', (await p.$eval('[data-plan-img]', (i) => i.style.transform)) !== tf && (await st()).body === s0.body, 'one-finger pan moves the zoomed plan without scrolling the dialog');
  await T('touchStart', [[cx, cy]]); await T('touchEnd', []); await p.waitForTimeout(100); await T('touchStart', [[cx, cy]]); await T('touchEnd', []); await p.waitForTimeout(300);
  ok('plans', (await st()).s === 1, 'double-tap returns to 1x');
  await T('touchStart', [[cx, cy + 50]]); for (let i = 1; i <= 6; i++) { await T('touchMove', [[cx, cy + 50 - i * 20]]); await p.waitForTimeout(16); } await T('touchEnd', []);
  ok('plans', (await st()).body > 40, 'at 1x a vertical swipe on the plan scrolls the dialog (no trap)');
  await p.evaluate(() => { document.querySelector('.apt-dialog__body').scrollTop = 0; });
  await T('touchStart', [[cx, cy]]); await T('touchEnd', []); await p.waitForTimeout(100); await T('touchStart', [[cx, cy]]); await T('touchEnd', []); await p.waitForTimeout(300);
  ok('plans', (await st()).s === 2.5, 'double-tap zooms in at the finger');
  const orig = await p.$eval('[data-plan-original]', (a) => ({ href: a.getAttribute('href'), vis: !!a.offsetParent }));
  const r = await p.request.get(new URL(orig.href, p.url()).href);
  ok('plans', orig.vis && r.status() === 200 && /pdf/.test(r.headers()['content-type']), '"original" opens the vector PDF', orig);
  const close = await p.$eval('[data-apt-close]', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, top: r.top }; });
  ok('plans', close.w >= 44 && close.top >= 0 && close.top < 80, 'close button is large and always at the top', close);
  const sa = await p.evaluate(() => { const r = document.querySelector('.apt-dialog__actions').getBoundingClientRect(); return Math.round(innerHeight - r.bottom); });
  ok('plans', Math.abs(sa) <= 1, 'price request stays pinned at the bottom of the apartment view', sa);
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(250);
  ok('plans', (await st()).s === 2.5 && (await overflowX(p)) <= 0, 'rotation keeps the zoom and fits the screen');
  await p.tap('[data-apt-close]'); await p.waitForTimeout(200);
  ok('plans', await p.evaluate(() => !document.getElementById('apt-dialog').open && getComputedStyle(document.body).overflow !== 'hidden'), 'closed cleanly, page scroll restored');
  ok('js', p.errs.length === 0, 'plans: no JS errors', p.errs);
  await p.context().close();
});

// 6. form: keyboard, international numbers, errors, draft survives closing, no double send, honest success
await block('form', async () => {
  const p = await page(ANDROID);
  await p.goto(`${BASE}/ru/#contact`);
  const a = await p.$eval('#lead-phone', (i) => ({ type: i.type, inputmode: i.inputMode, ac: i.autocomplete, ekh: i.enterKeyHint }));
  ok('form', a.type === 'tel' && a.inputmode === 'tel' && a.ac === 'tel', 'phone field opens the phone keypad with autofill', a);
  const valid = await p.evaluate(() => {
    const f = document.getElementById('lead-phone'); const out = {};
    for (const v of ['+995 555 12 34 56', '+7 912 345-67-89', '+44 20 7946 0958', '+1 (212) 555-0123', '555123456', '12', 'abc', '+995 55']) {
      f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('blur')); out[v] = f.getAttribute('aria-invalid') !== 'true';
    }
    return out;
  });
  ok('form', valid['+995 555 12 34 56'] && valid['+7 912 345-67-89'] && valid['+44 20 7946 0958'] && valid['+1 (212) 555-0123'] && valid['555123456'] && !valid['12'] && !valid['abc'] && !valid['+995 55'], 'international numbers accepted, junk rejected', valid);
  const err = await p.$eval('#lead-phone-error', (e) => e.textContent);
  ok('form', err.length > 20, 'error text explains what to fix', err);
  await p.fill('#lead-name', 'Нино'); await p.fill('#lead-phone', '+995 555 00 11 22'); await p.fill('#lead-comment', 'Позвоните после 15:00');
  await p.close({ runBeforeUnload: true });
  const p2 = await p.context().newPage(); await p2.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await p2.goto(`${BASE}/ru/#contact`);
  const d = await p2.evaluate(() => ({ n: document.getElementById('lead-name').value, ph: document.getElementById('lead-phone').value, c: document.getElementById('lead-comment').value }));
  ok('form', d.n === 'Нино' && d.ph === '+995 555 00 11 22' && d.c === 'Позвоните после 15:00', 'draft restored after the tab was closed and reopened', d);
  let calls = 0; await p2.route('**/api/lead', async (r) => { calls++; await new Promise((x) => setTimeout(x, 400)); await r.continue(); });
  await p2.tap('[data-submit]'); await p2.evaluate(() => { const b = document.querySelector('[data-submit]'); b.click(); b.click(); document.querySelector('[data-lead-form]').requestSubmit(); });
  ok('form', await p2.evaluate(() => document.querySelector('[data-submit]').disabled && !document.querySelector('[data-lead-form]').hidden && document.querySelector('[data-lead-success]').hidden), 'while sending: button disabled, no success shown yet');
  await p2.waitForTimeout(900);
  ok('form', calls === 1, 'repeated taps send exactly one enquiry', calls);
  ok('form', await p2.isVisible('[data-lead-success]'), 'success only after the server confirmed');
  ok('form', await p2.evaluate(() => !localStorage.getItem('ipr-draft')), 'draft cleared after a confirmed send');
  await p2.context().close();
});

// 7. mobile CTA bar: helps, never covers
await block('bar', async () => {
  const p = await page();
  await p.goto(`${BASE}/ru/`); await p.waitForTimeout(200);
  const hid = () => p.evaluate(() => document.querySelector('[data-mobile-bar]').classList.contains('is-hidden'));
  ok('bar', await hid(), 'hidden on the first screen (hero has its own buttons)');
  await p.evaluate(() => document.getElementById('apartments').scrollIntoView()); await p.waitForTimeout(250);
  ok('bar', !(await hid()), 'appears once the hero is scrolled away');
  const bar = await p.evaluate(() => { const b = document.querySelector('[data-mobile-bar]'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), tel: b.querySelector('a[href^="tel:"]')?.getAttribute('href'), wa: /^https:\/\/wa\.me\/995544777788\?text=/.test(b.querySelector('a[href*="wa.me"]')?.getAttribute('href') || ''), oneLine: [...b.querySelectorAll('.btn')].every((x) => x.scrollHeight <= x.clientHeight + 2) }; });
  ok('bar', bar.h <= 66 && bar.tel === 'tel:+995544777788' && bar.wa && bar.oneLine, 'compact (≤66px): choose + call + WhatsApp, labels on one line', bar);
  await p.tap('[data-apt-list] > li:not([hidden]) [data-open-apt]'); await p.waitForTimeout(200);
  ok('bar', await hid(), 'hidden while an apartment is open'); await p.tap('[data-apt-close]');
  await p.tap('[data-menu-open]'); await p.waitForTimeout(100); ok('bar', await hid(), 'hidden while the menu is open'); await p.tap('[data-menu-close]'); await p.waitForTimeout(250);
  await p.evaluate(() => document.querySelector('.lead-card').scrollIntoView()); await p.waitForTimeout(250);
  ok('bar', await hid(), 'hidden while the enquiry form is on screen');
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(250);
  const end = await p.evaluate(() => { const f = [...document.querySelectorAll('.site-footer__fine')].pop().getBoundingClientRect(); const b = document.querySelector('[data-mobile-bar]'); return { covered: !b.classList.contains('is-hidden') && f.bottom > b.getBoundingClientRect().top }; });
  ok('bar', !end.covered, 'never covers the last line of the page', end);
  await p.context().close();
});

// 8. slow network, offline, rotation, returning from another app
await block('network', async () => {
  let p = await page(IPHONE);
  await p.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { effectiveType: '3g', saveData: false, addEventListener() {} } }); });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await p.goto(`${BASE}/ru/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('.hero__actions .btn--primary', { state: 'visible' });
  const dcl = Date.now() - t0;
  const fcp = await p.evaluate(() => Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0));
  await p.waitForTimeout(3000);
  const video = await p.evaluate(() => !!document.querySelector('[data-hero-video]').getAttribute('src'));
  ok('network', !video, 'slow 3G: the hero video is not downloaded, poster only');
  ok('network', fcp > 0 && fcp < 6000, 'slow 3G (400 kbit/s, 400 ms RTT, 4x CPU): first screen painted', { fcpMs: fcp, domContentLoadedMs: dcl });
  await p.context().close();
  p = await page(IPHONE);   // normal network from here on
  await p.goto(`${BASE}/ru/#contact`);
  await p.fill('#lead-name', 'Тест'); await p.fill('#lead-phone', '+995 555 11 22 33');
  await p.context().setOffline(true); await p.waitForTimeout(100);
  const off = await p.evaluate(() => { const n = document.querySelector('.net-note'); return { note: n && !n.hidden, text: n && n.textContent }; });
  ok('network', off.note, 'losing the connection shows a short notice', off);
  const t1 = Date.now(); await p.tap('[data-submit]'); await p.waitForTimeout(200);
  const st = await p.evaluate(() => ({ status: document.querySelector('[data-form-status]').textContent, hidden: document.querySelector('[data-form-status]').hidden, name: document.getElementById('lead-name').value, success: !document.querySelector('[data-lead-success]').hidden }));
  ok('network', !st.hidden && !st.success && st.name === 'Тест' && Date.now() - t1 < 1500, 'offline submit fails fast with an honest message, data kept', st);
  await p.context().setOffline(false); await p.waitForTimeout(150);
  ok('network', await p.evaluate(() => document.querySelector('[data-form-status]').hidden), 'back online: the stale error disappears');
  await p.tap('[data-submit]'); await p.waitForTimeout(800);
  ok('network', await p.isVisible('[data-lead-success]'), 'retry after reconnecting succeeds');
  // rotation with an open dialog and zoomed facade
  await p.goto(`${BASE}/ru/#choose`); await p.tap('[data-pk-zoom]'); await p.tap('[data-floor-btn="4"]'); await p.waitForTimeout(200);
  for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await p.setViewportSize(vp); await p.waitForTimeout(250);
    ok('rotation', (await overflowX(p)) <= 0 && await p.evaluate(() => !document.querySelector('[data-pk-floor]').hidden), `rotate to ${vp.width}x${vp.height}: floor view kept, no horizontal scroll`);
  }
  // switching to another app/tab and back
  await p.goto(`${BASE}/ru/?fresh=1#contact`); await p.fill('#lead-name', 'Ираклий');
  const other = await p.context().newPage(); await other.goto('about:blank'); await other.bringToFront(); await p.waitForTimeout(150);
  ok('resume', await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('ipr-draft')).name === 'Ираклий'; } catch (e) { return false; } }), 'draft saved when the user switches to another app');
  await p.bringToFront(); await p.waitForTimeout(150);
  ok('resume', await p.evaluate(() => document.visibilityState === 'visible' && document.getElementById('lead-name').value === 'Ираклий'), 'returning to the site: everything as left');
  ok('js', p.errs.length === 0, 'network/rotation: no JS errors', p.errs);
  await p.context().close();
});

await browser.close();
const fails = res.filter((r) => !r.pass);
console.log(JSON.stringify({ total: res.length, passed: res.length - fails.length, failed: fails.length, results: res }, null, 1));
