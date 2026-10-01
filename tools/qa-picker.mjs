// Picker checks: every floor shows one hotspot per apartment, hotspots open the right apartment, 3D/plan switch works, keyboard reachable.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:8787';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL', m); } };
const b = await chromium.launch();
for (const lang of ['ka', 'en', 'ru']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await p.goto(`${BASE}/${lang}/`, { waitUntil: 'load' });
  let total = 0;
  for (let f = 1; f <= 10; f++) {
    await p.click(`[data-floor-btn="${f}"]`);
    const n = await p.locator('.pk-apt').count(); const chips = await p.locator('.picker__list .chip-btn').count();
    ok(n === (f === 1 ? 21 : 22) && chips === n, `${lang} floor ${f}: ${n} hotspots, ${chips} chips`);
    total += n;
  }
  ok(total === 219, `${lang}: total hotspots ${total}`);
  await p.click('[data-floor-btn="3"]');
  const first = p.locator('.pk-apt').first(); const id = await first.getAttribute('data-open-apt');
  await first.click(); await p.waitForTimeout(300);
  ok((await p.evaluate(() => location.hash)) === `#apt-${id}`, `${lang}: hotspot opens #apt-${id}`);
  ok(await p.locator('[data-v3d]').isVisible(), `${lang}: 3D view shown first`);
  await p.click('[data-v3d-open]'); ok(await p.locator('[data-plan-view]').isVisible(), `${lang}: click on 3D opens plan`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // apartment without 3D (78.8 layout) opens straight on the plan
  await p.evaluate(() => document.querySelector('[data-open-apt="34"]') || null);
  await p.click('[data-floor-btn="2"]'); await p.locator('.pk-apt[data-open-apt="34"]').click(); await p.waitForTimeout(300);
  ok(await p.locator('[data-plan-view]').isVisible() && !(await p.locator('[data-v3d]').isVisible()), `${lang}: no-3D apartment opens on plan`);
  ok(await p.locator('[data-no3d]').isVisible(), `${lang}: no-3D note shown`);
  await p.keyboard.press('Escape');
  await p.click('[data-pk-back]'); ok(await p.locator('[data-pk-facade]').isVisible(), `${lang}: back to facade`);
  await p.locator('[data-floor-pick="7"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok((await p.locator('[data-pk-title]').textContent()).includes('7'), `${lang}: facade band works from keyboard`);
  ok(errs.length === 0, `${lang}: JS errors ${errs}`);
  await p.close();
}
await b.close();
console.log(`picker QA: ${pass} passed, ${fail} failed`);
