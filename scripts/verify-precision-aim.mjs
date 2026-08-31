/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core、__bj8 调试句柄与 Scene3D 台面↔屏幕映射
[OUTPUT]: 开球虚母球跟手/落实、默认左右键、灯泡三入口、按需拨轮、固定双档与页面稳定性断言
[POS]: “左右键默认瞄准 + 灯泡按需开启精瞄拨轮”的浏览器出口门禁
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
await page.evaluate(() => localStorage.removeItem('guagua-billiards:aim-assist:v1'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.intro-card button');

async function clickText(text) {
  const point = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, text);
  if (!point) throw new Error(`button not found: ${text}`);
  await page.mouse.click(point.x, point.y);
}

await clickText('开始对局');
await page.waitForFunction(() => window.__bj8?.match?.current?.phase === 'placing');
await wait(500);

const beforePlacement = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
ok(
  '摆球: 开球区未操作前不显示实体母球和预览球',
  !beforePlacement.realVisible && !beforePlacement.ghostVisible,
  JSON.stringify(beforePlacement),
);

const kitchen = await page.evaluate(() => window.__bj8.scene.current.tableToScreen(0.12, 0.82));
await page.mouse.move(kitchen.x, kitchen.y, { steps: 8 });
await wait(120);
const hovering = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
ok(
  '摆球: 指针在合法开球区移动时只有虚母球跟手',
  !hovering.realVisible && hovering.ghostVisible,
  JSON.stringify(hovering),
);

await page.mouse.click(kitchen.x, kitchen.y);
await page.waitForFunction(() => window.__bj8.match.current.phase === 'aiming');
await wait(220);
const placed = await page.evaluate(() => ({
  ...window.__bj8.scene.current.cuePlacementVisualState(),
  buttons: Boolean(document.querySelector('.aim-controls')),
  dial: Boolean(document.querySelector('.aim-dial')),
}));
ok(
  '摆球: 点击落实体母球后默认显示左右键而非拨轮',
  placed.realVisible && !placed.ghostVisible && placed.buttons && !placed.dial,
  JSON.stringify(placed),
);

const beforeButton = await page.evaluate(() => window.__bj8.aim.current);
await page.click('.aim-controls button:first-child');
await wait(100);
const afterButton = await page.evaluate(() => window.__bj8.aim.current);
ok(
  '默认瞄准: 球杆左键直接微调世界杆向',
  Math.atan2(Math.sin(afterButton - beforeButton), Math.cos(afterButton - beforeButton)) < 0,
  `${beforeButton} → ${afterButton}`,
);

await page.click('.plan-button');
await wait(80);
const assistMenu = await page.evaluate(() => ({
  options: document.querySelectorAll('.assist-menu .assist-option').length,
  aim: Boolean(document.querySelector('.assist-menu .aim-option')),
  plan: Boolean(document.querySelector('.assist-menu .guidance-option')),
  dial: Boolean(document.querySelector('.assist-menu .dial-option')),
}));
ok(
  '灯泡: 展开瞄准线、走位复盘、拨轮瞄准三个小入口',
  assistMenu.options === 3 && assistMenu.aim && assistMenu.plan && assistMenu.dial,
  JSON.stringify(assistMenu),
);
const predictionBefore = await page.evaluate(() => window.__bj8.scene.current.aimLine.visible);
await page.click('.assist-menu .aim-option');
await wait(100);
const predictionAfter = await page.evaluate(() => ({
  visible: window.__bj8.scene.current.aimLine.visible,
  active: document.querySelector('.assist-menu .aim-option')?.getAttribute('aria-checked'),
}));
ok(
  '灯泡: 瞄准辅助线默认关闭且可独立打开',
  !predictionBefore && predictionAfter.visible && predictionAfter.active === 'true',
  JSON.stringify({ before: predictionBefore, after: predictionAfter }),
);
await page.click('.assist-menu .aim-option');
await wait(80);
await page.click('.assist-menu .dial-option');
await wait(120);
const dialEnabled = await page.evaluate(() => ({
  buttons: Boolean(document.querySelector('.aim-controls')),
  dial: Boolean(document.querySelector('.aim-dial')),
  active: document.querySelector('.assist-menu .dial-option')?.classList.contains('active'),
}));
ok(
  '灯泡: 主动打开拨轮后以精瞄工具取代默认左右键',
  dialEnabled.dial && !dialEnabled.buttons && dialEnabled.active,
  JSON.stringify(dialEnabled),
);
await page.click('.plan-button');

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
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
}));
ok(
  '拨轮: 非袋口方向保持可见且默认不泄露目标信息',
  coarse.visible && !coarse.mode.includes('fine-ready') && !coarse.label.includes('号 →'),
  JSON.stringify(coarse),
);

const ghostScreen = await page.evaluate(
  ({ x, z }) => window.__bj8.scene.current.tableToScreen(x, z),
  setup.ghost,
);
await page.mouse.click(ghostScreen.x, ghostScreen.y);
await wait(180);
const fine = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
  ratio: (() => {
    const solution = window.__bj8.precisionAt(window.__bj8.aim.current, 8);
    return solution ? Math.abs(solution.error) / solution.halfWidth : null;
  })(),
}));
ok(
  '拨轮: 辅助关闭时对准袋口也不自动换档或显示目标袋',
  fine.visible
    && fine.ratio !== null
    && fine.ratio <= 1
    && !fine.mode.includes('fine-ready')
    && !fine.mode.includes('fine-active')
    && !fine.label.includes('1号')
    && !fine.label.includes('右中袋'),
  JSON.stringify(fine),
);

const expandedPoint = await page.evaluate(() => {
  const debug = window.__bj8;
  const centered = debug.precisionAt(debug.aim.current, 8);
  if (!centered) return null;
  const angle = centered.centerAngle + centered.halfWidth * 3.2;
  const cue = debug.world.current.balls.find((ball) => ball.number === 0);
  const distance = 0.32;
  const point = debug.scene.current.tableToScreen(
    cue.x + Math.sin(angle) * distance,
    cue.z - Math.cos(angle) * distance,
  );
  return { ...point, expectedAngle: angle };
});
if (!expandedPoint) throw new Error('expanded dial point unavailable');
// 先移开当前瞄准线，避免目标点因离中心线太近被命中判定为“抓线”而不是新幽灵球落点。
await page.mouse.click(offTarget.x, offTarget.y);
await wait(100);
const expandedHit = await page.evaluate(({ x, y }) => {
  const element = document.elementFromPoint(x, y);
  const dial = document.querySelector('.aim-dial')?.getBoundingClientRect();
  return {
    tag: element?.tagName ?? '',
    className: element?.className ?? '',
    dial: dial ? { x: dial.x, y: dial.y, right: dial.right, bottom: dial.bottom } : null,
  };
}, expandedPoint);
await page.mouse.click(expandedPoint.x, expandedPoint.y);
await wait(180);
const approach = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
  aim: window.__bj8.aim.current,
  ratio: (() => {
    const solution = window.__bj8.precisionAt(window.__bj8.aim.current, 8);
    return solution ? Math.abs(solution.error) / solution.halfWidth : null;
  })(),
}));
ok(
  '拨轮: 接近袋口只保留几何事实，不在无辅助状态自动降档',
  approach.visible
    && !approach.mode.includes('fine-ready')
    && !approach.label.includes('号 →'),
  JSON.stringify({ ...approach, expectedAngle: expandedPoint.expectedAngle, point: expandedPoint, hit: expandedHit }),
);

const dial = await page.$eval('.aim-dial-window', (element) => {
  const rect = element.getBoundingClientRect();
  return {
    normal: { x: rect.x + rect.width * 0.82, y: rect.y + rect.height / 2 },
    fine: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
  };
});
const beforeDial = await page.evaluate(() => window.__bj8.aim.current);
await page.mouse.move(dial.normal.x, dial.normal.y);
await page.mouse.down();
await page.mouse.move(dial.normal.x + 42, dial.normal.y, { steps: 12 });
await page.mouse.up();
await wait(120);
const afterDial = await page.evaluate(() => window.__bj8.aim.current);
const normalDelta = Math.atan2(Math.sin(afterDial - beforeDial), Math.cos(afterDial - beforeDial));
ok(
  '拨轮: 普通区域使用固定 900px/周传动',
  normalDelta > 0 && Math.abs(normalDelta - 42 * Math.PI * 2 / 900) < 0.015,
  `${beforeDial} → ${afterDial}（Δ=${normalDelta}）`,
);

await page.mouse.move(dial.fine.x, dial.fine.y);
await page.mouse.down();
const clutchActive = await page.$eval('.aim-dial', (element) => element.classList.contains('fine-active'));
ok('拨轮: 按住中央 64px 白线明确接合精调离合', clutchActive);
await page.mouse.move(dial.fine.x + 42, dial.fine.y, { steps: 12 });
await page.mouse.up();
await wait(120);
const afterFine = await page.evaluate(() => window.__bj8.aim.current);
const fineDelta = Math.atan2(Math.sin(afterFine - afterDial), Math.cos(afterFine - afterDial));
ok(
  '拨轮: 精调离合使用固定 12000px/周传动并在整次手势保持',
  fineDelta > 0
    && fineDelta < normalDelta / 10
    && Math.abs(fineDelta - 42 * Math.PI * 2 / 12000) < 0.006,
  `${afterDial} → ${afterFine}（普通Δ=${normalDelta}，精调Δ=${fineDelta}）`,
);

ok('拨轮: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) process.exitCode = 1;
