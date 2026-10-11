/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 顾燃回合竖屏纵台/横屏横台固定俯视、玩家非俯视杆向跟随、手动相机与触屏锁镜断言
[POS]: 横竖屏观战锁定与玩家相机跟随的浏览器出口验收门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const results = [];
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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

const start = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')]
    .find(element => element.textContent?.includes('开始'));
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
if (start) await page.touchscreen.tap(start.x, start.y);
await wait(300);

// 用真实键盘把玩家视角停在 35%，确认对手接管时会抬升到全台观战位。
await page.focus('.view-slider-track');
await page.keyboard.press('Home');
for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowUp');
await wait(120);
const playerLevel = await page.$eval(
  '.viewport',
  element => Number(element.getAttribute('data-view-level')),
);

// opponent 显示轻量提示；所有视觉读取都用目标相机，不等待 rAF 收敛。
await page.evaluate(() => window.__bj8.setMatch({
  phase: 'opponent',
  actor: 'opponent',
  breaking: false,
  winner: null,
}));
await wait(120);
const opponentUi = await page.evaluate(() => ({
  hint: document.querySelector('.turn-mask')?.textContent ?? '',
  hintPointerEvents: getComputedStyle(document.querySelector('.turn-mask')).pointerEvents,
  recenter: Boolean(document.querySelector('.camera-recenter')),
  viewDisabled: document.querySelector('.view-switcher')?.getAttribute('aria-disabled'),
}));
ok(
  '顾燃回合提示固定俯视且禁用视角控件',
  opponentUi.hint.includes('固定俯视全台') &&
    opponentUi.hintPointerEvents === 'none' &&
    !opponentUi.recenter &&
    opponentUi.viewDisabled === 'true',
  JSON.stringify(opponentUi),
);

await wait(80);

const readCamera = () => page.evaluate(() => {
  const viewport = document.querySelector('.viewport').getBoundingClientRect();
  const scene = window.__bj8.scene.current;
  const azimuth = window.__bj8.cameraAzimuth.current;
  const viewAzimuth = window.__bj8.cameraViewAzimuth.current;
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const corners = [
    [-0.76, -1.4],
    [0.76, -1.4],
    [-0.76, 1.4],
    [0.76, 1.4],
  ].map(([x, z]) => scene.tableToScreenAt(x, z, viewAzimuth, level));
  const longAxis = [
    scene.tableToScreenAt(0, -1.2, viewAzimuth, level),
    scene.tableToScreenAt(0, 1.2, viewAzimuth, level),
  ];
  return {
    aim: window.__bj8.aim.current,
    azimuth,
    viewAzimuth,
    level,
    worldId: scene.studioEnvironment?.root.userData.worldId ?? 'studio',
    lampVisible: (() => {
      let lamp = scene.scene.getObjectByName('BJ8_Pendant');
      if (!lamp) return false;
      while (lamp) { if (!lamp.visible) return false; lamp = lamp.parent; }
      return true;
    })(),
    viewport: {
      left: viewport.left,
      right: viewport.right,
      top: viewport.top,
      bottom: viewport.bottom,
    },
    corners,
    longAxis,
  };
});

const portraitLocked = await readCamera();
const portraitAxis = {
  dx: Math.abs(portraitLocked.longAxis[1].x - portraitLocked.longAxis[0].x),
  dy: Math.abs(portraitLocked.longAxis[1].y - portraitLocked.longAxis[0].y),
};
const allCornersVisible = portraitLocked.corners.every(point =>
  point.x >= portraitLocked.viewport.left + 4 &&
  point.x <= portraitLocked.viewport.right - 4 &&
  point.y >= portraitLocked.viewport.top + 4 &&
  point.y <= portraitLocked.viewport.bottom - 4);
ok(
  '手机竖屏顾燃回合固定为纵向完整俯视',
  portraitLocked.level >= 0.999 &&
    Math.abs(portraitLocked.viewAzimuth) < 1e-6 &&
    portraitAxis.dy > portraitAxis.dx * 2 &&
    allCornersVisible,
  JSON.stringify({ portraitLocked, portraitAxis }),
);

const viewport = await page.$eval('.viewport', element => {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width * 0.45,
    y: rect.top + rect.height * 0.55,
    dragX: rect.left + rect.width * 0.78,
  };
});
await page.touchscreen.touchStart(viewport.x, viewport.y);
await page.touchscreen.touchMove(viewport.dragX, viewport.y);
await page.touchscreen.touchEnd();
await wait(120);
const afterLockedDrag = await readCamera();
ok(
  '顾燃回合横向滑动不再旋转球台',
  Math.abs(afterLockedDrag.azimuth - portraitLocked.azimuth) < 1e-6 &&
    afterLockedDrag.aim === portraitLocked.aim,
  JSON.stringify({ before: portraitLocked, after: afterLockedDrag }),
);

const desktopPage = await browser.newPage();
desktopPage.on('pageerror', error => errors.push(String(error)));
await desktopPage.setViewport({ width: 1280, height: 800 });
await desktopPage.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await desktopPage.evaluate(() => {
  const button = [...document.querySelectorAll('button')]
    .find(element => element.textContent?.includes('开始'));
  button?.click();
});
await desktopPage.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });
await desktopPage.evaluate(() => window.__bj8.setMatch({
  phase: 'opponent',
  actor: 'opponent',
  breaking: false,
  winner: null,
}));
await wait(180);
const landscapeLocked = await desktopPage.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const viewAzimuth = window.__bj8.cameraViewAzimuth.current;
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  return {
    level,
    viewAzimuth,
    longAxis: [
      scene.tableToScreenAt(0, -1.2, viewAzimuth, level),
      scene.tableToScreenAt(0, 1.2, viewAzimuth, level),
    ],
  };
});
const landscapeAxis = {
  dx: Math.abs(landscapeLocked.longAxis[1].x - landscapeLocked.longAxis[0].x),
  dy: Math.abs(landscapeLocked.longAxis[1].y - landscapeLocked.longAxis[0].y),
};
ok(
  '电脑横屏顾燃回合固定为横向俯视',
  landscapeLocked.level >= 0.999 &&
    Math.abs(landscapeLocked.viewAzimuth - Math.PI / 2) < 1e-6 &&
    landscapeAxis.dx > landscapeAxis.dy * 2,
  JSON.stringify({ landscapeLocked, landscapeAxis }),
);
await desktopPage.close();

const beforeHandoff = await readCamera();

await page.evaluate(() => window.__bj8.setMatch({
  phase: 'aiming',
  actor: 'player',
  breaking: false,
  winner: null,
}));
await wait(180);
const handedOff = await readCamera();
handedOff.recenter = Boolean(await page.$('.camera-recenter'));
handedOff.viewDisabled = await page.$eval(
  '.view-switcher',
  element => element.getAttribute('aria-disabled'),
);
ok(
  '顾燃交棒后保留俯视构图并恢复玩家视角控件',
  Math.abs(handedOff.level - beforeHandoff.level) < 0.001 &&
    Math.abs(handedOff.viewAzimuth - beforeHandoff.viewAzimuth) < 1e-6 &&
    !handedOff.recenter &&
    handedOff.viewDisabled === 'false',
  JSON.stringify({ playerLevel, beforeHandoff, handedOff }),
);

const manualCameraUi = await page.evaluate(() => {
  const button = document.querySelector('.manual-camera-button');
  const switcher = document.querySelector('.view-switcher');
  if (!button || !switcher) return null;
  const rect = button.getBoundingClientRect();
  const parent = switcher.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
    text: button.textContent?.trim() ?? '',
    label: button.getAttribute('aria-label'),
    pressed: button.getAttribute('aria-pressed'),
    insideViewControl:
      rect.left >= parent.left && rect.right <= parent.right &&
      rect.top >= parent.top && rect.bottom <= parent.bottom,
  };
});
ok(
  '手动视角入口是视角控件内的紧凑纯图形按钮',
  Boolean(
    manualCameraUi &&
    manualCameraUi.width >= 20 &&
    manualCameraUi.height >= 20 &&
    manualCameraUi.text === '' &&
    manualCameraUi.label === '开启手动视角' &&
    manualCameraUi.pressed === 'false' &&
    manualCameraUi.insideViewControl
  ),
  JSON.stringify(manualCameraUi),
);

await page.touchscreen.tap(manualCameraUi.x, manualCameraUi.y);
await wait(120);
await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const cue = world.balls[0];
  Object.assign(cue, {
    active: true,
    x: 0,
    z: 0.55,
    vx: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
  });
  for (const ball of world.balls) {
    if (ball.number !== 0) ball.active = false;
  }
  world.moving = false;
  window.__bj8.sync();
});
await wait(120);
const manualBefore = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  azimuth: window.__bj8.cameraAzimuth.current,
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  level: Number(document.querySelector('.viewport').getAttribute('data-view-level')),
  ghost: window.__bj8.scene.current.aimGhostPos(),
  pressed: document.querySelector('.manual-camera-button')?.getAttribute('aria-pressed'),
  mode: document.querySelector('.viewport')?.getAttribute('data-camera-mode'),
}));
await page.touchscreen.touchStart(viewport.x, viewport.y);
await page.touchscreen.touchMove(viewport.dragX, viewport.y);
await page.touchscreen.touchEnd();
await page.focus('.view-slider-track');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await wait(180);
const manualAdjusted = await readCamera();
manualAdjusted.ghost = await page.evaluate(
  () => window.__bj8.scene.current.aimGhostPos(),
);
manualAdjusted.pressed = await page.$eval(
  '.manual-camera-button',
  element => element.getAttribute('aria-pressed'),
);
manualAdjusted.mode = await page.$eval(
  '.viewport',
  element => element.getAttribute('data-camera-mode'),
);
ok(
  '手动视角可独立调整方位和高度，不改变瞄准角或幽灵球',
  manualBefore.pressed === 'true' &&
    manualBefore.mode === 'manual' &&
    manualAdjusted.pressed === 'true' &&
    manualAdjusted.mode === 'manual' &&
    Math.abs(manualAdjusted.azimuth - manualBefore.azimuth) > 0.15 &&
    manualAdjusted.level < manualBefore.level - 0.09 &&
    Math.abs(manualAdjusted.aim - manualBefore.aim) < 1e-10 &&
    manualBefore.ghost &&
    manualAdjusted.ghost &&
    Math.hypot(
      manualAdjusted.ghost.x - manualBefore.ghost.x,
      manualAdjusted.ghost.z - manualBefore.ghost.z,
    ) < 1e-8,
  JSON.stringify({ manualBefore, manualAdjusted }),
);

await page.touchscreen.tap(manualCameraUi.x, manualCameraUi.y);
await wait(850);
const manualExited = await readCamera();
manualExited.pressed = await page.$eval(
  '.manual-camera-button',
  element => element.getAttribute('aria-pressed'),
);
manualExited.mode = await page.$eval(
  '.viewport',
  element => element.getAttribute('data-camera-mode'),
);
ok(
  '退出手动视角后保留所选画面，等待下一次瞄准操作',
  manualExited.pressed === 'false' &&
    manualExited.mode === 'aim' &&
    Math.abs(manualExited.level - manualAdjusted.level) < 0.001 &&
    Math.abs(manualExited.viewAzimuth - manualAdjusted.viewAzimuth) < 1e-6 &&
    Math.abs(manualExited.aim - manualAdjusted.aim) < 1e-10,
  JSON.stringify({ manualAdjusted, manualExited }),
);

// 固定一个无障碍局面，用交棒后的视觉相机投影台面点，再走真实触摸选择幽灵球。
const ghostTarget = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const cue = world.balls[0];
  Object.assign(cue, {
    active: true,
    x: 0,
    z: 0.55,
    vx: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
  });
  for (const ball of world.balls) {
    if (ball.number !== 0) ball.active = false;
  }
  world.moving = false;
  window.__bj8.sync();
  const target = { x: 0.26, z: 0.16 };
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const screen = window.__bj8.scene.current.tableToScreenAt(
    target.x,
    target.z,
    window.__bj8.cameraViewAzimuth.current,
    level,
  );
  return { target, screen, aim: window.__bj8.aim.current };
});
await page.touchscreen.tap(ghostTarget.screen.x, ghostTarget.screen.y);
await wait(180);
const ghostSelected = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  ghost: window.__bj8.scene.current.aimGhostPos(),
}));
ok(
  '玩家选择非俯视视角后，瞄准会同步带动视角并准确选择幽灵球',
  ghostSelected.ghost &&
    Math.hypot(
      ghostSelected.ghost.x - ghostTarget.target.x,
      ghostSelected.ghost.z - ghostTarget.target.z,
    ) < 0.035 &&
    Math.abs(ghostSelected.aim - ghostTarget.aim) > 0.05 &&
    Math.abs(ghostSelected.viewAzimuth - ghostSelected.aim) < 1e-6,
  JSON.stringify({ ghostTarget, ghostSelected }),
);

// 用户主动把视角杆拉到底，第一人称才重新跟随当前杆向。
const viewTrack = await page.$eval('.view-slider-track', element => {
  const rect = element.getBoundingClientRect();
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const travel = Math.max(1, rect.height - 24);
  return {
    x: rect.left + rect.width / 2,
    fromY: rect.bottom - 12 - level * travel,
    toY: rect.bottom - 8,
  };
});
await page.touchscreen.touchStart(viewTrack.x, viewTrack.fromY);
await page.touchscreen.touchMove(viewTrack.x, viewTrack.toY);
await page.touchscreen.touchEnd();
await wait(180);
const firstPerson = await readCamera();
ok(
  '用户拉回第一人称后相机重新跟随当前瞄准角',
  firstPerson.level <= 0.005 &&
    Math.abs(firstPerson.viewAzimuth - firstPerson.aim) < 1e-6,
  JSON.stringify(firstPerson),
);

// 第一人称触屏瞄准时固定画面；松手并结束微调窗口后才让镜头平滑跟上杆向。
const touchAimTarget = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const cue = world.balls[0];
  const aim = window.__bj8.aim.current;
  const targetAim = aim + 0.18;
  const target = {
    x: cue.x + Math.sin(targetAim) * 0.55,
    z: cue.z - Math.cos(targetAim) * 0.55,
  };
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const screen = window.__bj8.scene.current.tableToScreenAt(
    target.x,
    target.z,
    window.__bj8.cameraViewAzimuth.current,
    level,
  );
  return { targetAim, target, screen };
});
await page.touchscreen.touchStart(touchAimTarget.screen.x, touchAimTarget.screen.y);
await wait(180);
const touchAimLocked = await readCamera();
await page.touchscreen.touchEnd();
await wait(850);
const touchAimFollowed = await readCamera();
ok(
  '手机瞄准操作期间球台保持固定，停止后镜头才平滑跟杆',
  Math.abs(touchAimLocked.aim - firstPerson.aim) > 0.1 &&
    Math.abs(touchAimLocked.viewAzimuth - firstPerson.viewAzimuth) < 1e-6 &&
    Math.abs(touchAimFollowed.viewAzimuth - touchAimFollowed.aim) < 1e-6,
  JSON.stringify({ firstPerson, touchAimTarget, touchAimLocked, touchAimFollowed }),
);

// v1.6.0 继承行为：全台观察无遮挡；确认幽灵球后自动进入 16% 出杆位并跟随杆向。
await page.focus('.view-slider-track');
await page.keyboard.press('End');
await wait(180);
const playerGlobalBefore = await readCamera();
const playerGlobalTarget = await page.evaluate(() => {
  const target = { x: -0.28, z: 0.02 };
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const screen = window.__bj8.scene.current.tableToScreenAt(
    target.x,
    target.z,
    window.__bj8.cameraViewAzimuth.current,
    level,
  );
  return { target, screen };
});
await page.touchscreen.tap(playerGlobalTarget.screen.x, playerGlobalTarget.screen.y);
await wait(180);
const playerGlobalAfter = await page.evaluate(() => ({
  level: Number(document.querySelector('.viewport').getAttribute('data-view-level')),
  aim: window.__bj8.aim.current,
  azimuth: window.__bj8.cameraAzimuth.current,
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  ghost: window.__bj8.scene.current.aimGhostPos(),
}));
ok(
  '全台观察无遮挡，确认幽灵球后按基线进入出杆视角并跟随杆向',
  Math.abs(playerGlobalBefore.level - 1) < 0.001 &&
    firstPerson.lampVisible === (firstPerson.worldId === 'studio') &&
    playerGlobalBefore.lampVisible === false &&
    Math.abs(playerGlobalAfter.aim - playerGlobalBefore.aim) > 0.05 &&
    Math.abs(playerGlobalAfter.level - 0.16) < 1e-6 &&
    Math.abs(playerGlobalAfter.azimuth - playerGlobalAfter.aim) < 1e-6 &&
    Math.abs(playerGlobalAfter.viewAzimuth - playerGlobalAfter.aim) < 1e-6 &&
    playerGlobalAfter.ghost &&
    Math.hypot(
      playerGlobalAfter.ghost.x - playerGlobalTarget.target.x,
      playerGlobalAfter.ghost.z - playerGlobalTarget.target.z,
    ) < 0.035,
  JSON.stringify({ playerGlobalBefore, playerGlobalTarget, playerGlobalAfter }),
);

ok('观战相机流程无 JavaScript 错误', errors.length === 0, errors[0] || '');
await page.close();
await browser.disconnect();

const failed = results.filter(result => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} spectator-camera check(s) failed`);
  process.exit(1);
}
console.log(`\n${results.length} spectator-camera checks passed`);
