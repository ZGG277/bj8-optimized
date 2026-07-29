/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core、__bj8 调试句柄与 Scene3D 台面↔屏幕映射
[OUTPUT]: 开球虚母球跟手/落实、拨轮无条件呼出、360° 连续拨动、近袋平滑降档与页面稳定性断言
[POS]: “摆球/幽灵球落位即显示无限拨轮 + 延长线近袋连续提精度”的浏览器出口门禁
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
  dial: Boolean(document.querySelector('.aim-dial')),
  dialMode: document.querySelector('.aim-dial')?.className ?? '',
}));
ok(
  '摆球: 点击落实体母球并立即呼出拨轮',
  placed.realVisible && !placed.ghostVisible && placed.dial,
  JSON.stringify(placed),
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
const fine = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
}));
ok(
  '拨轮: 合法幽灵球落位后进入右中袋精瞄档',
  fine.visible && fine.mode.includes('fine') && fine.label.includes('1号') && fine.label.includes('右中袋'),
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
  aim: window.__bj8.aim.current,
  ratio: (() => {
    const solution = window.__bj8.precisionAt(window.__bj8.aim.current, 8);
    return solution ? Math.abs(solution.error) / solution.halfWidth : null;
  })(),
}));
ok(
  '拨轮: 旧精瞄窗外的扩大接近区进入平滑降档',
  approach.visible && approach.mode.includes('approach'),
  JSON.stringify({ ...approach, expectedAngle: expandedPoint.expectedAngle, point: expandedPoint, hit: expandedHit }),
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
  '拨轮: 横向拨动平滑改变唯一世界杆向',
  afterDial > beforeDial && afterDial - beforeDial < 0.2,
  `${beforeDial} → ${afterDial}`,
);

ok('拨轮: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) process.exitCode = 1;
