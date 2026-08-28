/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器、puppeteer-core 与 __bj8 调试句柄
[OUTPUT]: 390×844 竖屏双方水平、辅助线、触屏拖放、压感拨轮增益/视觉/回退、沿边落点与轴向断言
[POS]: v1.4 手机真实 Pointer 与统一控件布局的浏览器出口验收门禁（保留旧脚本名供现有命令调用）
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9334';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5200/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

async function center(selector) {
  return page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  });
}

async function tap(selector) {
  const point = await center(selector);
  await page.touchscreen.tap(point.x, point.y);
}

async function longPressMove(selector, target) {
  const point = await center(selector);
  await page.touchscreen.touchStart(point.x, point.y);
  await wait(500);
  await page.touchscreen.touchMove(target.x, target.y);
  await wait(40);
  await page.touchscreen.touchEnd();
  await wait(120);
}

async function jitteredLongPressMove(selector, target) {
  const point = await center(selector);
  await page.touchscreen.touchStart(point.x, point.y);
  await wait(100);
  await page.touchscreen.touchMove(point.x + 10, point.y + 3);
  await wait(280);
  await page.touchscreen.touchMove(target.x, target.y);
  await wait(50);
  await page.touchscreen.touchEnd();
  await wait(140);
}

async function measuredLongPressMove(selector, target, steps = 12) {
  const point = await center(selector);
  await page.evaluate(() => {
    const state = window.__layoutWriteProbe ?? {
      writes: 0,
      original: Storage.prototype.setItem,
    };
    window.__layoutWriteProbe = state;
    if (!state.installed) {
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'guagua-billiards:control-layout:v3') state.writes += 1;
        return state.original.call(this, key, value);
      };
      state.installed = true;
    }
    state.writes = 0;
  });
  await page.touchscreen.touchStart(point.x, point.y);
  await wait(500);
  const samples = [];
  for (let index = 1; index <= steps; index += 1) {
    await page.touchscreen.touchMove(
      point.x + (target.x - point.x) * index / steps,
      point.y + (target.y - point.y) * index / steps,
    );
    await wait(18);
    const sample = await center(selector);
    samples.push({
      x: Math.round(sample.x + sample.width / 2),
      y: Math.round(sample.y + sample.height / 2),
    });
  }
  await page.touchscreen.touchEnd();
  await wait(140);
  const writes = await page.evaluate(() => window.__layoutWriteProbe?.writes ?? -1);
  const distinct = new Set(samples.map(sample => `${sample.x},${sample.y}`)).size;
  return { writes, distinct, samples };
}

async function quickMove(selector, deltaX, deltaY) {
  const point = await center(selector);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  for (let step = 1; step <= 3; step += 1) {
    await wait(24);
    await page.mouse.move(
      point.x + deltaX * step / 3,
      point.y + deltaY * step / 3,
    );
  }
  await wait(24);
  await page.mouse.up();
  await wait(160);
}

async function pressureMove(selector, force, deltaX = 36) {
  const point = await center(selector);
  const touch = (x, pressure) => ({
    x,
    y: point.y,
    id: 7,
    radiusX: 6,
    radiusY: 6,
    force: pressure,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touch(point.x, force)],
  });
  for (let step = 1; step <= 4; step += 1) {
    await wait(24);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touch(point.x + deltaX * step / 4, force)],
    });
  }
  await wait(40);
  const feedback = await page.$eval(selector, element => ({
    active: element.getAttribute('data-pressure-active'),
    tightness: Number(
      getComputedStyle(element).getPropertyValue('--aim-dial-tightness'),
    ),
  }));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await wait(160);
  return feedback;
}

async function startAndPlace() {
  await tap('.start-btn');
  await wait(650);
  const placing = await page.evaluate(() => window.__bj8?.match?.current?.phase === 'placing');
  if (!placing) return;
  const candidates = await page.evaluate(() => {
    const scene = window.__bj8.scene.current;
    const rect = document.querySelector('.viewport').getBoundingClientRect();
    const result = [];
    for (let py = rect.top + 80; py < rect.bottom - 30; py += 18) {
      for (let px = rect.left + 30; px < rect.right - 80; px += 18) {
        const hit = scene.screenToTable(px, py);
        if (hit && Math.abs(hit.x) < 0.32 && hit.z > 0.78 && hit.z < 1.12) {
          result.push({ x: px, y: py });
          if (result.length >= 12) return result;
        }
      }
    }
    return result;
  });
  for (const target of candidates) {
    await page.touchscreen.tap(target.x, target.y);
    await wait(360);
    if (await page.evaluate(() => window.__bj8?.match?.current?.phase !== 'placing')) break;
  }
}

await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  localStorage.removeItem('guagua-billiards:control-layout:v3');
  localStorage.removeItem('guagua-billiards:aim-assist:v1');
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('bj8-control-y:v2:')) localStorage.removeItem(key);
  }
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.start-btn', { timeout: 10000 });
await startAndPlace();

const initial = await page.evaluate(() => {
  const box = selector => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom,
    };
  };
  const scene = window.__bj8.scene.current;
  return {
    phase: window.__bj8.match.current.phase,
    scoreboard: box('.scoreboard'),
    viewport: box('.viewport'),
    rightRail: box('.dock-rail-right'),
    slots: [...document.querySelectorAll('[data-control-slot]')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.controlSlot,
        edge: element.dataset.dockEdge,
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      };
    }),
    levelTexts: [...document.querySelectorAll('.mobile-identity .skill-level')]
      .map(element => element.textContent?.trim()),
    controlText: document.querySelector('.control-deck')?.innerText.trim() ?? '',
    powerNumbers: document.querySelectorAll('.power-num').length,
    aimVisible: scene.aimLine.visible,
    objVisible: scene.objLine.visible,
    tanVisible: scene.tanLine.visible,
    ghostVisible: scene.aimGhost.visible,
    storedAim: localStorage.getItem('guagua-billiards:aim-assist:v1'),
  };
});

ok('手机开球落位进入玩家瞄准阶段', initial.phase === 'aiming', initial.phase);
ok('手机比分牌在双方名字下展示整数水平',
  initial.levelTexts.length === 2 && initial.levelTexts.every(value => /^\d+$/.test(value)),
  JSON.stringify(initial.levelTexts));
ok('五个控件都在视口安全范围且不遮挡比分牌',
  initial.slots.length === 5 && initial.slots.every(slot =>
    slot.x >= 8 && slot.right <= 382 && slot.y >= initial.scoreboard.bottom && slot.bottom <= 836),
  JSON.stringify(initial.slots));
ok('操作面无可见文字和力度数字',
  initial.controlText === '' && initial.powerNumbers === 0,
  JSON.stringify({ text: initial.controlText, numbers: initial.powerNumbers }));
ok('首次进入预测辅助线默认开启且幽灵球可见',
  initial.storedAim === null && initial.aimVisible && initial.ghostVisible,
  JSON.stringify(initial));

const rightOrderBefore = await page.evaluate(() => {
  window.__controlLayoutPointerCancels = 0;
  window.addEventListener('pointercancel', () => {
    window.__controlLayoutPointerCancels += 1;
  }, { capture: true, once: true });
  return {
    centers: Object.fromEntries(
    ['view', 'bulb'].map(id => {
      const rect = document.querySelector(`[data-control-slot="${id}"]`)
        ?.getBoundingClientRect();
      return [id, rect ? rect.top + rect.height / 2 : null];
    }),
    ),
    scrollY: window.scrollY,
  };
});
await jitteredLongPressMove(
  '[data-control-slot="view"]',
  await center('[data-control-slot="bulb"]'),
);
const rightOrderAfter = await page.evaluate(() => ({
  centers: Object.fromEntries(
      ['view', 'bulb'].map(id => {
        const element = document.querySelector(`[data-control-slot="${id}"]`);
        const rect = element?.getBoundingClientRect();
        return [id, {
          edge: element?.getAttribute('data-dock-edge'),
          centerY: rect ? rect.top + rect.height / 2 : null,
        }];
      }),
    ),
  scrollY: window.scrollY,
  pointerCancels: window.__controlLayoutPointerCancels,
}));
ok('手机轻微手抖仍可进入长按布局且同边上下换位',
  rightOrderAfter.centers.view.edge === 'right' &&
    rightOrderAfter.centers.bulb.edge === 'right' &&
    Math.abs(rightOrderAfter.centers.view.centerY -
      rightOrderBefore.centers.bulb) <= 2 &&
    Math.abs(rightOrderAfter.centers.bulb.centerY -
      rightOrderBefore.centers.view) <= 2 &&
    rightOrderAfter.scrollY === rightOrderBefore.scrollY &&
    rightOrderAfter.pointerCancels === 0,
  JSON.stringify({ before: rightOrderBefore, after: rightOrderAfter }));

// 同边换位是独立手势场景；恢复默认布局，避免改变后续辅助/拨轮基线。
await page.evaluate(() =>
  localStorage.removeItem('guagua-billiards:control-layout:v3'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.start-btn', { timeout: 10000 });
await startAndPlace();

await page.click('.plan-button');
await wait(240);
const menuOpen = await page.evaluate(() => ({
  expanded: document.querySelector('.plan-button')?.getAttribute('aria-expanded'),
  aimSwitch: document.querySelector('.aim-option')?.getAttribute('aria-checked'),
  guidanceDisabled: document.querySelector('.guidance-option')?.disabled,
}));
ok('灯泡向球桌内侧展开两个独立图形开关',
  menuOpen.expanded === 'true' && menuOpen.aimSwitch === 'true',
  JSON.stringify(menuOpen));
await page.click('.aim-option');
await wait(120);
const disabled = await page.evaluate(() => ({
  stored: localStorage.getItem('guagua-billiards:aim-assist:v1'),
  checked: document.querySelector('.aim-option')?.getAttribute('aria-checked'),
  aimVisible: window.__bj8.scene.current.aimLine.visible,
  ghostVisible: window.__bj8.scene.current.aimGhost.visible,
}));
ok('灯泡可独立关闭预测线且不影响幽灵球',
  disabled.stored === 'false' && disabled.checked === 'false' &&
    !disabled.aimVisible && disabled.ghostVisible,
  JSON.stringify(disabled));

await page.reload({ waitUntil: 'networkidle0' });
await wait(350);
const persisted = await page.evaluate(() => ({
  stored: localStorage.getItem('guagua-billiards:aim-assist:v1'),
  bulbClass: document.querySelector('.plan-button')?.className ?? '',
}));
ok('辅助线关闭选择刷新后保持', persisted.stored === 'false' &&
  !persisted.bulbClass.includes('has-aim-assist'), JSON.stringify(persisted));
await startAndPlace();

const dialStartAim = await page.evaluate(() => window.__bj8.aim.current);
await quickMove('[data-control-slot="aimDial"] .aim-dial', 34, 0);
const dialEndAim = await page.evaluate(() => window.__bj8.aim.current);
ok('快速横拨仍改变唯一世界杆向',
  Math.abs(dialEndAim - dialStartAim) > 0.001, `${dialStartAim} → ${dialEndAim}`);

const pressureBaseline = await page.evaluate(() => window.__bj8.aim.current);
const resetAim = angle => page.evaluate(value => {
  window.__bj8.aim.current = value;
  window.__bj8.scene.current.setAim(value);
}, angle);

await resetAim(pressureBaseline);
const lowPressureFeedback = await pressureMove(
  '[data-control-slot="aimDial"] .aim-dial',
  0.18,
);
const lowPressureAim = await page.evaluate(() => window.__bj8.aim.current);
await resetAim(pressureBaseline);
const highPressureFeedback = await pressureMove(
  '[data-control-slot="aimDial"] .aim-dial',
  0.82,
);
const highPressureAim = await page.evaluate(() => window.__bj8.aim.current);
await resetAim(pressureBaseline);
const fallbackPressureFeedback = await pressureMove(
  '[data-control-slot="aimDial"] .aim-dial',
  0.5,
);
const fallbackPressureAim = await page.evaluate(() => window.__bj8.aim.current);
const lowPressureDelta = Math.abs(lowPressureAim - pressureBaseline);
const highPressureDelta = Math.abs(highPressureAim - pressureBaseline);
const fallbackPressureDelta = Math.abs(fallbackPressureAim - pressureBaseline);

ok('同位移低压/高压都产生可见紧度反馈且高压更强',
  lowPressureFeedback.active === 'true' &&
    highPressureFeedback.active === 'true' &&
    highPressureFeedback.tightness > lowPressureFeedback.tightness + 0.4,
  JSON.stringify({ lowPressureFeedback, highPressureFeedback }));
ok('同样 36px 位移下高压传动更紧、瞄准变化更精细',
  lowPressureDelta > 0.001 &&
    highPressureDelta > 0 &&
    highPressureDelta < lowPressureDelta * 0.6,
  JSON.stringify({ lowPressureDelta, highPressureDelta }));
ok('固定 0.5 普通触摸回退原速度且不误显示压感',
  fallbackPressureFeedback.active === 'false' &&
    fallbackPressureDelta > 0.001 &&
    Math.abs(fallbackPressureDelta - lowPressureDelta) / lowPressureDelta < 0.12,
  JSON.stringify({
    fallbackPressureFeedback,
    fallbackPressureDelta,
    lowPressureDelta,
  }));

const semanticBefore = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  view: document.querySelector('.view-slider-track')?.getAttribute('aria-valuenow'),
  spin: document.querySelector('.spin-preview')?.getAttribute('aria-label'),
  shot: window.__bj8.world.current.shot,
}));
const freeTargets = {
  view: { x: 75, y: 225 },
  bulb: { x: 145, y: 335 },
  spin: { x: 220, y: 440 },
  power: { x: 305, y: 550 },
  aimDial: { x: 185, y: 690 },
};
const dragPerformance = await measuredLongPressMove(
  '[data-control-slot="view"]',
  freeTargets.view,
);
for (const [id, target] of Object.entries(freeTargets).filter(([id]) => id !== 'view')) {
  await longPressMove(`[data-control-slot="${id}"]`, target);
}
const freeState = await page.evaluate(() => ({
  placements: Object.fromEntries(
    [...document.querySelectorAll('[data-control-slot]')].map(element => {
      const rect = element.getBoundingClientRect();
      return [element.dataset.controlSlot, {
        mode: element.dataset.placement,
        x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      }];
    }),
  ),
  aim: window.__bj8.aim.current,
  view: document.querySelector('.view-slider-track')?.getAttribute('aria-valuenow'),
  spin: document.querySelector('.spin-preview')?.getAttribute('aria-label'),
  shot: window.__bj8.world.current.shot,
}));
ok('五个控件均可长按后自由悬浮',
  Object.values(freeState.placements).every(placement =>
    placement.mode === 'free' && placement.x >= 8 && placement.right <= 382 &&
      placement.y >= 8 && placement.bottom <= 836),
  JSON.stringify(freeState.placements));
ok('布局长按拖动期间视角、击球点、瞄准和出杆均不偷跑',
  freeState.aim === semanticBefore.aim && freeState.view === semanticBefore.view &&
    freeState.spin === semanticBefore.spin && freeState.shot === semanticBefore.shot,
  JSON.stringify({ before: semanticBefore, after: freeState }));
ok('布局拖动逐帧跟手且过程中不反复写本地存储',
  dragPerformance.distinct >= 9 && dragPerformance.writes <= 3,
  JSON.stringify({
    distinct: dragPerformance.distinct,
    writes: dragPerformance.writes,
    samples: dragPerformance.samples,
  }));

const beforeRightDockAim = await page.evaluate(() => window.__bj8.aim.current);
await longPressMove('[data-control-slot="aimDial"]', { x: 386, y: 390 });
const rightDock = await page.evaluate(() => ({
  edge: document.querySelector('[data-control-slot="aimDial"]')?.getAttribute('data-dock-edge'),
  centerY: (() => {
    const rect = document.querySelector('[data-control-slot="aimDial"]')?.getBoundingClientRect();
    return rect ? rect.top + rect.height / 2 : null;
  })(),
  orientation: document.querySelector('.aim-dial')?.getAttribute('aria-orientation'),
  aim: window.__bj8.aim.current,
}));
ok('拨轮贴近右侧后吸附、保留沿边落点并切换为竖向操作',
  rightDock.edge === 'right' && rightDock.orientation === 'vertical' &&
    rightDock.centerY !== null && Math.abs(rightDock.centerY - 390) <= 8,
  JSON.stringify(rightDock));
ok('长按吸附拨轮不改变瞄准角',
  Math.abs(rightDock.aim - beforeRightDockAim) < 1e-9,
  `${beforeRightDockAim} → ${rightDock.aim}`);
await quickMove('[data-control-slot="aimDial"] .aim-dial', 0, 30);
const verticalAim = await page.evaluate(() => window.__bj8.aim.current);
ok('右侧拨轮上下拨动仍改变世界杆向',
  Math.abs(verticalAim - rightDock.aim) > 0.001, `${rightDock.aim} → ${verticalAim}`);

await longPressMove('[data-control-slot="aimDial"]', { x: 200, y: 840 });
const bottomDock = await page.evaluate(() => ({
  edge: document.querySelector('[data-control-slot="aimDial"]')?.getAttribute('data-dock-edge'),
  orientation: document.querySelector('.aim-dial')?.getAttribute('aria-orientation'),
  aim: window.__bj8.aim.current,
  stored: JSON.parse(localStorage.getItem('guagua-billiards:control-layout:v3')),
}));
ok('拨轮贴近底部后吸附并恢复横向操作',
  bottomDock.edge === 'bottom' && bottomDock.orientation === 'horizontal',
  JSON.stringify({ edge: bottomDock.edge, orientation: bottomDock.orientation }));
await quickMove('[data-control-slot="aimDial"] .aim-dial', 30, 0);
const horizontalAim = await page.evaluate(() => window.__bj8.aim.current);
ok('底部拨轮左右拨动仍改变世界杆向',
  Math.abs(horizontalAim - bottomDock.aim) > 0.001,
  `${bottomDock.aim} → ${horizontalAim}`);
ok('v3 本地存储同时保留 desktop、portrait、landscape 三套布局',
  bottomDock.stored?.version === 3 &&
    ['desktop', 'portrait', 'landscape'].every(profile => bottomDock.stored.layouts?.[profile]),
  JSON.stringify(bottomDock.stored));

await page.screenshot({ path: `${SHOT_DIR}/44-mobile-portrait.png` });
ok('竖屏试玩无 JS 错误', errors.length === 0, errors[0] ?? '');

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
await page.close();
await browser.disconnect();
if (failed.length > 0) process.exitCode = 1;
