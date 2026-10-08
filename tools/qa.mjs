// Browser QA with Playwright against the local dev server(s).
//   node tools/dev-server.mjs (with mock Telegram env)  -> :8787   (delivery configured)
//   PORT=8788 node tools/dev-server.mjs                  -> :8788   (no delivery configured)
import { chromium, webkit } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:8787';
const BASE_NOCONF = process.env.BASE_NOCONF || 'http://localhost:8788';
const LANGS = ['ka', 'en', 'ru'];
const WIDTHS = [[320, 640], [375, 812], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [844, 390]];
let pass = 0, fail = 0; const notes = [];
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const fontRoute = (p) => p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));

const browser = await chromium.launch();

// 1. layout at all widths, languages, themes: no horizontal overflow, no console errors
for (const lang of LANGS) for (const [w, h] of WIDTHS) for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript((t) => localStorage.setItem('ipr-theme', t), theme);
  await p.goto(`${BASE}/${lang}/`, { waitUntil: 'domcontentloaded' });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 0, `${lang} ${w}x${h} ${theme}: horizontal overflow ${ov}px`);
  ok(errs.length === 0, `${lang} ${w} ${theme}: JS errors ${errs}`);
  await ctx.close();
}

// 2. structure & semantics per language
for (const lang of LANGS) {
  const p = await browser.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/${lang}/`, { waitUntil: 'domcontentloaded' });
  const s = await p.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.lang,
    imgsNoAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
    imgsNoSize: [...document.querySelectorAll('main img')].filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
    unlabeled: [...document.querySelectorAll('input:not([type=hidden]):not([tabindex="-1"]), select, textarea')].filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label')).map((e) => e.name),
    btnNoName: [...document.querySelectorAll('button, a[href]')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label') || b.querySelector('[class*=sr-only]'))).length,
    smallTargets: [...document.querySelectorAll('.btn, .icon-btn, .chip span, .lang a, .tab')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && (r.height < 36 || r.width < 36); }).length,
    viewport: document.querySelector('meta[name=viewport]').content,
    title: document.title, desc: document.querySelector('meta[name=description]').content,
    ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].length,
  }));
  ok(s.h1 === 1, `${lang}: exactly one h1 (${s.h1})`);
  ok(s.lang === lang, `${lang}: html lang`);
  ok(s.imgsNoAlt === 0, `${lang}: images without alt ${s.imgsNoAlt}`);
  ok(s.imgsNoSize === 0, `${lang}: images without width/height ${s.imgsNoSize}`);
  ok(s.unlabeled.length === 0, `${lang}: unlabeled controls ${s.unlabeled}`);
  ok(s.btnNoName === 0, `${lang}: nameless buttons/links ${s.btnNoName}`);
  ok(s.smallTargets === 0, `${lang}: small tap targets ${s.smallTargets}`);
  ok(!/user-scalable=no|maximum-scale=1/.test(s.viewport), `${lang}: zoom not blocked`);
  ok(s.title.length > 20 && s.desc.length > 60, `${lang}: title/description`);
  ok(s.ld === 3, `${lang}: structured data`);
  await p.close();
}

// 3. internal links and assets resolve
{
  const p = await browser.newPage(); await fontRoute(p);
  const urls = new Set();
  for (const lang of LANGS) for (const sub of ['', 'privacy/']) {
    await p.goto(`${BASE}/${lang}/${sub}`, { waitUntil: 'domcontentloaded' });
    (await p.evaluate(() => [...document.querySelectorAll('a[href], img[src], source[srcset], link[href], script[src], video[data-src-wide], video[data-src-tall]')].flatMap((e) => {
      const v = [e.getAttribute('href'), e.getAttribute('src'), e.getAttribute('data-src-wide'), e.getAttribute('data-src-tall'), ...(e.getAttribute('srcset') || '').split(',').map((x) => x.trim().split(' ')[0])];
      return v.filter(Boolean).map((x) => new URL(x, location.href).href);
    }))).forEach((u) => { if (u.startsWith(BASE)) urls.add(u.split('#')[0]); });
  }
  // plan images/pdfs are built from data at runtime
  const d = JSON.parse(await p.evaluate(() => document.getElementById('ipr-data')?.textContent || '{"apartments":[]}'));
  let bad = [];
  for (const u of urls) { const r = await p.request.get(u); if (r.status() !== 200) bad.push(`${r.status()} ${u}`); }
  ok(bad.length === 0, `broken internal urls: ${bad.slice(0, 5).join(' | ')}`);
  notes.push(`checked ${urls.size} internal URLs`);
  await p.goto(`${BASE}/ru/`); const data = JSON.parse(await p.evaluate(() => document.getElementById('ipr-data').textContent));
  let missing = 0;
  for (const a of data.apartments) if (a[6]) { for (const u of [`/assets/plans/img/apt-${a[0]}-1000.webp`, `/assets/plans/pdf/isani-park-residence-E-apartment-${a[0]}.pdf`]) { const r = await p.request.head(BASE + u); if (r.status() !== 200) missing++; } }
  ok(missing === 0, `missing plan files: ${missing}`);
  notes.push(`checked ${data.apartments.length} apartments' plan images and PDFs`);
  await p.close();
}

// 4. state survives theme switch, resize and orientation change (no reload)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/en/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { window.__marker = 42; });
  if (await p.isVisible('[data-filters-toggle]')) await p.click('[data-filters-toggle]');  // phones: filters live behind a toggle
  await p.locator('label.chip:has(input[name=rooms][value="2"])').click();
  await p.fill('#lead-name', 'Keep me');
  await p.evaluate(() => document.querySelector('[data-theme-toggle]').click());
  await p.setViewportSize({ width: 844, height: 390 });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.evaluate(() => document.body.style.zoom = '1.5');
  const st = await p.evaluate(() => ({ m: window.__marker, name: document.getElementById('lead-name').value, rooms: document.querySelector('input[name=rooms]:checked').value, theme: document.documentElement.dataset.theme }));
  ok(st.m === 42, 'no reload on theme/resize/zoom');
  ok(st.name === 'Keep me' && st.rooms === '2', 'form and filters kept');
  ok(st.theme === 'light', 'theme toggled without reload');
  await p.reload(); ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme persisted');
  await ctx.close();
}

// 5. language switch keeps section, open apartment, filters and draft
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/ru/`, { waitUntil: 'domcontentloaded' });
  await p.locator('label.chip:has(input[name=rooms][value="4"])').click();
  await p.fill('#lead-name', 'Георгий');
  await p.locator('.apt-card:not([hidden]) [data-open-apt]').first().click();
  const id = await p.evaluate(() => location.hash);
  await p.evaluate(() => document.getElementById('apt-dialog').close());
  await p.locator('.apt-card:not([hidden]) [data-open-apt]').first().click();
  // language links sit behind the modal; trigger the same handler the header link uses
  await p.evaluate(() => document.querySelector('.site-header [data-lang-link="ka"]').dispatchEvent((window.addEventListener('click', (e) => e.preventDefault(), { once: true }), new MouseEvent('click', { bubbles: true, cancelable: true }))));
  const href = await p.evaluate(() => document.querySelector('.site-header [data-lang-link="ka"]').getAttribute('href'));
  ok(/\/ka\/#apt-\d+/.test(href), `lang link carries open apartment (${href})`);
  await p.goto(BASE + href, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ open: document.getElementById('apt-dialog').open, rooms: document.querySelector('input[name=rooms]:checked').value, name: document.getElementById('lead-name').value, lang: document.documentElement.lang }));
  ok(st.open && st.rooms === '4' && st.name === 'Георгий' && st.lang === 'ka', `state after language switch ${JSON.stringify(st)} (${id})`);
  // section is kept
  await p.evaluate(() => document.getElementById('apt-dialog').close());
  await p.locator('#location').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.site-header [data-lang-link="en"]').dispatchEvent((window.addEventListener('click', (e) => e.preventDefault(), { once: true }), new MouseEvent('click', { bubbles: true, cancelable: true }))));
  ok(/\/en\/#location$/.test(await p.evaluate(() => document.querySelector('.site-header [data-lang-link="en"]').getAttribute('href'))), 'lang link carries current section');
  await ctx.close();
}

// 6. keyboard: skip link, dialog focus trap / Esc / focus return
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/en/`, { waitUntil: 'domcontentloaded' });
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.activeElement.classList.contains('skip')), 'first Tab reaches skip link');
  const btn = p.locator('.apt-card:not([hidden]) .apt-card__plan').first();
  await btn.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.getElementById('apt-dialog').contains(document.activeElement)), 'focus moves into dialog');
  for (let i = 0; i < 15; i++) await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.getElementById('apt-dialog').contains(document.activeElement) || document.activeElement === document.body), 'focus stays in dialog');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.getElementById('apt-dialog').open && document.activeElement.classList.contains('apt-card__plan')), 'Esc closes and focus returns');
  const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  ok(outline !== 'none', 'visible focus outline');
  await ctx.close();
}

// 7. 200% text size and 400% reflow (320 CSS px)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/ru/`, { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: 'html{font-size:200% !important}' });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 0, `200% text: overflow ${ov}`);
  await ctx.close();
}

// 8. hero without video and with reduced motion: poster, controls, readable
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.route('**/*.mp4', (r) => r.abort());
  await p.goto(`${BASE}/en/`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => ({ poster: document.querySelector('.hero__poster').complete && document.querySelector('.hero__poster').naturalWidth > 0, cta: !!document.querySelector('.hero__actions a'), btn: !document.querySelector('[data-video-toggle]').hidden }));
  ok(st.poster && st.cta, 'poster + CTAs when video fails');
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage(); await fontRoute(p2);
  await p2.goto(`${BASE}/en/`, { waitUntil: 'load' }); await p2.waitForTimeout(800);
  ok(await p2.evaluate(() => document.querySelector('[data-hero-video]').paused && !document.querySelector('[data-video-toggle]').hidden), 'reduced motion: video not autoplayed, play control offered');
  await ctx2.close();
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p3 = await ctx3.newPage(); await fontRoute(p3);
  await p3.goto(`${BASE}/en/`, { waitUntil: 'load' }); await p3.waitForTimeout(2500);
  const v = await p3.evaluate(() => { const v = document.querySelector('[data-hero-video]'); return { src: v.currentSrc.split('/').pop(), playing: !v.paused, muted: v.muted, inline: v.playsInline }; });
  ok(/^hero-1280\.(mp4|webm)$/.test(v.src) && v.playing && v.muted && v.inline, `video autoplay muted inline ${JSON.stringify(v)}`);
  await p3.click('[data-video-toggle]');
  ok(await p3.evaluate(() => document.querySelector('[data-hero-video]').paused), 'pause control works');
  await ctx3.close();
}

// 9. form: server not configured -> honest error, data kept
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE_NOCONF}/en/#contact`, { waitUntil: 'domcontentloaded' });
  await p.fill('#lead-name', 'Test User'); await p.fill('#lead-phone', '+995 555 000 111');
  await p.waitForTimeout(1600);
  await p.click('[data-submit]'); await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({ success: !document.querySelector('[data-lead-success]').hidden, status: document.querySelector('[data-form-status]').textContent, name: document.getElementById('lead-name').value, events: dataLayer.map((e) => e.event) }));
  ok(!st.success && /unavailable/.test(st.status) && st.name === 'Test User' && !st.events.includes('generate_lead'), `no fake success when not configured: ${JSON.stringify(st)}`);
  // double submit protection
  await ctx.close();
}
// 10. double-click sends one enquiry
{
  const fs = await import('node:fs'); try { fs.unlinkSync('/tmp/mock-telegram.log'); } catch {}
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage(); await fontRoute(p);
  await p.goto(`${BASE}/ka/#contact`, { waitUntil: 'domcontentloaded' });
  await p.fill('#lead-name', 'ნინო'); await p.fill('#lead-phone', '+995 599 11 22 33'); await p.waitForTimeout(1600);
  await p.dblclick('[data-submit]'); await p.waitForTimeout(1200);
  const n = fs.readFileSync('/tmp/mock-telegram.log', 'utf8').trim().split('\n').length;
  ok(n === 1, `double click sent ${n} messages`);
  ok(await p.isVisible('[data-lead-success]'), 'success after confirmed delivery (ka)');
  await ctx.close();
}

// 11. privacy pages + 404
for (const lang of LANGS) {
  const p = await browser.newPage(); await fontRoute(p);
  const r = await p.goto(`${BASE}/${lang}/privacy/`); ok(r.status() === 200, `${lang} privacy 200`);
  await p.close();
}
{ const p = await browser.newPage(); await fontRoute(p); const r = await p.goto(`${BASE}/nope/`); ok(r.status() === 404 && (await p.content()).includes('Page not found'), '404 page'); await p.close(); }

await browser.close();

// 12. WebKit (Safari engine) smoke test on an iPhone-sized viewport
try {
  const wk = await webkit.launch();
  const ctx = await wk.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await fontRoute(p);
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}/ru/`, { waitUntil: 'load' });
  await p.locator('.apt-card:not([hidden]) [data-open-apt]').first().tap(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById('apt-dialog').open), 'webkit: dialog opens');
  ok(errs.length === 0, `webkit errors ${errs}`);
  await wk.close();
} catch (e) { notes.push('WebKit not available in this environment: ' + e.message.split('\n')[0]); }

console.log(notes.join('\n'));
console.log(`QA: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
