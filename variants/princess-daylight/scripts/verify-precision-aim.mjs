/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core、__bj8 调试句柄与 Scene3D 台面↔屏幕映射
[OUTPUT]: 开球白球标准位/合法点按与实体拖放/非法区域阻挡、默认瞄准线与拨轮、灯泡四入口、方向键切换、显式粗精档与页面稳定性断言
[POS]: “本地 main 视觉基线 + 拨轮默认瞄准 + 灯泡切换方向键”的浏览器出口门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  localStorage.removeItem('guagua-billiards:aim-assist:v1');
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.intro-card button');

async function clickText(text) {
  const point = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label')?.includes(label));
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, text);
  if (!point) throw new Error(`button not found: ${text}`);
  await page.mouse.click(point.x, point.y);
}

await clickText('开始对局');
await page.waitForFunction(() => window.__bj8?.match?.current?.phase === 'aiming');
await wait(500);

const beforePlacement = await page.evaluate(() => ({
  ...window.__bj8.scene.current.cuePlacementVisualState(),
  cue: (() => {
    const cue = window.__bj8.world.current.balls.find((ball) => ball.number === 0);
    return { x: cue.x, z: cue.z };
  })(),
  phase: window.__bj8.match.current.phase,
  buttons: Boolean(document.querySelector('.aim-controls')),
  dial: Boolean(document.querySelector('.aim-dial')),
  aimVisible: window.__bj8.scene.current.aimLine.visible,
}));
ok(
  '开球: 白球标准位、瞄准线与拨轮默认就绪',
  beforePlacement.phase === 'aiming' &&
    beforePlacement.realVisible &&
    !beforePlacement.ghostVisible &&
    Math.abs(beforePlacement.cue.x) < 0.000001 &&
    Math.abs(beforePlacement.cue.z - 0.635) < 0.000001 &&
    !beforePlacement.buttons &&
    beforePlacement.dial &&
    beforePlacement.aimVisible,
  JSON.stringify(beforePlacement),
);

const clickTarget = await page.evaluate(() =>
  window.__bj8.scene.current.tableToScreen(0.18, 0.88));
await page.mouse.click(clickTarget.x, clickTarget.y);
await wait(180);
const clicked = await page.evaluate(() => {
  const cue = window.__bj8.world.current.balls.find((ball) => ball.number === 0);
  return {
    x: cue.x,
    z: cue.z,
    phase: window.__bj8.match.current.phase,
    messageKey: window.__bj8.match.current.messageKey,
  };
});
ok(
  '开球: 点击其他合法开球区位置可重新放置白球',
  clicked.phase === 'aiming' &&
    clicked.messageKey === 'placed' &&
    Math.hypot(clicked.x - 0.18, clicked.z - 0.88) < 0.02,
  JSON.stringify(clicked),
);

const cueStart = await page.evaluate(() =>
  window.__bj8.scene.current.tableToScreen(0.18, 0.88));
const kitchen = await page.evaluate(() => window.__bj8.scene.current.tableToScreen(0.12, 0.82));
await page.mouse.move(cueStart.x, cueStart.y);
await page.mouse.down();
await page.mouse.move(kitchen.x, kitchen.y, { steps: 8 });
await page.mouse.up();
await wait(220);
const placed = await page.evaluate(() => ({
  ...window.__bj8.scene.current.cuePlacementVisualState(),
  cue: (() => {
    const cue = window.__bj8.world.current.balls.find((ball) => ball.number === 0);
    return { x: cue.x, z: cue.z };
  })(),
  phase: window.__bj8.match.current.phase,
}));
ok(
  '开球: 按住实体白球可拖到开球区合法位置',
  placed.phase === 'aiming' && placed.realVisible && !placed.ghostVisible &&
    Math.hypot(placed.cue.x - 0.12, placed.cue.z - 0.82) < 0.02,
  JSON.stringify(placed),
);

const illegal = await page.evaluate(() => ({
  from: window.__bj8.scene.current.tableToScreen(0.12, 0.82),
  to: window.__bj8.scene.current.tableToScreen(0.12, 0.5),
}));
await page.mouse.move(illegal.from.x, illegal.from.y);
await page.mouse.down();
await page.mouse.move(illegal.to.x, illegal.to.y, { steps: 8 });
await page.mouse.up();
await wait(180);
const blocked = await page.evaluate(() => {
  const cue = window.__bj8.world.current.balls.find((ball) => ball.number === 0);
  return { x: cue.x, z: cue.z, messageKey: window.__bj8.match.current.messageKey };
});
ok(
  '开球: 拖过开球线时保留最后合法位并提示越界',
  Math.abs(blocked.x - 0.12) < 0.02 &&
    blocked.z >= 0.635 && blocked.z < 0.82 &&
    blocked.messageKey === 'place-outside-kitchen',
  JSON.stringify(blocked),
);

// 默认拨轮；从灯泡切到方向键后再验方向键的固定步长与长按。
await page.click('.plan-button');
await wait(100);
await page.click('.assist-menu .dial-option');
await wait(140);
const directionMode = await page.evaluate(() => ({
  buttons: Boolean(document.querySelector('.aim-controls')),
  dial: Boolean(document.querySelector('.aim-dial')),
  menuOpen: Boolean(document.querySelector('.assist-menu')),
}));
ok(
  '灯泡: 可把默认拨轮切换为方向键并自动收起菜单',
  directionMode.buttons && !directionMode.dial && !directionMode.menuOpen,
  JSON.stringify(directionMode),
);

const beforeButton = await page.evaluate(() => window.__bj8.aim.current);
await page.click('.aim-controls button:first-child');
await wait(100);
const afterButton = await page.evaluate(() => window.__bj8.aim.current);
const clickDelta = Math.atan2(
  Math.sin(afterButton - beforeButton),
  Math.cos(afterButton - beforeButton),
);
ok(
  '方向键瞄准: 单击左键只走一次固定精瞄步长',
  Math.abs(clickDelta + 0.004) < 0.000001,
  `${beforeButton} → ${afterButton} (Δ=${clickDelta})`,
);

const rightButton = await page.$eval('.aim-controls button:last-child', (element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
const beforeHold = await page.evaluate(() => window.__bj8.aim.current);
await page.mouse.move(rightButton.x, rightButton.y);
await page.mouse.down();
await wait(500);
const holdDidNotDragLayout = await page.evaluate(() =>
  !document.querySelector('.control-slot-aimDial.is-dragging') &&
  !document.querySelector('.control-deck.is-layout-dragging'));
await wait(350);
await page.mouse.up();
await wait(100);
const afterHold = await page.evaluate(() => window.__bj8.aim.current);
const holdDelta = Math.atan2(
  Math.sin(afterHold - beforeHold),
  Math.cos(afterHold - beforeHold),
);
ok(
  '方向键瞄准: 长按右键不会触发控件拖位',
  holdDidNotDragLayout,
);
ok(
  '方向键瞄准: 长按右键连续移动且速度受限',
  holdDelta >= 0.016 && holdDelta <= 0.032,
  `${beforeHold} → ${afterHold} (Δ=${holdDelta})`,
);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
await wait(300);
const portraitButtons = await page.evaluate(() => {
  const controls = document.querySelector('.aim-controls');
  const rect = controls?.getBoundingClientRect();
  return {
    exists: Boolean(controls),
    display: controls ? getComputedStyle(controls).display : '',
    rect: rect ? {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    } : null,
  };
});
ok(
  '竖屏方向键瞄准: 左右键可见且完整位于视口内',
  portraitButtons.exists &&
    portraitButtons.display !== 'none' &&
    portraitButtons.rect &&
    portraitButtons.rect.left >= 0 &&
    portraitButtons.rect.top >= 0 &&
    portraitButtons.rect.right <= 390 &&
    portraitButtons.rect.bottom <= 844,
  JSON.stringify(portraitButtons),
);
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await wait(300);

await page.click('.plan-button');
await wait(100);
const assistMenu = await page.evaluate(() => ({
  options: document.querySelectorAll('.assist-menu .assist-option').length,
  aim: Boolean(document.querySelector('.assist-menu .aim-option')),
  plan: Boolean(document.querySelector('.assist-menu .guidance-option')),
  review: Boolean(document.querySelector('.assist-menu .review-option')),
  dial: Boolean(document.querySelector('.assist-menu .dial-option')),
}));
ok(
  '灯泡: 展开瞄准线、走位、复盘、瞄准器四个独立入口',
  assistMenu.options === 4 && assistMenu.aim && assistMenu.plan && assistMenu.review && assistMenu.dial,
  JSON.stringify(assistMenu),
);

await page.click('.assist-menu .dial-option');
await wait(140);
const dialEnabled = await page.evaluate(() => ({
  buttons: Boolean(document.querySelector('.aim-controls')),
  dial: Boolean(document.querySelector('.aim-dial')),
  menuOpen: Boolean(document.querySelector('.assist-menu')),
}));
ok(
  '灯泡: 可切回拨轮并原位取代方向键',
  dialEnabled.dial && !dialEnabled.buttons && !dialEnabled.menuOpen,
  JSON.stringify(dialEnabled),
);

await clickText('俯视');
await wait(700);

// 固定一颗近右中袋直线路径：目标球→右中袋沿 +x，母球从后方斜向 ghost 点。
const setup = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  for (const ball of world.balls) {
    ball.active = ball.number === 0 || ball.number === 1;
    ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
  }
  const cue = world.balls.find((ball) => ball.number === 0);
  const one = world.balls.find((ball) => ball.number === 1);
  cue.x = 0;
  cue.z = 0.55;
  one.x = 0.3;
  one.z = 0;
  const radius = 0.028575;
  const ghost = { x: one.x - radius * 2, z: 0 };
  window.__bj8.setMatch({ breaking: false });
  window.__bj8.sync();
  return { ghost };
});
await wait(350);

const offTarget = await page.evaluate(() => {
  const cue = window.__bj8.world.current.balls.find((ball) => ball.number === 0);
  const angle = Math.atan2(0.3 - 0.05715 - cue.x, -(0 - cue.z)) - 0.24;
  // 取母球前方较近点，避免屏幕落点被底部拨轮自身覆盖。
  const distance = 0.32;
  return window.__bj8.scene.current.tableToScreen(
    cue.x + Math.sin(angle) * distance,
    cue.z - Math.cos(angle) * distance,
  );
});
await page.mouse.click(offTarget.x, offTarget.y);
await wait(150);
const coarse = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
}));
ok(
  '拨轮: 幽灵球落在非袋口候选方向也保持可见粗档',
  coarse.visible && coarse.mode.includes('coarse'),
  JSON.stringify(coarse),
);

const ghostScreen = await page.evaluate(
  ({ x, z }) => window.__bj8.scene.current.tableToScreen(x, z),
  setup.ghost,
);
await page.mouse.click(ghostScreen.x, ghostScreen.y);
await wait(180);
const nearPocket = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
}));
ok(
  '拨轮: 合法幽灵球落位后仍保持粗档，不自动探测袋口切档',
  nearPocket.visible &&
    nearPocket.mode.includes('coarse') &&
    nearPocket.label.includes('轻点启用精瞄'),
  JSON.stringify(nearPocket),
);

const dialCenter = await page.$eval('.aim-dial', (element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
await page.mouse.click(dialCenter.x, dialCenter.y);
await wait(120);
const manualFine = await page.evaluate(() => ({
  mode: document.querySelector('.aim-dial')?.className ?? '',
  active: document.querySelector('.aim-dial')?.getAttribute('data-precision-active'),
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
}));
ok(
  '拨轮: 轻点后才显式进入精瞄档',
  manualFine.mode.includes('fine') &&
    manualFine.active === 'true' &&
    manualFine.label.includes('精瞄已启用'),
  JSON.stringify(manualFine),
);

const dial = await page.$eval('.aim-dial', (element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width * 0.65, y: rect.y + rect.height / 2 };
});
const beforeDial = await page.evaluate(() => window.__bj8.aim.current);
await page.mouse.move(dial.x, dial.y);
await page.mouse.down();
await page.mouse.move(dial.x + 42, dial.y, { steps: 12 });
await page.mouse.up();
await wait(120);
const afterDial = await page.evaluate(() => window.__bj8.aim.current);
ok(
  '拨轮: 手动精瞄后横向拨动以固定低速改变唯一世界杆向',
  afterDial > beforeDial && afterDial - beforeDial < 0.08,
  `${beforeDial} → ${afterDial}`,
);

ok('拨轮: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) process.exitCode = 1;
