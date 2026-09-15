/*
[INPUT]: 已启动的本地候选、Chrome 与正式桌面/手机视口
[OUTPUT]: 云海局前触发、天空覆盖、相机交接、再来一局不复播及湖面回归的验收记录与代表图
[POS]: 云海开场候选的本地真实入口门禁；不连接生产服务
*/
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.GAME_URL || 'http://127.0.0.1:5230/';
const outRoot = resolve(process.env.ACCEPTANCE_OUT || 'shots/cloud-opening-20260915');
const expectedFirstPersonHeight = 0.20;
const viewports = [
  { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));

async function introState(page) {
  return page.evaluate(() => ({
    intro: Boolean(document.querySelector('.intro-backdrop')),
    selected: document.querySelector('.world-choice input:checked')?.value ?? null,
    canvasCount: document.querySelectorAll('.viewport canvas').length,
    opening: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setViewport(viewport);

    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    const initial = await introState(page);
    check(`${viewport.name} 无参数入口保留场景选择`,
      initial.intro && initial.selected === 'studio' && initial.canvasCount === 0 && initial.opening === null,
      initial);

    await page.goto(new URL('?world=cloud-sea', baseUrl).href, { waitUntil: 'networkidle0' });
    const cloudIntro = await introState(page);
    check(`${viewport.name} 云海参数只预选且不自动开场`,
      cloudIntro.intro && cloudIntro.selected === 'cloud-sea' &&
        cloudIntro.canvasCount === 0 && cloudIntro.opening === null,
      cloudIntro);

    await page.click('.mode-choice.practice .mode-start');
    await page.waitForSelector('.viewport canvas');
    await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'playing', {
      timeout: 20_000,
    });
    await pause(120);
    await page.screenshot({ path: resolve(outRoot, `${viewport.name}-cloud-opening-first.png`) });
    const first = await page.evaluate(() => {
      const scene = window.__bj8.scene.current;
      return {
        worldId: scene.studioEnvironment.root.userData.worldId,
        cameraFar: scene.camera.far,
        sky: Boolean(scene.scene.getObjectByName('cloud-sea-sky')),
        clouds: Boolean(scene.studioEnvironment.worldShell.root.userData.volume),
        caption: document.querySelector('.opening-demo-caption span')?.textContent ?? null,
        opening: scene.openingDemoSnapshot(),
      };
    });
    check(`${viewport.name} 云海首帧使用完整天空与云层`,
      first.worldId === 'cloud-sea' && first.cameraFar === 120 && first.sky && first.clouds &&
        first.caption === '穿过云海' && first.opening.active,
      first);

    await pause(2200);
    await page.screenshot({ path: resolve(outRoot, `${viewport.name}-cloud-opening-transition.png`) });
    await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'done', {
      timeout: 12_000,
    });
    const done = await page.evaluate(() => {
      const scene = window.__bj8.scene.current;
      const opening = scene.openingDemoSnapshot();
      return {
        phase: window.__bj8.match.current.phase,
        opening,
        overflow: document.documentElement.scrollWidth > innerWidth,
        canvasCount: document.querySelectorAll('.viewport canvas').length,
      };
    });
    const cameraDelta = Math.max(...done.opening.camera.map((value, index) =>
      Math.abs(value - done.opening.handoffCamera[index])));
    const lookDelta = Math.max(...done.opening.lookAt.map((value, index) =>
      Math.abs(value - done.opening.handoffLookAt[index])));
    check(`${viewport.name} 云海开场完成并精确交接`,
      !done.opening.active && cameraDelta < 1e-7 && lookDelta < 1e-7 &&
        Math.abs(done.opening.camera[1] - expectedFirstPersonHeight) < 1e-7 &&
        done.canvasCount === 1 && !done.overflow,
      { ...done, cameraDelta, lookDelta });
    await page.screenshot({ path: resolve(outRoot, `${viewport.name}-cloud-first-person.png`) });

    await page.focus('.shoot-pad');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__bj8.match.current.phase === 'rolling', { timeout: 4_000 });
    const shot = await page.evaluate(() => ({
      phase: window.__bj8.match.current.phase,
      moving: window.__bj8.world.current.moving,
      openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
    }));
    check(`${viewport.name} 云海交接后可真实出杆`,
      shot.phase === 'rolling' && shot.moving && shot.openingStatus === 'done',
      shot);

    await page.evaluate(() => window.__bj8.setMatch({ phase: 'finished', winner: 'player' }));
    await page.waitForSelector('[data-control-tip="new-match"]');
    await page.click('[data-control-tip="new-match"]');
    await pause(350);
    const nextMatch = await page.evaluate(() => ({
      phase: window.__bj8.match.current.phase,
      openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
      active: window.__bj8.scene.current.openingDemoSnapshot().active,
    }));
    check(`${viewport.name} 云海再来一局不复播`,
      nextMatch.phase !== 'intro' && nextMatch.openingStatus === 'done' && !nextMatch.active,
      nextMatch);

    await page.click('.opening-demo-ui.done button');
    await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'playing');
    const replay = await page.evaluate(() => ({
      phase: window.__bj8.match.current.phase,
      caption: document.querySelector('.opening-demo-caption span')?.textContent ?? null,
      active: window.__bj8.scene.current.openingDemoSnapshot().active,
    }));
    check(`${viewport.name} 重播按钮只重播云海相机`,
      replay.phase !== 'intro' && replay.caption === '穿过云海' && replay.active,
      replay);
    check(`${viewport.name} 云海流程无脚本错误`, errors.length === 0, errors);
    await page.close();

    const lake = await browser.newPage();
    const lakeErrors = [];
    lake.on('pageerror', error => lakeErrors.push(String(error)));
    await lake.setViewport(viewport);
    await lake.goto(new URL('?world=lake', baseUrl).href, { waitUntil: 'networkidle0' });
    const lakeIntro = await introState(lake);
    check(`${viewport.name} 湖面仍只预选不自动开场`,
      lakeIntro.intro && lakeIntro.selected === 'lake' && lakeIntro.canvasCount === 0,
      lakeIntro);
    await lake.click('.mode-choice.practice .mode-start');
    await lake.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'playing', {
      timeout: 20_000,
    });
    const lakeState = await lake.evaluate(() => ({
      worldId: window.__bj8.scene.current.studioEnvironment.root.userData.worldId,
      cameraFar: window.__bj8.scene.current.camera.far,
      caption: document.querySelector('.opening-demo-caption span')?.textContent ?? null,
    }));
    check(`${viewport.name} 已认可湖面开场保持`,
      lakeState.worldId === 'lake' && lakeState.cameraFar === 2000 && lakeState.caption === '向湖心靠近',
      lakeState);
    await lake.waitForFunction(() => document.querySelector('.game-shell')?.dataset.openingDemo === 'done', {
      timeout: 12_000,
    });
    const lakeDone = await lake.evaluate(() => window.__bj8.scene.current.openingDemoSnapshot());
    const lakeCameraDelta = Math.max(...lakeDone.camera.map((value, index) =>
      Math.abs(value - lakeDone.handoffCamera[index])));
    const lakeLookDelta = Math.max(...lakeDone.lookAt.map((value, index) =>
      Math.abs(value - lakeDone.handoffLookAt[index])));
    check(`${viewport.name} 湖面交接同步抬高且连续`,
      !lakeDone.active && lakeCameraDelta < 1e-7 && lakeLookDelta < 1e-7 &&
        Math.abs(lakeDone.camera[1] - expectedFirstPersonHeight) < 1e-7,
      { ...lakeDone, lakeCameraDelta, lakeLookDelta });
    check(`${viewport.name} 湖面回归无脚本错误`, lakeErrors.length === 0, lakeErrors);
    await lake.close();

    const studio = await browser.newPage();
    const studioErrors = [];
    studio.on('pageerror', error => studioErrors.push(String(error)));
    await studio.setViewport(viewport);
    await studio.goto(new URL('?world=studio', baseUrl).href, { waitUntil: 'networkidle0' });
    await studio.click('.mode-choice.practice .mode-start');
    await studio.waitForSelector('.viewport canvas');
    const studioState = await studio.evaluate(() => ({
      worldId: window.__bj8.scene.current.studioEnvironment.root.userData.worldId,
      opening: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
      canvasCount: document.querySelectorAll('.viewport canvas').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    check(`${viewport.name} 摄影棚开始时不开场`,
      studioState.worldId === 'studio' && studioState.opening === null &&
        studioState.canvasCount === 1 && !studioState.overflow,
      studioState);
    check(`${viewport.name} 摄影棚流程无脚本错误`, studioErrors.length === 0, studioErrors);
    await studio.close();
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
process.exit(0);
