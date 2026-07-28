/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 390×844 竖屏单手布局、桌内瞄准、击球点弹层、长行程出杆、灯泡总开关与浮层拖拽断言及截图
[POS]: v1.2.0 手机竖屏核心交互的浏览器出口验收门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9334';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5200/';
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

async function tap(selector) {
  const point = await page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(point.x, point.y);
}

await tap('.start-btn');
await wait(800);

if (await page.evaluate(() => window.__bj8?.match?.current?.phase === 'placing')) {
  const candidates = await page.$eval('.viewport', element => {
    const rect = element.getBoundingClientRect();
    return [0.74, 0.8, 0.86].map(y => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height * y }));
  });
  for (const point of candidates) {
    await page.touchscreen.tap(point.x, point.y);
    await wait(300);
    if (await page.evaluate(() => window.__bj8?.match?.current?.phase !== 'placing')) break;
  }
}

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
    deck: box('.control-deck'),
    bulb: box('.plan-button'),
    spin: box('.spin-preview'),
    shoot: box('.shoot-pad'),
    nudges: [...document.querySelectorAll('.table-aim-nudges button')].map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }),
    coachCount: document.querySelectorAll('.coach-card,.match-message').length,
    separateMeterCount: document.querySelectorAll('.power-meter,.power-meter-track').length,
  };
});

ok('顶部产品栏完全移除', layout.header?.display === 'none', JSON.stringify(layout.header));
ok('顶部状态压到 34px 单行', layout.scoreboard?.height <= 35 && layout.status?.height <= 35,
  `score=${layout.scoreboard?.height} status=${layout.status?.height}`);
ok('球组/进球状态首行完整无横向溢出', layout.statusScrollWidth <= layout.statusClientWidth + 1,
  `${layout.statusScrollWidth}/${layout.statusClientWidth}`);
ok('球桌吃满顶部状态以下空间', layout.table?.y <= 35 && layout.table?.bottom >= 843,
  JSON.stringify(layout.table));
ok('视角位于球桌右上且可单手命中', layout.view?.right <= 390 && layout.view?.x >= 318 && layout.view?.height >= 80,
  JSON.stringify(layout.view));
ok('右侧控制轨不占布局行', layout.deck?.x >= 320 && layout.deck?.bottom <= 844,
  JSON.stringify(layout.deck));
ok('灯泡为紧凑 48px 触控目标', layout.bulb?.width >= 44 && layout.bulb?.width <= 52 && layout.bulb?.height >= 44,
  JSON.stringify(layout.bulb));
ok('力度与出杆已合并为单控件', layout.separateMeterCount === 0, `separate=${layout.separateMeterCount}`);
ok('出杆有效控件高度不少于 196px', layout.shoot?.height >= 196, JSON.stringify(layout.shoot));
ok('解说区与解说浮层已删除', layout.coachCount === 0, `count=${layout.coachCount}`);
ok('桌内微调三角均为 ≥52px 命中区', layout.nudges.length === 2 && layout.nudges.every(item => item.width >= 52 && item.height >= 52),
  JSON.stringify(layout.nudges));
ok('方向触控全部位于球桌范围内', layout.nudges.every(item =>
  item.x >= layout.viewport.x && item.right <= layout.viewport.right &&
  item.y >= layout.viewport.y && item.bottom <= layout.viewport.bottom),
JSON.stringify(layout.nudges));

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

const aimBefore = await page.evaluate(() => window.__bj8.aim.current);
await tap('.aim-nudge-right');
await wait(120);
const aimAfter = await page.evaluate(() => window.__bj8.aim.current);
ok('桌内三角真实微调世界杆向', aimAfter > aimBefore, `${aimBefore} → ${aimAfter}`);

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
await page.screenshot({ path: 'shots/45-mobile-spin-expanded.png' });

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
  await page.screenshot({ path: 'shots/46-mobile-plan-float.png' });
  await tap('.plan-button');
  await wait(100);
  ok('灯泡熄灭同时收起提示区域', await page.$eval('.plan-button', () =>
    !document.querySelector('.plan-bar') && !document.querySelector('.review-float')));
}

// 规划关闭会从俯视平滑恢复杆后视角；等相机稳定后再取视觉基线，避免把过渡帧误判为空间浪费。
await wait(1500);
await page.screenshot({ path: 'shots/44-mobile-portrait.png' });

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
const peak = await page.$eval('.power-num', element => Number(element.textContent));
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

const reviewAppeared = await page.waitForSelector('.review-float', { timeout: 30000 }).then(() => true).catch(() => false);
ok('玩家杆结束后出现紧凑复盘浮层', reviewAppeared);
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
  await page.screenshot({ path: 'shots/47-mobile-review-float.png' });
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
