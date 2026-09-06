/*
[INPUT]: 依赖已启动的本地游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 390×844 触摸控件就地说明、长按默认行为防护及击球近景→全台时序断言
[POS]: 本轮手机控件可发现性与击球后视角的真实浏览器验收门禁
[PROTOCOL]: 说明入口、长按防护或近景时序变更时同步更新本脚本与 scripts/CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH || '/tmp/bj8-mobile-control-tip.png';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });

const center = selector => page.$eval(selector, element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
const tap = async selector => {
  const point = await center(selector);
  await page.touchscreen.tap(point.x, point.y);
  await wait(100);
};

await tap('.start-btn');
await page.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });

const aimPoint = await center('.aim-dial');
const precisionBefore = await page.$eval('.aim-dial', element => element.getAttribute('aria-valuenow'));
await page.touchscreen.touchStart(aimPoint.x, aimPoint.y);
await wait(120);
const touchTip = await page.$eval('.control-onboarding-tip[data-tip-for="aim-dial"]', element => {
  const tipRect = element.getBoundingClientRect();
  const anchorRect = document.querySelector('.aim-dial').getBoundingClientRect();
  return {
    text: element.textContent ?? '',
    insideViewport: tipRect.left >= 0 && tipRect.right <= innerWidth && tipRect.top >= 0 && tipRect.bottom <= innerHeight,
    besideAnchor: tipRect.right <= anchorRect.left || tipRect.bottom <= anchorRect.top,
    pointerEvents: getComputedStyle(element).pointerEvents,
  };
});
ok(
  '按住瞄准控件时，说明立即出现在该控件旁且不拦截手势',
  touchTip.insideViewport && touchTip.besideAnchor && touchTip.pointerEvents === 'none' &&
    touchTip.text.includes('拨动调整方向'),
  JSON.stringify(touchTip),
);
await page.screenshot({ path: SCREENSHOT_PATH });
await page.touchscreen.touchEnd();
await wait(1150);
const precisionAfter = await page.$eval('.aim-dial', element => element.getAttribute('aria-valuenow'));
ok('原瞄准轻点照常生效，说明在松手后自动收起',
  precisionBefore !== precisionAfter && !await page.$('.control-onboarding-tip[data-tip-for="aim-dial"]'),
  JSON.stringify({ precisionBefore, precisionAfter }));

const nativeGuard = await page.$eval('[data-control-slot="aimDial"]', element => {
  const pointerAllowed = element.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 200,
    clientY: 700,
  }));
  const contextAllowed = element.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  }));
  const style = getComputedStyle(element);
  return {
    pointerDefaultPrevented: !pointerAllowed,
    contextDefaultPrevented: !contextAllowed,
    touchAction: style.touchAction,
    userSelect: style.userSelect,
    touchCallout: style.getPropertyValue('-webkit-touch-callout'),
  };
});
ok(
  '控件长按的 Pointer/contextmenu 默认行为被页面取消',
  nativeGuard.pointerDefaultPrevented && nativeGuard.contextDefaultPrevented &&
    nativeGuard.touchAction === 'none' && nativeGuard.userSelect === 'none',
  JSON.stringify(nativeGuard),
);

// 构造一条白球→1号球→右上角袋的共线直球，实际点球锁定构图后再用触屏蓄力出杆。
await page.evaluate(() => {
  const world = window.__bj8.world.current;
  for (const ball of world.balls) {
    ball.active = ball.number === 0 || ball.number === 1;
    ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
  }
  const cue = world.balls.find(ball => ball.number === 0);
  const target = world.balls.find(ball => ball.number === 1);
  cue.x = 0;
  cue.z = 0.6;
  target.x = 0.34925;
  target.z = -0.4285;
  world.events = [];
  world.firstContact = null;
  world.moving = false;
  window.__bj8.setMatch({
    phase: 'aiming', actor: 'player', breaking: false, playerGroup: 'solid', winner: null,
  });
  window.__bj8.sync();
});
await wait(180);
const targetPoint = await page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const azimuth = window.__bj8.cameraViewAzimuth.current;
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  return scene.tableToScreenAt(0.34925, -0.4285, azimuth, level);
});
await page.touchscreen.tap(targetPoint.x, targetPoint.y);
await wait(260);
const framing = await page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  return scene.cameraFraming && {
    targetNumber: scene.cameraFraming.targetNumber,
    pocketIndex: scene.cameraFraming.pocketIndex,
  };
});
ok('实际点球锁定 1 号球与右上角袋构图', framing?.targetNumber === 1 && framing?.pocketIndex === 1, JSON.stringify(framing));

const shoot = await center('.shoot-pad');
await page.touchscreen.touchStart(shoot.x, shoot.y - 20);
await page.touchscreen.touchMove(shoot.x, Math.min(830, shoot.y + 120));
await wait(80);
await page.touchscreen.touchEnd();

const timeline = [];
let nearShotCaptured = false;
for (let index = 0; index < 70; index += 1) {
  timeline.push(await page.evaluate(() => {
    const scene = window.__bj8.scene.current;
    return {
      time: performance.now(),
      phase: window.__bj8.match.current.phase,
      level: Number(document.querySelector('.viewport').getAttribute('data-view-level')),
      target: scene.shotCameraTarget,
      targetActive: window.__bj8.world.current.balls.find(ball => ball.number === 1)?.active,
    };
  }));
  if (!nearShotCaptured && timeline.at(-1).phase === 'rolling' &&
    timeline.at(-1).target === 1 && timeline.at(-1).level < 0.5) {
    await page.screenshot({ path: '/tmp/bj8-shot-follow-near.png' });
    nearShotCaptured = true;
  }
  if (timeline.some(item => item.target === 1) && timeline.at(-1).target === null && timeline.at(-1).level > 0.99) break;
  await wait(50);
}
const near = timeline.find(item => item.phase === 'rolling' && item.target === 1 && item.level < 0.5);
const global = near && timeline.find(item => item.time > near.time && item.target === null && item.level > 0.99);
ok(
  '击球后先保留目标球近景，结果可见后再回全台',
  Boolean(near && global),
  JSON.stringify({ near, global, samples: timeline.length }),
);
if (global) {
  await wait(700);
  const settledGlobal = await page.evaluate(() => {
    const viewport = document.querySelector('.viewport').getBoundingClientRect();
    const scene = window.__bj8.scene.current;
    const corners = [
      [-0.76, -1.4], [0.76, -1.4], [-0.76, 1.4], [0.76, 1.4],
    ].map(([x, z]) => scene.tableToScreen(x, z));
    return {
      corners,
      visible: corners.every(point =>
        point.x >= viewport.left && point.x <= viewport.right &&
        point.y >= viewport.top && point.y <= viewport.bottom),
    };
  });
  ok('近景结束后活相机平滑收敛到完整全台', settledGlobal.visible, JSON.stringify(settledGlobal));
  await page.screenshot({ path: '/tmp/bj8-shot-follow-global.png' });
}

ok('验收期间无页面异常', errors.length === 0, errors.join(' | '));
await page.close();
await browser.disconnect();

if (results.some(result => !result.pass)) process.exitCode = 1;
