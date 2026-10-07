// Lab performance audit (Playwright + Chrome DevTools Protocol), Lighthouse-like throttling.
// Mobile: 390x844, 4x CPU slowdown, ~1.6 Mbps / 150 ms RTT. Desktop: no throttling.
// Usage: node tools/audit-perf.mjs [BASE] [runs]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import zlib from 'node:zlib';

const BASE = process.argv[2] || 'http://localhost:8787';
const RUNS = +(process.argv[3] || 3);
const browser = await chromium.launch();
const out = {};

async function measure(lang, mode) {
  const mobile = mode === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1350, height: 940 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  const p = await ctx.newPage();
  await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (mobile) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0 }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  await p.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0, lt: 0, lcpEl: '' };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = (e.element && (e.element.tagName + '.' + e.element.className)) || e.url; } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  await p.goto(`${BASE}/${lang}/`, { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(mobile ? 6000 : 2500);
  const m = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { ...window.__m, ttfb: n.responseStart, fcp: fcp ? fcp.startTime : 0, dcl: n.domContentLoadedEventEnd }; });
  // interaction latency proxy (INP-like): open the first apartment and measure next paint
  const inp = await p.evaluate(() => new Promise((res) => { const b = document.querySelector('[data-apt-list] > li:not([hidden]) [data-open-apt]'); const t = performance.now(); b.click(); requestAnimationFrame(() => setTimeout(() => res(performance.now() - t), 0)); }));
  const list = [...reqs.values()];
  const by = {}; for (const r of list) { by[r.type] = (by[r.type] || 0) + r.bytes; }
  await ctx.close();
  return { loadMs, ttfb: Math.round(m.ttfb), fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), lcpEl: m.lcpEl, cls: +m.cls.toFixed(3), tbt: Math.round(m.lt), inpProxy: Math.round(inp), requests: list.length, kb: Math.round(list.reduce((s, r) => s + r.bytes, 0) / 1024), byTypeKb: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)])) };
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const lang of ['ka', 'ru']) for (const mode of ['mobile', 'desktop']) {
  const runs = []; for (let i = 0; i < RUNS; i++) runs.push(await measure(lang, mode));
  const pick = (k) => median(runs.map((r) => r[k]));
  out[`${lang}/${mode}`] = { ttfb: pick('ttfb'), fcp: pick('fcp'), lcp: pick('lcp'), cls: pick('cls'), tbt: pick('tbt'), inpProxy: pick('inpProxy'), requests: pick('requests'), kb: pick('kb'), byTypeKb: runs[0].byTypeKb, lcpEl: runs[0].lcpEl };
}
// raw HTML size and gzip estimate (Vercel serves compressed)
const html = await (await fetch(`${BASE}/ru/`)).text();
out.html = { rawKb: Math.round(Buffer.byteLength(html) / 1024), gzipKb: Math.round(zlib.gzipSync(html).length / 1024), brotliKb: Math.round(zlib.brotliCompressSync(html).length / 1024) };
await browser.close();
console.log(JSON.stringify(out, null, 1));
