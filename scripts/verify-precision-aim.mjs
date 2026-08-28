/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core、__bj8 调试句柄与 Scene3D 台面↔屏幕映射
[OUTPUT]: 开球虚母球跟手/落实、拨轮无条件呼出、默认精瞄、近袋不自动变档、轻点粗精切换与页面稳定性断言
[POS]: “摆球后显示无限拨轮 + 默认固定精瞄档仍可手动切换”的浏览器出口门禁
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
await page.waitForFunction(() => window.__bj8?.match?.current?.phase === 'placing');
await wait(500);

const beforePlacement = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
ok(
  '摆球: 开球区未操作前不显示实体母球和预览球',
  !beforePlacement.realVisible && !beforePlacement.ghostVisible,
  JSON.stringify(beforePlacement),
);

const kitchen = await page.evaluate(() => {
  const debug = window.__bj8;
  const level = Number(document.querySelector('.viewport')?.dataset.viewLevel);
  return {
    start: debug.scene.current.tableToScreenAt(
      0.04,
      0.92,
      debug.cameraViewAzimuth.current,
      level,
    ),
    end: debug.scene.current.tableToScreenAt(
      0.12,
      0.82,
      debug.cameraViewAzimuth.current,
      level,
    ),
  };
});
await page.mouse.move(kitchen.start.x, kitchen.start.y);
await page.mouse.down();
await page.mouse.move(kitchen.end.x, kitchen.end.y, { steps: 8 });
await wait(120);
const hovering = await page.evaluate(() => window.__bj8.scene.current.cuePlacementVisualState());
ok(
  '摆球: 按下拖入合法开球区时只有虚母球跟手',
  !hovering.realVisible && hovering.ghostVisible,
  JSON.stringify(hovering),
);

await page.mouse.up();
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

await clickText('进入全台观察');
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
  const level = Number(document.querySelector('.viewport')?.dataset.viewLevel);
  return window.__bj8.scene.current.tableToScreenAt(
    cue.x + Math.sin(angle) * distance,
    cue.z - Math.cos(angle) * distance,
    window.__bj8.cameraViewAzimuth.current,
    level,
  );
});
await page.mouse.click(offTarget.x, offTarget.y);
await wait(850);
const defaultFine = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.aim-dial')),
  mode: document.querySelector('.aim-dial')?.className ?? '',
}));
ok(
  '拨轮: 幽灵球落在非袋口候选方向也保持默认精瞄',
  defaultFine.visible && defaultFine.mode.includes('fine'),
  JSON.stringify(defaultFine),
);

const ghostScreen = await page.evaluate(
  ({ x, z }) => {
    const debug = window.__bj8;
    const level = Number(document.querySelector('.viewport')?.dataset.viewLevel);
    return debug.scene.current.tableToScreenAt(
      x,
      z,
      debug.cameraViewAzimuth.current,
      level,
    );
  },
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
  '拨轮: 合法幽灵球落位后仍保持精瞄，不自动探测袋口变档',
  nearPocket.visible &&
    nearPocket.mode.includes('fine') &&
    nearPocket.label.includes('精瞄已启用'),
  JSON.stringify(nearPocket),
);

const dialCenter = await page.$eval('.aim-dial', (element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
await page.mouse.click(dialCenter.x, dialCenter.y);
await wait(120);
const manualCoarse = await page.evaluate(() => ({
  mode: document.querySelector('.aim-dial')?.className ?? '',
  active: document.querySelector('.aim-dial')?.getAttribute('data-precision-active'),
  label: document.querySelector('.aim-dial')?.getAttribute('aria-valuetext') ?? '',
}));
ok(
  '拨轮: 轻点可显式退出默认精瞄档',
  manualCoarse.mode.includes('coarse') &&
    manualCoarse.active === 'false' &&
    manualCoarse.label.includes('轻点启用精瞄'),
  JSON.stringify(manualCoarse),
);

// 再轻点恢复默认精瞄，以固定低速验证拨动传动。
await page.mouse.click(dialCenter.x, dialCenter.y);
await wait(120);

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
  '拨轮: 默认精瞄恢复后横向拨动以固定低速改变唯一世界杆向',
  afterDial > beforeDial && afterDial - beforeDial < 0.08,
  `${beforeDial} → ${afterDial}`,
);

ok('拨轮: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length > 0) process.exitCode = 1;
