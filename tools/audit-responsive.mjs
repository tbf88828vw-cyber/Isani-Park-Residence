// Responsive / layout audit (Playwright, Chromium). Usage: node tools/audit-responsive.mjs [BASE] > report.json
// Checks every viewport width from the audit brief, portrait and landscape, mobile emulation (touch) below 1024px.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://localhost:8787';
const WIDTHS = [320, 360, 375, 390, 393, 414, 430, 768, 820, 1024, 1280, 1440, 1920, 2560];
const HEIGHT = { 320: 568, 360: 780, 375: 667, 390: 844, 393: 852, 414: 896, 430: 932, 768: 1024, 820: 1180, 1024: 1366, 1280: 800, 1440: 900, 1920: 1080, 2560: 1440 };
const LANGS = ['ka', 'en', 'ru'];
const browser = await chromium.launch();
const results = [];

async function inspect(p) {
  return p.evaluate(async () => {
    // scroll the whole page so lazy images load and IntersectionObservers fire
    const H = () => document.documentElement.scrollHeight;
    for (let y = 0; y < H(); y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 150));
    const vw = document.documentElement.clientWidth;
    const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('[hidden],dialog:not([open])'); };
    const inScroller = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
    const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const all = [...document.querySelectorAll('body *')];
    const offRight = all.filter((el) => vis(el) && !inScroller(el) && el.getBoundingClientRect().right > vw + 1).map(name);
    // clipped text: a text container that is narrower than its content while overflow hides it
    const clipped = all.filter((el) => {
      if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
      const s = getComputedStyle(el); if (!/hidden|clip/.test(s.overflow + s.overflowX) || s.textOverflow === 'ellipsis') return false;
      return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 4;
    }).map(name);
    const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab]')]
      .filter((el) => vis(el) && !el.closest('.sr-only,.skip') && !(el.tagName === 'INPUT' && /radio|checkbox/.test(el.type)))
      .map((el) => { const r = el.getBoundingClientRect(); return { el, w: r.width, h: r.height }; });
    const inlineText = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li,dd');
    const tiny = targets.filter((t) => (t.w < 24 || t.h < 24) && !inlineText(t.el)).map((t) => `${name(t.el)} ${Math.round(t.w)}x${Math.round(t.h)}`);
    const under44 = targets.filter((t) => (t.w < 44 || t.h < 44) && !inlineText(t.el)).length;
    const broken = [...document.images].filter((i) => vis(i) && i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
    const bar = document.querySelector('[data-mobile-bar]'); const barH = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
    scrollTo(0, H()); await new Promise((r) => setTimeout(r, 200));
    const fine = [...document.querySelectorAll('.site-footer__fine')].pop();
    const lastCovered = barH && fine ? fine.getBoundingClientRect().bottom > innerHeight - barH + 1 : false;
    const header = document.querySelector('.site-header'); const headerH = header ? header.getBoundingClientRect().height : 0;
    scrollTo(0, 0);
    return { overflow: document.documentElement.scrollWidth - vw, offRight: [...new Set(offRight)].slice(0, 8), clipped: [...new Set(clipped)].slice(0, 8), tiny: [...new Set(tiny)].slice(0, 12), under44, broken, barH, lastCovered, headerH: Math.round(headerH), vh: innerHeight };
  });
}

for (const lang of LANGS) for (const w of WIDTHS) for (const orient of (w < 1024 ? ['portrait', 'landscape'] : ['portrait'])) {
  const h = HEIGHT[w];
  const vp = orient === 'portrait' ? { width: w, height: h } : { width: h, height: w };
  const mobile = w < 1024;
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const p = await ctx.newPage();
  await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}/${lang}/`, { waitUntil: 'load' });
  const r = await inspect(p);
  results.push({ lang, vp: `${vp.width}x${vp.height}`, orient, ...r, errs });
  await ctx.close();
}
// 200% browser zoom on a 1280px laptop = 640 CSS px viewport; 400% = 320
for (const [w, h, label] of [[640, 400, 'zoom200@1280x800'], [320, 200, 'zoom400@1280x800']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await p.goto(`${BASE}/ru/`, { waitUntil: 'load' });
  results.push({ lang: 'ru', vp: label, orient: 'zoom', ...(await inspect(p)) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
