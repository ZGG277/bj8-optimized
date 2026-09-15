/*
[INPUT]: VITE_BJ8_ACCEPTANCE=1 的本地整合版本、Chrome 与正式入口尺寸
[OUTPUT]: 湖面开场交接、三世界、目标圈、角袋外壳和实际出杆的组合验收记录
[POS]: v1.7.5 发布前浏览器门禁；只操作本地页面，不连接生产服务
*/
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.GAME_URL || 'http://127.0.0.1:5228/';
const outRoot = resolve(process.env.RELEASE_ACCEPTANCE_OUT || 'shots/release-v1.7.5/prepublish');
const viewports = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 },
];
const entries = [
  { name: 'lake', search: '', autoOpening: true },
  { name: 'studio', search: '?world=studio', autoOpening: false },
  { name: 'cloud-sea', search: '?world=cloud-sea', autoOpening: false },
];

await mkdir(outRoot, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const report = { baseUrl, browser: await browser.version(), checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail });
  assert(pass, `${name}: ${JSON.stringify(detail)}`);
};

try {
  for (const viewport of viewports) {
    for (const entry of entries) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.setViewport(viewport);
      await page.goto(new URL(entry.search, baseUrl).href, { waitUntil: 'networkidle0' });
      if (entry.autoOpening) {
        await page.waitForSelector('.viewport canvas');
        await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'done', { timeout: 30_000 });
      } else {
        await page.click('.start-btn');
        await page.waitForSelector('.viewport canvas');
      }
      await page.waitForFunction(() => window.__bj8?.scene?.current?.studioEnvironment?.root?.userData?.assetState === 'ready');
      await page.waitForFunction(() => window.__bj8?.scene?.current?.tableDetails?.root?.userData?.assetState === 'ready');

      const state = await page.evaluate(() => {
        const scene = window.__bj8.scene.current;
        const opening = scene.openingDemoSnapshot();
        const apron = scene.scene.getObjectByName('BJ8_CornerPocketOuterAprons');
        return {
          phase: window.__bj8.match.current.phase,
          worldId: scene.studioEnvironment.root.userData.worldId,
          canvasCount: document.querySelectorAll('.viewport canvas').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          opening,
          legalTargets: scene.legalTargetCount(),
          visibleRings: scene.targetRings.filter(ring => ring.visible).length,
          apron: apron ? {
            visible: apron.visible,
            visualOnly: apron.userData.visual_only,
            collisionGeometry: apron.userData.collision_geometry,
            cornerCount: apron.userData.corner_count,
          } : null,
        };
      });
      check(`${viewport.name}/${entry.name} 进入正确世界`, state.worldId === entry.name, state);
      check(`${viewport.name}/${entry.name} 单画布且无横向溢出`, state.canvasCount === 1 && !state.overflow, state);
      check(`${viewport.name}/${entry.name} 四角外壳保持纯视觉`,
        state.apron?.visible === true && state.apron.visualOnly === true &&
          state.apron.collisionGeometry === false && state.apron.cornerCount === 4,
        state.apron);
      check(`${viewport.name}/${entry.name} 紧密开球目标圈不叠画`,
        state.legalTargets >= 14 && state.visibleRings === 0,
        { legalTargets: state.legalTargets, visibleRings: state.visibleRings });
      if (entry.autoOpening) {
        const cameraDelta = Math.max(...state.opening.camera.map((value, index) =>
          Math.abs(value - state.opening.handoffCamera[index])));
        const lookDelta = Math.max(...state.opening.lookAt.map((value, index) =>
          Math.abs(value - state.opening.handoffLookAt[index])));
        check(`${viewport.name} 无参数湖面开场精确交接`,
          state.opening.active === false && cameraDelta < 1e-7 && lookDelta < 1e-7,
          { opening: state.opening, cameraDelta, lookDelta });
      }
      const single = await page.evaluate(() => {
        const scene = window.__bj8.scene.current;
        scene.setLegalTargets([1]);
        scene.sync(window.__bj8.world.current);
        return scene.targetRings.map((ring, number) => ({ number, visible: ring.visible }))
          .filter(item => item.visible);
      });
      check(`${viewport.name}/${entry.name} 分开单球目标提示保留`,
        single.length === 1 && single[0].number === 1, single);
      check(`${viewport.name}/${entry.name} 页面无脚本错误`, errors.length === 0, errors);

      if (entry.autoOpening) {
        await page.screenshot({ path: resolve(outRoot, `${viewport.name}-lake-after-opening.png`) });
        await page.focus('.shoot-pad');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__bj8.match.current.phase !== 'aiming', { timeout: 10_000 });
        const phaseAfterShot = await page.evaluate(() => window.__bj8.match.current.phase);
        check(`${viewport.name} 开场后真实轻杆可提交`,
          ['rolling', 'opponent', 'placing'].includes(phaseAfterShot), phaseAfterShot);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(outRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
}

console.log(JSON.stringify({
  passed: report.checks.every(item => item.pass),
  checks: report.checks.length,
  outRoot,
}, null, 2));
