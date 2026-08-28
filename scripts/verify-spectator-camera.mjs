/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 390×844 shot/tactical/spectator 视角生命周期、有效落位自动第一人称、自由环绕、控件避让、交棒保留、活相机锁镜与纯镜头通道耗能断言
[POS]: 竖屏显式相机状态机的浏览器出口验收门禁
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
await page.waitForFunction(
  () => window.__bj8?.match?.current?.phase === 'placing',
  { timeout: 2500 },
);
await wait(120);

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
}));
ok(
  '对手思考提示不再遮挡球桌触控',
  opponentUi.hint.includes('左右滑动') &&
    opponentUi.hintPointerEvents === 'none' &&
    opponentUi.recenter,
  JSON.stringify(opponentUi),
);
const controlSeparation = await page.evaluate(() => {
  const recenter = document.querySelector('.camera-recenter')?.getBoundingClientRect();
  const rightRail = document.querySelector('.dock-rail-right')?.getBoundingClientRect();
  if (!recenter || !rightRail) return null;
  return {
    gap: rightRail.left - recenter.right,
    recenter: { left: recenter.left, right: recenter.right },
    rightRail: { left: rightRail.left, right: rightRail.right },
  };
});
ok(
  '纯视觉回正按钮不覆盖右侧控制轨',
  Boolean(controlSeparation && controlSeparation.gap >= 4),
  JSON.stringify(controlSeparation),
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
  return {
    aim: window.__bj8.aim.current,
    azimuth,
    viewAzimuth,
    level,
    lampVisible: scene.lampGroup?.visible ?? null,
    viewport: {
      left: viewport.left,
      right: viewport.right,
      top: viewport.top,
      bottom: viewport.bottom,
    },
    corners,
  };
});

const beforeOrbit = await readCamera();
const allCornersVisible = beforeOrbit.corners.every(point =>
  point.x >= beforeOrbit.viewport.left + 4 &&
  point.x <= beforeOrbit.viewport.right - 4 &&
  point.y >= beforeOrbit.viewport.top + 4 &&
  point.y <= beforeOrbit.viewport.bottom - 4);
ok(
  '竖屏对手回合自动抬升并完整显示木帮外缘',
  beforeOrbit.level >= 0.819 && allCornersVisible,
  JSON.stringify(beforeOrbit),
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
const afterOrbit = await readCamera();
ok(
  '对手回合横向滑动只转相机、不改变瞄准角',
  Math.abs(afterOrbit.azimuth - beforeOrbit.azimuth) > 0.15 &&
    afterOrbit.aim === beforeOrbit.aim,
  JSON.stringify({ before: beforeOrbit, after: afterOrbit }),
);

const recenter = await page.$eval('.camera-recenter', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.touchscreen.tap(recenter.x, recenter.y);
await wait(120);
const afterRecenter = await readCamera();
ok(
  '纯视觉回正按钮恢复竖向球台与完整构图',
  Math.abs(afterRecenter.azimuth) < 1e-6 &&
    afterRecenter.corners.every(point =>
      point.x >= afterRecenter.viewport.left + 4 &&
      point.x <= afterRecenter.viewport.right - 4 &&
      point.y >= afterRecenter.viewport.top + 4 &&
      point.y <= afterRecenter.viewport.bottom - 4),
  JSON.stringify(afterRecenter),
);

// 回正后再转到非零方位，用它作为顾燃交棒时应保留的真实画面。
await page.touchscreen.touchStart(viewport.x, viewport.y);
await page.touchscreen.touchMove(viewport.dragX, viewport.y);
await page.touchscreen.touchEnd();
await wait(120);
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
handedOff.mode = await page.$eval(
  '.viewport',
  element => element.getAttribute('data-camera-mode'),
);
ok(
  '顾燃交棒后落到全台模式并保持当前构图',
  Math.abs(handedOff.level - beforeHandoff.level) < 0.001 &&
    Math.abs(handedOff.viewAzimuth - beforeHandoff.viewAzimuth) < 1e-6 &&
    handedOff.mode === 'tactical' &&
    handedOff.recenter,
  JSON.stringify({ beforeHandoff, handedOff }),
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
  '自由环绕入口是视角控件内的紧凑纯图形按钮',
  Boolean(
    manualCameraUi &&
    manualCameraUi.width >= 20 &&
    manualCameraUi.height >= 20 &&
    manualCameraUi.text === '' &&
    manualCameraUi.label === '开启自由环绕' &&
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
// 调试造局会让原有 15 球播放落袋动画；耗能基线必须等动画完全结束。
await wait(1200);
const manualBefore = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  azimuth: window.__bj8.cameraAzimuth.current,
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  level: Number(document.querySelector('.viewport').getAttribute('data-view-level')),
  ghost: window.__bj8.scene.current.aimGhostPos(),
  pressed: document.querySelector('.manual-camera-button')?.getAttribute('aria-pressed'),
  mode: document.querySelector('.viewport')?.getAttribute('data-camera-mode'),
  stats: window.__bj8.scene.current.debugRenderStats(),
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
manualAdjusted.stats = await page.evaluate(
  () => window.__bj8.scene.current.debugRenderStats(),
);
ok(
  '全台环绕可独立调整方位和高度，不改变瞄准角或幽灵球',
  manualBefore.pressed === 'true' &&
    manualBefore.mode === 'tactical' &&
    manualAdjusted.pressed === 'true' &&
    manualAdjusted.mode === 'tactical' &&
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
ok(
  '纯相机环绕与高度变化不重放世界、瞄准或阴影通道',
  manualAdjusted.stats.cameraSyncs > manualBefore.stats.cameraSyncs &&
    manualAdjusted.stats.worldSyncs === manualBefore.stats.worldSyncs &&
    manualAdjusted.stats.aimSyncs === manualBefore.stats.aimSyncs &&
    manualAdjusted.stats.shadowInvalidations === manualBefore.stats.shadowInvalidations,
  JSON.stringify({ before: manualBefore.stats, after: manualAdjusted.stats }),
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
  '退出自由环绕后保留全台构图，恢复点选瞄准',
  manualExited.pressed === 'false' &&
    manualExited.mode === 'tactical' &&
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
await wait(850);
const ghostSelected = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  level: Number(document.querySelector('.viewport')?.getAttribute('data-view-level')),
  mode: document.querySelector('.viewport')?.getAttribute('data-camera-mode'),
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  ghost: window.__bj8.scene.current.aimGhostPos(),
}));
ok(
  '全台视角仍可准确选择幽灵球位置',
  ghostSelected.ghost &&
    Math.hypot(
      ghostSelected.ghost.x - ghostTarget.target.x,
      ghostSelected.ghost.z - ghostTarget.target.z,
    ) < 0.035 &&
    Math.abs(ghostSelected.aim - ghostTarget.aim) > 0.05,
  JSON.stringify({ ghostTarget, ghostSelected }),
);

// 幽灵球完成有效落位后自动建立瞄准态：零高度第一人称并跟随最新杆向。
const firstPerson = await readCamera();
firstPerson.mode = await page.$eval(
  '.viewport',
  element => element.getAttribute('data-camera-mode'),
);
ok(
  '幽灵球有效落位后自动进入零高度击球视角并跟随杆向',
  firstPerson.mode === 'shot' &&
    Math.abs(firstPerson.level) < 0.001 &&
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

// 玩家显式进入全台视角；点台面完成有效瞄准后应自动回到零高度第一人称。
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
await wait(850);
const playerGlobalAfter = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  azimuth: window.__bj8.cameraAzimuth.current,
  viewAzimuth: window.__bj8.cameraViewAzimuth.current,
  level: Number(document.querySelector('.viewport')?.getAttribute('data-view-level')),
  mode: document.querySelector('.viewport')?.getAttribute('data-camera-mode'),
  ghost: window.__bj8.scene.current.aimGhostPos(),
}));
ok(
  '玩家进入全台模式时无遮挡，点球桌完成瞄准后自动回到第一人称',
  Math.abs(playerGlobalBefore.level - 1) < 0.001 &&
    playerGlobalBefore.lampVisible === false &&
    Math.abs(playerGlobalAfter.aim - playerGlobalBefore.aim) > 0.05 &&
    playerGlobalAfter.mode === 'shot' &&
    Math.abs(playerGlobalAfter.level) < 0.001 &&
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
