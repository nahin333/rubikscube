// Serve the project, install Playwright separately, then run:
// PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:8000/';
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Expose read-only test access through the intercepted HTML, not production code.
  await page.route(baseURL, async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('solve();\n})();', 'window.__labTest = { app, applyMove, toKey };\nsolve();\n})();');
    await route.fulfill({ response, body: html });
  });
  async function finished() {
    await page.waitForFunction(() => window.__labTest && !window.__labTest.app.running && window.__labTest.app.sol !== null, null, { timeout: 60000 });
    const data = await page.evaluate(() => {
      const { app, toKey } = window.__labTest;
      return { verified: toKey(app.states.at(-1)) === toKey(app.P.solved), moves: app.sol.length, status: document.getElementById('status').textContent };
    });
    assert.ok(data.verified, data.status); return data;
  }
  const t0 = Date.now();
  await page.goto(baseURL);
  console.log('Initial browser solve', await finished(), 'wallMs', Date.now() - t0);
  await page.locator('#scramble').fill("R U F2 L D B' R2 U' F D2 L2 B R' D F' U2 B2 L' D2 R F U' L2 B D'");
  await page.locator('#solveBtn').click();
  console.log('Long scramble', await finished());
  await page.waitForTimeout(450); // Delayed input reset must not erase a fast result.
  assert.ok(await page.evaluate(() => window.__labTest.app.sol !== null));
  await page.locator('#toEnd').click();
  assert.ok(await page.evaluate(() => { const { app, toKey } = window.__labTest; return toKey(app.cur) === toKey(app.P.solved); }));
  await page.locator('#toStart').click();
  await page.locator('#fwd').click();
  await page.waitForFunction(() => window.__labTest.app.pos === 1 && !window.__labTest.app.busy);
  await page.locator('#back').click();
  await page.waitForFunction(() => window.__labTest.app.pos === 0 && !window.__labTest.app.busy);
  for (const N of [2, 3]) {
    await page.locator(`[data-n="${N}"]`).click();
    for (const algo of ['bidir', 'bfs', 'astar']) {
      await page.locator(`[data-a="${algo}"]`).click();
      await page.locator('#scramble').fill('R U F');
      await page.locator('#solveBtn').click();
      const result = await finished(); assert.equal(result.moves, 3);
    }
  }
  // Cancel a deliberately expensive exact search and recover.
  await page.locator('[data-a="bfs"]').click();
  await page.locator('#scramble').fill("R U F2 L D B' R2 U' F D2");
  await page.locator('#solveBtn').click();
  await page.locator('#stopBtn').click();
  assert.match(await page.locator('#status').innerText(), /Stopped/);
  assert.equal(await page.locator('#solveBtn').isEnabled(), true);
  await page.locator('[data-a="compact"]').click();
  await page.locator('#scramble').fill('');
  await page.locator('#solveBtn').click();
  assert.equal((await finished()).moves, 0);
  await page.locator('#scramble').fill('not a move');
  await page.locator('#solveBtn').click();
  assert.equal(await page.locator('#status').evaluate(el => el.classList.contains('err')), true);

  // The photo flow uses the same worker and independent sticker replay.
  await page.locator('summary').click();
  await page.locator('#sampleBtn').click();
  await page.locator('#scanSolve').click();
  await finished();
  assert.match(await page.locator('#status').innerText(), /Scanned cube: verified/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'Mobile layout must not overflow');
  await page.screenshot({ path: '/tmp/rubiks-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);

  // Failed worker loading must unlock controls without claiming success.
  const failure = await browser.newPage();
  await failure.route('**/solver-worker.js', route => route.abort());
  await failure.goto(baseURL);
  await failure.waitForFunction(() => document.getElementById('status').textContent.includes('worker could not run'));
  assert.ok(await failure.locator('#solveBtn').isEnabled());
  assert.ok(await failure.locator('#stopBtn').isDisabled());
  const cancel = await browser.newPage();
  let firstWorker = true;
  await cancel.route('**/solver-worker.js', async route => {
    if (firstWorker) { firstWorker = false; await new Promise(resolve => setTimeout(resolve, 750)); }
    await route.continue().catch(() => {});
  });
  await cancel.goto(baseURL);
  await cancel.locator('#stopBtn').click();
  await cancel.waitForFunction(() => document.getElementById('status').textContent.includes('Stopped'));
  await cancel.locator('#solveBtn').click();
  await cancel.waitForFunction(() => document.getElementById('status').textContent.includes('Verified solution'));
  await browser.close();
  console.log('PASS: desktop/mobile, long and solved scrambles, exact modes, playback, cancellation, invalid input, sample-photo solving, and worker failure.');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
