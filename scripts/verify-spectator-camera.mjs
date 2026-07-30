/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 390×844 对手观战自动全台、独立横向环绕、无控件遮挡回正及玩家视角恢复断言
[POS]: 竖屏观战相机的浏览器出口验收门禁
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

// 用真实键盘把玩家视角停在 35%，用于验证观战结束后恢复的不是固定端点。
await page.focus('.view-slider-track');
await page.keyboard.press('Home');
for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowUp');
await wait(120);
const playerLevel = await page.$eval(
  '.viewport',
  element => Number(element.getAttribute('data-view-level')),
);

// opponent 显示轻量提示；随即切 rolling 取消 AI 计时器，稳定复现“对手击球中”的观战态。
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

await page.evaluate(() => window.__bj8.setMatch({
  phase: 'rolling',
  actor: 'opponent',
  breaking: false,
  winner: null,
}));
await wait(900);

const readCamera = () => page.evaluate(() => {
  const viewport = document.querySelector('.viewport').getBoundingClientRect();
  const scene = window.__bj8.scene.current;
  const azimuth = window.__bj8.cameraAzimuth.current;
  const level = Number(document.querySelector('.viewport').getAttribute('data-view-level'));
  const corners = [
    [-0.76, -1.4],
    [0.76, -1.4],
    [-0.76, 1.4],
    [0.76, 1.4],
  ].map(([x, z]) => scene.tableToScreenAt(x, z, azimuth, level));
  return {
    aim: window.__bj8.aim.current,
    azimuth,
    level,
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
await wait(700);
const afterOrbit = await readCamera();
ok(
  '对手击球中横向滑动只转相机、不改变瞄准角',
  Math.abs(afterOrbit.azimuth - beforeOrbit.azimuth) > 0.15 &&
    afterOrbit.aim === beforeOrbit.aim,
  JSON.stringify({ before: beforeOrbit, after: afterOrbit }),
);

const recenter = await page.$eval('.camera-recenter', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.touchscreen.tap(recenter.x, recenter.y);
await wait(700);
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

await page.evaluate(() => window.__bj8.setMatch({
  phase: 'aiming',
  actor: 'player',
  breaking: false,
  winner: null,
}));
await wait(180);
const restored = await page.evaluate(() => ({
  level: Number(document.querySelector('.viewport').getAttribute('data-view-level')),
  recenter: Boolean(document.querySelector('.camera-recenter')),
}));
ok(
  '回到玩家瞄准时恢复进入观战前的任意高度',
  Math.abs(restored.level - playerLevel) < 0.001 && !restored.recenter,
  JSON.stringify({ playerLevel, restored }),
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
