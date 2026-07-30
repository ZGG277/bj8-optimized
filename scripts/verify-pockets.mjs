/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器、puppeteer-core 与 DEV __bj8 场景句柄
[OUTPUT]: 桌面俯视、角袋近景、中袋近景、390×844 竖屏四帧袋口视觉回归及页面错误门禁
[POS]: PocketGeometry 物理/视觉一体化的浏览器出口验收；只改调试页内世界，不写游戏数据
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md 与 README.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

async function openGame(viewport) {
  await page.setViewport(viewport);
  await page.goto(`${GAME_URL}?theme=celadon`, {
    waitUntil: 'networkidle0',
    timeout: 20000,
  });
  await page.waitForSelector('.mode-choice.practice .mode-start', {
    timeout: 20000,
  });
  await page.click('.mode-choice.practice .mode-start');
  await wait(650);
}

async function setPocketCamera({ cueX, cueZ, angle, level }) {
  return page.evaluate(({ cueX, cueZ, angle, level }) => {
    const debug = window.__bj8;
    const scene = debug?.scene?.current;
    const world = debug?.world?.current;
    const cue = world?.balls?.find(ball => ball.number === 0);
    if (!scene || !world || !cue) return false;
    cue.x = cueX;
    cue.z = cueZ;
    cue.vx = cue.vz = cue.wx = cue.wy = cue.wz = 0;
    scene.setViewLevel(level);
    scene.setCameraAzimuth(angle);
    scene.sync(world);
    scene.update(cueX, cueZ, 0, 'aiming');
    return true;
  }, { cueX, cueZ, angle, level });
}

async function waitForCameraSettled() {
  await page.waitForFunction(() => {
    const scene = window.__bj8?.scene?.current;
    const camera = scene?.camera;
    const target = scene?.targetCameraPos;
    if (!camera || !target) return false;
    return camera.position.distanceTo(target) < 0.025;
  }, { timeout: 10000 });
}

await openGame({ width: 1280, height: 800 });
const hasDebug = await page.evaluate(() => Boolean(window.__bj8?.scene?.current));
ok('开发页暴露可复现视觉场景', hasDebug);
const pocketAnatomy = await page.evaluate(() => {
  const root = window.__bj8?.scene?.current?.scene;
  const counts = {
    outerWoodFrames: 0,
    pocketCutouts: 0,
    roundedOuterCorners: 0,
    roundedCornerPockets: 0,
    pocketWraps: 0,
    mouths: 0,
    topTrims: 0,
    lips: 0,
    wells: 0,
    bottoms: 0,
  };
  root?.traverse(object => {
    if (object.name === 'table-wood-frame') {
      counts.outerWoodFrames += 1;
      counts.pocketCutouts += Number(object.userData.pocketCutoutCount ?? 0);
      counts.roundedOuterCorners += Number(
        object.userData.roundedOuterCornerCount ?? 0,
      );
      counts.roundedCornerPockets += Number(
        object.userData.roundedCornerPocketCount ?? 0,
      );
    }
    if (
      object.name.startsWith('pocket-wood-') ||
      object.name.startsWith('pocket-leather-wrap-')
    ) counts.pocketWraps += 1;
    if (object.name.startsWith('pocket-mouth-')) counts.mouths += 1;
    if (object.name.startsWith('pocket-top-trim-')) counts.topTrims += 1;
    if (object.name.startsWith('pocket-lip-')) counts.lips += 1;
    if (object.name.startsWith('pocket-well-')) counts.wells += 1;
    if (object.name.startsWith('pocket-bottom-')) counts.bottoms += 1;
  });
  return counts;
});
ok(
  '一体木框内沿切出六袋、四个角袋圆润收肩且外轮廓只有四个圆角',
  pocketAnatomy.outerWoodFrames === 1 &&
    pocketAnatomy.pocketCutouts === 6 &&
    pocketAnatomy.roundedOuterCorners === 4 &&
    pocketAnatomy.roundedCornerPockets === 4 &&
    pocketAnatomy.pocketWraps === 0 &&
    pocketAnatomy.mouths === 6 &&
    pocketAnatomy.topTrims === 6 &&
    pocketAnatomy.lips === 6 &&
    pocketAnatomy.wells === 6 &&
    pocketAnatomy.bottoms === 6,
  JSON.stringify(pocketAnatomy),
);

ok('俯视相机可定位', await setPocketCamera({
  cueX: 0,
  cueZ: 0.6,
  angle: 0,
  level: 1,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-overhead.png` });

ok('角袋近景相机可定位', await setPocketCamera({
  cueX: 0.34,
  cueZ: 0.95,
  angle: Math.PI,
  level: 0.18,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-corner-close.png` });

ok('中袋近景相机可定位', await setPocketCamera({
  cueX: 0.34,
  cueZ: 0,
  angle: Math.PI / 2,
  level: 0.18,
}));
await waitForCameraSettled();
await page.screenshot({ path: `${SHOT_DIR}/pocket-side-close.png` });

await openGame({ width: 390, height: 844, isMobile: true, hasTouch: true });
ok('竖屏俯视相机可定位', await setPocketCamera({
  cueX: 0,
  cueZ: 0.6,
  angle: 0,
  level: 1,
}));
await waitForCameraSettled();
const portrait = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')?.getBoundingClientRect();
  return {
    canvasVisible: Boolean(canvas && canvas.width > 0 && canvas.height > 0),
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});
ok('390×844 全台无横向溢出', portrait.canvasVisible && !portrait.overflow);
await page.screenshot({ path: `${SHOT_DIR}/pocket-portrait.png` });

ok('袋口视觉回归无页面脚本错误', errors.length === 0, errors[0] ?? '');
await page.close();
await browser.disconnect();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
