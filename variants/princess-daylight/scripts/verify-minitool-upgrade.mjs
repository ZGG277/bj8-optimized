/* Run inside ego-browser nodejs with the task's existing Page. Native SDK is mocked only for contract scenarios. */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.env.MINITOOL_ACCEPTANCE_DIR || 'artifacts/xhs-optimization-20261002');
const root = 'http://127.0.0.1:5218';
const oldUrl = `${root}/artifacts/xhs-optimization-20261002/baseline/`;
const candidate = `${root}/${process.env.MINITOOL_ACCEPTANCE_DIR || 'artifacts/xhs-optimization-20261002'}/preview/`;
export async function size(page, width, height) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 900, screenWidth: width, screenHeight: height });
}
export async function capture(page, name) {
  const result = await page.cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(resolve(out, name), Buffer.from(result.data, 'base64'));
}
export async function storageUpgrade(page) {
  await mkdir(out, { recursive: true });
  await size(page, 390, 844);
  await page.goto(oldUrl);
  const fixture = await page.evaluate(() => {
    const prior = Object.fromEntries(Object.entries(localStorage));
    // Synthetic historic profile in this task-owned local origin, never a real account's save.
    const profile = { version: 3, level: 61, executionLevel: 63, executionSigma: .01, confidence: .8,
      qualifiedShots: 240, difficultyBuckets: [50, 90, 100], positionAttempts: 180, positionSuccesses: 130,
      foulAttempts: 321, fouls: 9, totalPlayerShots: 321, matchesEvaluated: 42, lastMatchDelta: 1 };
    const layout = { version: 3, layouts: {} };
    for (const p of ['desktop', 'portrait', 'landscape']) {
      layout.layouts[p] = Object.fromEntries(['view', 'bulb', 'spin', 'power'].map((id, i) =>
        [id, { mode: 'docked', edge: 'right', order: i, position: [.14, .32, .42, .66][i] }]));
      layout.layouts[p].aimDial = { mode: 'free', x: .43, y: .87 };
    }
    const values = {
      'guagua-billiards:player-skill:v3': JSON.stringify(profile),
      'guagua-billiards:control-layout:v3': JSON.stringify(layout),
      'guagua-billiards:learned-controls:v1': JSON.stringify(['view-overhead', 'new-match', 'start-practice']),
      'guagua-billiards:first-match-guide:v1': 'done',
      'guagua-billiards:aim-assist:v1': 'false', 'bj8-ui-theme': 'noir',
      'guagua-billiards:upgrade-sentinel': 'retain-unknown-record',
    };
    for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v);
    return { prior, values };
  });
  await writeFile(resolve(out, 'storage-fixture.json'), JSON.stringify(fixture, null, 2));
  await page.reload();
  const old = await page.evaluate(() => ({ text: document.body.innerText, theme: document.documentElement.dataset.theme }));
  assert(old.text.includes('61')); assert.equal(old.theme, 'noir');
  await page.goto(candidate);
  const upgraded = await page.evaluate(() => ({ text: document.body.innerText, theme: document.documentElement.dataset.theme, values: Object.fromEntries(Object.entries(localStorage)) }));
  assert(upgraded.text.includes('61')); assert.equal(upgraded.theme, 'noir');
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(upgraded.values[key], value, key);
  await page.click('text="开始对局"');
  await page.waitForFunction(() => !!window.__bj8?.scene.current?.tableDetails?.root.getObjectByName('pocket-stitching-lod'));
  const runtime = await page.evaluate(() => ({ values: Object.fromEntries(Object.entries(localStorage)),
    guide: !!document.querySelector('.first-match-guide'), dial: JSON.parse(JSON.stringify(document.querySelector('[data-control-slot="aimDial"]').getBoundingClientRect())) }));
  for (const [key, value] of Object.entries(fixture.values)) assert.equal(runtime.values[key], value, key);
  assert.equal(runtime.guide, false);
  assert(Math.abs(runtime.dial.x + runtime.dial.width / 2 - 390 * .43) < 2);
  await writeFile(resolve(out, 'storage-upgrade.json'), JSON.stringify({ oldVersion: '1.7.1', keys: Object.keys(fixture.values), byteIdentical: true, level: 61, matches: 42, shots: 321, runtime }, null, 2));
  return { keysRetained: Object.keys(fixture.values).length, level: 61, matches: 42, shots: 321 };
}
export async function layoutMatrix(page) {
  const report = [];
  for (const [width, height] of [[390, 844], [844, 390], [1280, 800]]) {
    await size(page, width, height);
    await page.click('button[aria-label="展开视角调整"]');
    await page.click('button[aria-label="切换俯视视角"]');
    await page.click('button[aria-label="展开视角调整"]');
    await page.waitForFunction(() => { const s = window.__bj8.scene.current; return s.camera.position.distanceTo(s.targetCameraPos) < .015; }, undefined, { timeout: 20000 });
    const state = await page.evaluate(() => {
      const s = window.__bj8.scene.current;
      const rect = document.querySelector('.viewport').getBoundingClientRect();
      const bounds = JSON.parse(JSON.stringify(rect));
      const controls = [...document.querySelectorAll('[data-control-slot], .scoreboard')].map(e => ({ id: e.dataset.controlSlot, rect: JSON.parse(JSON.stringify(e.getBoundingClientRect())) }));
      return { width: innerWidth, height: innerHeight, bounds, controls,
        corners: [[-.76,-1.4],[.76,-1.4],[-.76,1.4],[.76,1.4]].map(([x,z]) => s.tableToScreen(x,z)),
        pockets: [[-.635,-1.27],[.635,-1.27],[-.635,0],[.635,0],[-.635,1.27],[.635,1.27]].map(([x,z])=>s.tableToScreen(x,z)),
        render: s.renderer.info.render, stitchingVisible: s.tableDetails.root.getObjectByName('BJ8_Stitching').visible,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        external: performance.getEntriesByType('resource').map(e=>e.name).filter(url => !url.startsWith(location.origin) && !url.startsWith('data:') && !url.startsWith('blob:')) };
    });
    assert.equal(state.width, width); assert.equal(state.horizontalOverflow, false);
    assert.equal(state.external.length, 0); // 放大后近景可触发针脚 LOD；可见性随相机距离决定。
    for (const point of state.corners) {
      assert(point.x >= state.bounds.left - 1 && point.x <= state.bounds.right + 1);
      assert(point.y >= state.bounds.top - 1 && point.y <= state.bounds.bottom + 1);
    }
    for (const p of state.pockets) for (const { rect } of state.controls.filter(c => !c.id)) {
      assert(!(p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom), 'pocket obscured');
    }
    await capture(page, `candidate-${width}x${height}.png`);
    report.push(state);
  }
  await size(page, 390, 844);
  const before = await page.evaluate(() => document.querySelector('.aim-dial').classList.contains('fine'));
  await page.click('.aim-dial');
  assert.notEqual(await page.evaluate(() => document.querySelector('.aim-dial').classList.contains('fine')), before);
  await writeFile(resolve(out, 'layout-matrix.json'), JSON.stringify(report, null, 2));
  return { viewports: report.map(r=>[r.width,r.height]), tableInsideViewport: true, scoreboardClear: true, dialInteractive: true };
}
export async function shareScenarios(page) {
  await size(page, 390, 844);
  await page.evaluate(() => { window.__bj8.setMatch({ phase: 'finished', winner: 'opponent' }); });
  await page.waitForSelector('.finish-mask');
  assert.equal(await page.evaluate(() => !!document.querySelector('.victory-share')), false);
  await page.evaluate(() => { window.__bj8.setMatch({ phase: 'finished', winner: 'player' }); });
  await page.waitForSelector('.victory-celebration');
  await page.waitForFunction(() => !document.querySelector('.victory-celebration'));
  await page.waitForSelector('.victory-share img');
  const image = await page.evaluate(() => document.querySelector('.victory-share img').src);
  assert(image.startsWith('data:image/jpeg;base64,'));
  await writeFile(resolve(out, 'victory-card.jpg'), Buffer.from(image.split(',')[1], 'base64'));
  await page.click('text="分享到小红书笔记"');
  assert((await page.evaluate(()=>document.querySelector('.victory-share').textContent)).includes('请在小红书内打开'));
  await page.evaluate(() => {
    window.__shareCalls = [];
    window.xhs = { miniTool: { postNote(draft) { window.__shareCalls.push(draft); return new Promise((resolve, reject) => { window.__resolveShare = resolve; window.__rejectShare = reject; }); } } };
  });
  await page.click('text="分享到小红书笔记"');
  const pending = await page.evaluate(() => { document.querySelector('.share-primary').click(); return { calls: window.__shareCalls.length, disabled: document.querySelector('.share-primary').disabled }; });
  assert.equal(pending.calls, 1); assert.equal(pending.disabled, true);
  await page.evaluate(() => window.__rejectShare({ errMsg: 'postNote:fail cancel' }));
  await page.waitForFunction(() => document.querySelector('.victory-share').textContent.includes('已取消'));
  await page.click('text="分享到小红书笔记"');
  await page.evaluate(() => window.__rejectShare({ errMsg: 'postNote:fail unavailable' }));
  await page.waitForFunction(() => document.querySelector('.victory-share').textContent.includes('请重试'));
  await page.click('text="分享到小红书笔记"');
  const draft = await page.evaluate(() => { window.__resolveShare({ errMsg: 'postNote:ok' }); return window.__shareCalls.at(-1); });
  assert(draft.title.length <= 20 && draft.content.length <= 1000);
  assert.equal(draft.mediaInfo.image_resources[0].url, image);
  await page.waitForFunction(() => document.querySelector('.victory-share').textContent.includes('笔记状态请在小红书中查看'));
  await capture(page, 'victory-share-390.png');
  await page.click('text="再来一局"');
  await page.waitForFunction(() => !document.querySelector('.finish-mask'));
  const report = { syntheticWinFixture: true, nativeSdkMocked: true, cardBytes: Buffer.from(image.split(',')[1], 'base64').length,
    checks: ['loss hides share','local preview','missing SDK','repeat click blocked','cancel','failure retry','success not moderation claim','replay'] };
  await writeFile(resolve(out, 'share-scenarios.json'), JSON.stringify(report, null, 2));
  return report;
}
