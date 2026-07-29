/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 390×844 竖屏单手布局、开球落位拨轮、长行程视角推杆、击球点弹层、出杆、灯泡与浮层拖拽断言及截图
[POS]: v1.2.0 手机竖屏核心交互的浏览器出口验收门禁
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
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('bj8-control-y:')) localStorage.removeItem(key);
  }
});
await page.reload({ waitUntil: 'networkidle0' });

async function tap(selector) {
  const point = await page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(point.x, point.y);
}

await tap('.start-btn');
await wait(800);

let placementBefore = null;
let placementDuring = null;
if (await page.evaluate(() => window.__bj8?.match?.current?.phase === 'placing')) {
  placementBefore = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
  const candidates = await page.$eval('.viewport', element => {
    const rect = element.getBoundingClientRect();
    return [0.74, 0.8, 0.86].map(y => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height * y }));
  });
  await page.touchscreen.touchStart(candidates[0].x - 18, candidates[0].y);
  await page.touchscreen.touchMove(candidates[0].x + 18, candidates[0].y);
  await wait(120);
  placementDuring = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
  await page.touchscreen.touchEnd();
  await wait(300);
  for (const point of candidates.slice(1)) {
    await wait(300);
    if (await page.evaluate(() => window.__bj8?.match?.current?.phase !== 'placing')) break;
    await page.touchscreen.tap(point.x, point.y);
  }
}

ok('手机开球初始不显示实体母球', placementBefore && !placementBefore.realVisible && !placementBefore.ghostVisible,
  JSON.stringify(placementBefore));
ok('手机拖动摆球时虚母球跟手且实体母球保持隐藏',
  placementDuring && placementDuring.ghostVisible && !placementDuring.realVisible,
  JSON.stringify(placementDuring));

const layout = await page.evaluate(() => {
  const box = selector => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom, display: style.display,
    };
  };
  const status = document.querySelector('.mobile-ball-status');
  return {
    header: box('.topbar'),
    scoreboard: box('.scoreboard'),
    status: box('.mobile-ball-status'),
    statusScrollWidth: status?.scrollWidth ?? 0,
    statusClientWidth: status?.clientWidth ?? 0,
    table: box('.table-stage'),
    viewport: box('.viewport'),
    view: box('.view-switcher'),
    viewTrack: box('.view-slider-track'),
    viewValue: document.querySelector('.view-slider-track')?.getAttribute('aria-valuetext'),
    deck: box('.control-deck'),
    rail: box('.control-rail'),
    slots: [...document.querySelectorAll('.control-slot')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-control-slot'),
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom,
      };
    }),
    bulb: box('.plan-button'),
    spin: box('.spin-preview'),
    shoot: box('.shoot-pad'),
    dial: box('.aim-dial'),
    dialText: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
    coachCount: document.querySelectorAll('.coach-card,.match-message').length,
    separateMeterCount: document.querySelectorAll('.power-meter,.power-meter-track').length,
    gripCount: document.querySelectorAll('.control-slot-grip').length,
    powerNumberCount: document.querySelectorAll('.power-num').length,
    meterCount: document.querySelectorAll('[role="meter"][aria-label="出杆力度"]').length,
  };
});

ok('顶部产品栏从 DOM 完全移除', layout.header === null, JSON.stringify(layout.header));
ok('顶部状态压到 34px 单行', layout.scoreboard?.height <= 35 && layout.status?.height <= 35,
  `score=${layout.scoreboard?.height} status=${layout.status?.height}`);
ok('球组/进球状态首行完整无横向溢出', layout.statusScrollWidth <= layout.statusClientWidth + 1,
  `${layout.statusScrollWidth}/${layout.statusClientWidth}`);
ok('球桌吃满顶部状态以下空间', layout.table?.y <= 35 && layout.table?.bottom >= 843,
  JSON.stringify(layout.table));
ok('视角位于右上且为长行程竖向推杆', layout.view?.right <= 390 && layout.view?.x >= 320
  && layout.view?.height >= 196 && layout.viewTrack?.height >= 120,
  JSON.stringify(layout.view));
ok('右侧控制轨固定为 54px 窄列', layout.rail?.width === 54 && layout.rail?.x >= 320 && layout.rail?.bottom <= 844,
  JSON.stringify(layout.rail));
ok('四个主控宽度一致', [layout.view, layout.bulb, layout.spin, layout.shoot].every(item => item?.width === 54),
  JSON.stringify({ view: layout.view?.width, bulb: layout.bulb?.width, spin: layout.spin?.width, shoot: layout.shoot?.width }));
ok('球桌为右侧控制轨预留空间', layout.viewport?.right <= layout.rail?.x - 4,
  `${layout.viewport?.right}/${layout.rail?.x}`);
ok('灯泡为紧凑 48px 高触控目标', layout.bulb?.width === 54 && layout.bulb?.height >= 44,
  JSON.stringify(layout.bulb));
ok('开球控件只显示颜色力度条而不显示数字', layout.powerNumberCount === 0 && layout.meterCount === 1,
  `number=${layout.powerNumberCount} meter=${layout.meterCount}`);
ok('力度与出杆已合并为单控件', layout.separateMeterCount === 0, `separate=${layout.separateMeterCount}`);
ok('出杆有效控件高度不少于 196px', layout.shoot?.height >= 196, JSON.stringify(layout.shoot));
ok('视角推杆与出杆区行程等长', Math.abs(layout.view?.height - layout.shoot?.height) <= 1,
  `${layout.view?.height}/${layout.shoot?.height}`);
ok('解说区与解说浮层已删除', layout.coachCount === 0, `count=${layout.coachCount}`);
ok('开球母球落位后立即显示横向拨轮', layout.dial?.width >= 200 && layout.dial?.height >= 50,
  JSON.stringify({ dial: layout.dial, text: layout.dialText }));
ok('拨轮完全位于球桌触控区域内', layout.dial?.x >= layout.viewport?.x && layout.dial?.right <= layout.viewport?.right,
  JSON.stringify({ dial: layout.dial, viewport: layout.viewport }));
ok('四个控件不再各自显示拖动点', layout.gripCount === 0, `grips=${layout.gripCount}`);

const dialStartAim = await page.evaluate(() => window.__bj8.aim.current);
await page.touchscreen.touchStart(layout.dial.x + layout.dial.width * 0.6, layout.dial.y + layout.dial.height / 2);
await page.touchscreen.touchMove(layout.dial.x + layout.dial.width * 0.78, layout.dial.y + layout.dial.height / 2);
await page.touchscreen.touchEnd();
await wait(160);
const dialEndAim = await page.evaluate(() => window.__bj8.aim.current);
ok('手机触摸横拨真实改变击球方向', Math.abs(dialEndAim - dialStartAim) > 0.001,
  `${dialStartAim} → ${dialEndAim}`);

// 真实推拉视角杆：推到顶切俯视，拉到底回第一人称。
const viewTrackPoint = {
  x: layout.viewTrack.x + layout.viewTrack.width / 2,
  top: layout.viewTrack.y + 8,
  bottom: layout.viewTrack.bottom - 8,
};
await page.touchscreen.touchStart(viewTrackPoint.x, viewTrackPoint.bottom);
await page.touchscreen.touchMove(viewTrackPoint.x, viewTrackPoint.top);
await page.touchscreen.touchEnd();
await wait(220);
const pushedUp = await page.evaluate(() => ({
  value: document.querySelector('.view-slider-track')?.getAttribute('aria-valuetext'),
  overhead: document.querySelector('.viewport')?.classList.contains('overhead'),
}));
ok('视角推杆推到顶端切换俯视', pushedUp.value === '俯视' && pushedUp.overhead, JSON.stringify(pushedUp));

await page.touchscreen.touchStart(viewTrackPoint.x, viewTrackPoint.top);
await page.touchscreen.touchMove(viewTrackPoint.x, viewTrackPoint.bottom);
await page.touchscreen.touchEnd();
await wait(220);
const pulledDown = await page.evaluate(() => ({
  value: document.querySelector('.view-slider-track')?.getAttribute('aria-valuetext'),
  first: !document.querySelector('.viewport')?.classList.contains('overhead'),
}));
ok('视角推杆拉到底端切换第一人称', pulledDown.value === '第一人称' && pulledDown.first,
  JSON.stringify(pulledDown));

// 长按整条黑色控制轨进入统一编辑态，四块一起抖动。
const railHold = {
  x: layout.rail.x + layout.rail.width / 2,
  y: layout.rail.bottom - 24,
};
await page.touchscreen.touchStart(railHold.x, railHold.y);
await wait(480);
await page.touchscreen.touchEnd();
await wait(80);
const editState = await page.evaluate(() => ({
  editing: document.querySelector('.control-rail')?.getAttribute('data-layout-editing'),
  animated: [...document.querySelectorAll('.control-slot-body')]
    .every(element => getComputedStyle(element).animationName.includes('control-slot-wiggle')),
}));
ok('长按右侧黑条后四个控件一起进入抖动编辑态',
  editState.editing === 'true' && editState.animated, JSON.stringify(editState));

// 编辑态下四块分别移动，同时保留互不遮挡的可用间距。
const slotDeltas = { view: 4, guidance: 10, spin: 20, shoot: 30 };
const slotsBefore = Object.fromEntries(layout.slots.map(slot => [slot.id, slot]));
for (const [id, delta] of Object.entries(slotDeltas)) {
  const slotPoint = await page.$eval(`[data-control-slot="${id}"]`, element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.touchStart(slotPoint.x, slotPoint.y);
  await page.touchscreen.touchMove(slotPoint.x, slotPoint.y + delta);
  await page.touchscreen.touchEnd();
  await wait(80);
}
const slotsAfter = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.control-slot')].map(element => {
    const rect = element.getBoundingClientRect();
    return [element.getAttribute('data-control-slot'), {
      x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
    }];
  }),
));
ok('编辑态下四个操控区都可直接上下拖动',
  Object.entries(slotDeltas).every(([id, delta]) =>
    Math.abs(slotsAfter[id].y - slotsBefore[id].y - delta) < 2),
  JSON.stringify(slotsAfter));
ok('四个控件始终限制在黑色控制轨内且不发生横向漂移',
  Object.values(slotsAfter).every(slot =>
    slot.x >= layout.rail.x && slot.y >= layout.rail.y
      && slot.right <= layout.rail.right && slot.bottom <= layout.rail.bottom),
  JSON.stringify(slotsAfter));

// 点击非右侧区域只锁定布局，不把这次点击透传成瞄准操作。
const aimBeforeLock = await page.evaluate(() => window.__bj8.aim.current);
await page.touchscreen.tap(Math.max(24, layout.viewport.x + 40), layout.viewport.y + layout.viewport.height / 2);
await wait(100);
const lockedState = await page.evaluate(() => ({
  editing: document.querySelector('.control-rail')?.getAttribute('data-layout-editing'),
  aim: window.__bj8.aim.current,
  storedPositions: Object.keys(localStorage).filter(key => key.startsWith('bj8-control-y:v2:')).length,
  slots: Object.fromEntries([...document.querySelectorAll('.control-slot')].map(element => {
    const rect = element.getBoundingClientRect();
    return [element.getAttribute('data-control-slot'), rect.y];
  })),
}));
ok('点击非右侧区域后锁定四个控件的相对位置',
  lockedState.editing === 'false' && lockedState.storedPositions === 4
    && Object.entries(slotsAfter).every(([id, slot]) => Math.abs(lockedState.slots[id] - slot.y) < 1),
  JSON.stringify(lockedState));
ok('退出布局的点击不会误触球桌瞄准', Math.abs(lockedState.aim - aimBeforeLock) < 1e-9,
  `${aimBeforeLock} → ${lockedState.aim}`);

await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const one = world.balls.find(ball => ball.number === 1);
  if (one) one.active = false;
  window.__bj8.setMatch({ breaking: false, playerGroup: 'solid' });
  window.__bj8.sync();
});
await wait(100);
const groupedStatus = await page.evaluate(() => ({
  label: document.querySelector('.mobile-ball-status strong')?.textContent ?? '',
  balls: document.querySelectorAll('.mobile-ball-rack .mini-ball').length,
  down: document.querySelectorAll('.mobile-ball-rack .mini-ball.down').length,
  scroll: document.querySelector('.mobile-ball-status')?.scrollWidth ?? 0,
  client: document.querySelector('.mobile-ball-status')?.clientWidth ?? 0,
}));
ok('分组后首行完整展示本组 7 球与 8 号', groupedStatus.label === '全色球' && groupedStatus.balls === 8,
  JSON.stringify(groupedStatus));
ok('已进球变灰且分组状态仍不溢出', groupedStatus.down >= 1 && groupedStatus.scroll <= groupedStatus.client + 1,
  JSON.stringify(groupedStatus));

await tap('.spin-preview');
await wait(120);
const spinOpen = await page.evaluate(() => {
  const popover = document.querySelector('.spin-popover')?.getBoundingClientRect();
  const ball = document.querySelector('.mobile-spin-pad .spin-ball')?.getBoundingClientRect();
  return {
    popover: popover && { x: popover.x, y: popover.y, right: popover.right, bottom: popover.bottom },
    ball: ball && { width: ball.width, height: ball.height },
  };
});
ok('小母球可展开为大击球点盘', spinOpen.ball?.width >= 120 && spinOpen.ball?.height >= 120,
  JSON.stringify(spinOpen));
ok('大击球点盘不覆盖右侧出杆区', spinOpen.popover?.right <= layout.shoot.x,
  JSON.stringify(spinOpen.popover));
await page.screenshot({ path: `${SHOT_DIR}/45-mobile-spin-expanded.png` });

const spinBall = await page.$eval('.mobile-spin-pad .spin-ball', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.2 };
});
await page.touchscreen.tap(spinBall.x, spinBall.y);
await wait(120);
const spinSet = await page.evaluate(() => document.querySelector('.spin-preview')?.getAttribute('aria-label') ?? '');
ok('大母球点选可设置杆法', spinSet.includes('高杆'), spinSet);
await tap('.spin-popover-head button');

// 固定成可连续规划的四球局面，避免开球阶段本来就没有走位方案。
await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const placements = [
    { n: 0, x: 0, z: 0.55 },
    { n: 1, x: 0.5, z: 0 },
    { n: 2, x: -0.5, z: 0 },
    { n: 3, x: 0.45, z: 1.05 },
  ];
  const map = new Map(placements.map(item => [item.n, item]));
  for (const ball of world.balls) {
    const placement = map.get(ball.number);
    if (placement) Object.assign(ball, { ...placement, active: true });
    else Object.assign(ball, { active: false, x: 0, z: 0 });
    Object.assign(ball, { vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
  }
  world.moving = false;
  world.events = [];
  world.firstContact = null;
  window.__bj8.sync();
});

let planBefore = null;
const planDeadline = Date.now() + 30000;
while (!planBefore && Date.now() < planDeadline) {
  const bulbEnabled = await page.$eval('.plan-button', button => !button.disabled);
  if (bulbEnabled) {
    await tap('.plan-button');
    await wait(180);
    planBefore = await page.$eval('.plan-bar', element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, right: rect.right };
    }).catch(() => null);
  }
  if (!planBefore) await wait(180);
}
ok('灯泡在提示可用时可点击', Boolean(planBefore));
if (planBefore) {
  ok('灯泡点亮显示紧凑走位浮层', !!planBefore && planBefore.right <= 306, JSON.stringify(planBefore));
  const planPresentation = await page.evaluate(() => ({
    plans: document.querySelectorAll('.plan-bar').length,
    steps: document.querySelectorAll('.plan-step-tabs button').length,
    chips: document.querySelectorAll('.plan-bar-chips .plan-chip').length,
    play: document.querySelectorAll('.plan-bar-play').length,
  }));
  ok('只展示最高概率方案且默认仅一杆路线',
    planPresentation.plans === 1 && planPresentation.steps >= 1 &&
    planPresentation.steps <= 3 && planPresentation.chips === 1 && planPresentation.play === 0,
    JSON.stringify(planPresentation));
  const handle = await page.$eval('.plan-bar .overlay-drag-handle', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.touchStart(handle.x, handle.y);
  await page.touchscreen.touchMove(handle.x + 34, handle.y + 74);
  await page.touchscreen.touchEnd();
  await wait(100);
  const planAfter = await page.$eval('.plan-bar', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y };
  });
  ok('走位浮层可拖动且仍留在视口', planAfter.x > planBefore.x + 20 && planAfter.y > planBefore.y + 40,
    `${JSON.stringify(planBefore)} → ${JSON.stringify(planAfter)}`);
  await page.screenshot({ path: `${SHOT_DIR}/46-mobile-plan-float.png` });
  await tap('.plan-button');
  await wait(100);
  ok('灯泡熄灭同时收起提示区域', await page.$eval('.plan-button', () =>
    !document.querySelector('.plan-bar') && !document.querySelector('.review-float')));
}

// 规划关闭会从俯视平滑恢复杆后视角；等相机稳定后再取视觉基线，避免把过渡帧误判为空间浪费。
await wait(1500);
await page.screenshot({ path: `${SHOT_DIR}/44-mobile-portrait.png` });

// 出杆前重新设为高杆，确认物理确认击球后自动复位并自动收起大母球。
await tap('.spin-preview');
await wait(80);
const shotSpinBall = await page.$eval('.mobile-spin-pad .spin-ball', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.2 };
});
await page.touchscreen.tap(shotSpinBall.x, shotSpinBall.y);
await tap('.spin-popover-head button');

const shoot = await page.$eval('.shoot-pad', element => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, startY: rect.top + 30, endY: window.innerHeight - 2 };
});
await page.touchscreen.touchStart(shoot.x, shoot.startY);
for (let index = 1; index <= 8; index += 1) {
  await page.touchscreen.touchMove(shoot.x, shoot.startY + (shoot.endY - shoot.startY) * index / 8);
}
const peak = await page.$eval('[role="meter"][aria-label="出杆力度"]',
  element => Number(element.getAttribute('aria-valuenow')));
await page.touchscreen.touchEnd();
ok('长行程下拉可连续控制并达到满力', peak >= 95, `peak=${peak}`);
await page.waitForFunction(() => window.__bj8.world.current.shot >= 1, { timeout: 8000 }).catch(() => {});
const postShot = await page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  spinLabel: document.querySelector('.spin-preview')?.getAttribute('aria-label') ?? '',
  popover: Boolean(document.querySelector('.spin-popover')),
}));
ok('出杆成功', postShot.shot >= 1, JSON.stringify(postShot));
ok('击球后杆法自动回中并收起大母球', postShot.spinLabel.includes('中杆') && !postShot.popover,
  JSON.stringify(postShot));

await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 }).catch(() => {});
await wait(300);
const reviewStayedHidden = !await page.$('.review-float');
ok('击球结束后复盘不会主动弹出', reviewStayedHidden);
const reviewBulbReady = await page.$eval('.plan-button', button => {
  const style = getComputedStyle(button);
  return style.visibility === 'visible' && !button.disabled && button.getAttribute('aria-pressed') === 'false';
}).catch(() => false);
if (reviewBulbReady) await tap('.plan-button');
await wait(120);
const reviewAppeared = Boolean(await page.$('.review-float'));
ok('再次点亮灯泡后才显示复盘信息', reviewBulbReady && reviewAppeared);
if (reviewAppeared) {
  // 停住对手调度，隔离验证复盘自身的拖拽与灯泡总开关。
  await page.evaluate(() => window.__bj8.setMatch({ actor: 'player', phase: 'aiming' }));
  await wait(80);
  const before = await page.$eval('.review-float', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right };
  });
  const handle = await page.$eval('.review-float .overlay-drag-handle', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.touchStart(handle.x, handle.y);
  await page.touchscreen.touchMove(handle.x + 28, handle.y + 86);
  await page.touchscreen.touchEnd();
  await wait(100);
  const after = await page.$eval('.review-float', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right };
  });
  ok('复盘浮层可拖动且避开右侧控制轨', after.x > before.x + 18 && after.y > before.y + 50 && after.right <= 382,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await page.screenshot({ path: `${SHOT_DIR}/47-mobile-review-float.png` });
  const bulbVisible = await page.$eval('.plan-button', button => {
    const style = getComputedStyle(button);
    return style.visibility === 'visible' && !button.disabled;
  });
  ok('有复盘时灯泡始终可用', bulbVisible);
  if (bulbVisible) await tap('.plan-button');
  await wait(100);
  ok('熄灭灯泡收起复盘浮层', !await page.$('.review-float'));
}

ok('竖屏试玩无 JS 错误', errors.length === 0, errors[0] ?? '');
const failed = results.filter(result => !result.pass).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
await page.close();
process.exit(failed ? 1 : 0);
