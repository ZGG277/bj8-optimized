/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core、__bj8 调试句柄与 Scene3D 台面↔屏幕映射
[OUTPUT]: 慢速近袋进入局部精瞄、袋口滑块连续变化、竖向退出与快速粗瞄不被吸附的真实指针断言
[POS]: 360° 粗瞄 + 目标袋口精瞄双档交互的浏览器出口门禁
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
await new Promise((resolve) => setTimeout(resolve, 500));

// 开球放置必须走真实鼠标；俯视相机稳定后把白球放在开球区。
const kitchen = await page.evaluate(() => window.__bj8.scene.current.tableToScreen(0, 0.82));
await page.mouse.click(kitchen.x, kitchen.y);
await page.waitForFunction(() => window.__bj8.match.current.phase === 'aiming');
await clickText('俯视');
await new Promise((resolve) => setTimeout(resolve, 700));

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
  window.__bj8.sync();
  return { ghost };
});
await new Promise((resolve) => setTimeout(resolve, 350));

// 点 ghost 中心建立可进右中袋的中心杆向。
const ghostScreen = await page.evaluate(
  ({ x, z }) => window.__bj8.scene.current.tableToScreen(x, z),
  setup.ghost,
);
await page.mouse.click(ghostScreen.x, ghostScreen.y);
await new Promise((resolve) => setTimeout(resolve, 250));

const linePoint = await page.evaluate(() => {
  const cue = window.__bj8.world.current.balls[0];
  const ghost = window.__bj8.scene.current.aimGhostPos();
  return window.__bj8.scene.current.tableToScreen(
    cue.x + (ghost.x - cue.x) * 0.55,
    cue.z + (ghost.z - cue.z) * 0.55,
  );
});

// 先竖向越过 8px 拖拽死区而不改变水平角，再慢速横拖进入袋口局部窗口。
await page.mouse.move(linePoint.x, linePoint.y);
await page.mouse.down();
await page.mouse.move(linePoint.x, linePoint.y + 9);
await page.mouse.move(linePoint.x + 3, linePoint.y + 9);
const entered = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.precision-aim')),
  text: document.querySelector('.precision-aim strong')?.textContent ?? '',
  marker: document.querySelector('.precision-aim-track i')?.getAttribute('style') ?? '',
}));
ok(
  '精瞄: 慢速靠近可下袋窗口后进入',
  entered.visible && entered.text.includes('1 号') && entered.text.includes('右中袋'),
  JSON.stringify(entered),
);

await page.mouse.move(linePoint.x + 15, linePoint.y + 9, { steps: 4 });
const markerAfter = await page.evaluate(
  () => document.querySelector('.precision-aim-track i')?.getAttribute('style') ?? '',
);
ok('精瞄: 横拖连续改变袋口落点', markerAfter !== entered.marker, `${entered.marker} -> ${markerAfter}`);

await page.mouse.move(linePoint.x + 15, linePoint.y + 42);
const exited = await page.evaluate(() => !document.querySelector('.precision-aim'));
ok('精瞄: 竖向移出 32px 退出到粗瞄', exited);
await page.mouse.up();

// 单次快速水平扫动跨过候选窗口，不得吸入精瞄。
const fastLine = await page.evaluate(() => {
  const cue = window.__bj8.world.current.balls[0];
  const ghost = window.__bj8.scene.current.aimGhostPos();
  return window.__bj8.scene.current.tableToScreen(
    cue.x + (ghost.x - cue.x) * 0.55,
    cue.z + (ghost.z - cue.z) * 0.55,
  );
});
const aimBeforeFast = await page.evaluate(() => window.__bj8.aim.current);
await page.mouse.move(fastLine.x, fastLine.y);
await page.mouse.down();
await page.mouse.move(fastLine.x + 80, fastLine.y);
const fastState = await page.evaluate(() => ({
  aim: window.__bj8.aim.current,
  precision: Boolean(document.querySelector('.precision-aim')),
}));
await page.mouse.up();
ok(
  '粗瞄: 快速横扫不被精瞄吸附',
  !fastState.precision && Math.abs(fastState.aim - aimBeforeFast) > 0.2,
  `before=${aimBeforeFast.toFixed(3)} after=${fastState.aim.toFixed(3)}`,
);
ok('精瞄: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) process.exitCode = 1;
