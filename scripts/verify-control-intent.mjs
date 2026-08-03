/*
[INPUT]: 依赖已启动的本地游戏页、Chrome/Chromium 与 puppeteer-core
[OUTPUT]: 从灯泡显式开启拨轮后，真实触摸回归瞄准拨动不触发布局拖位、蓄力移出取消与正常出杆
[POS]: 控件手势意图互斥的真实浏览器出口验收
[PROTOCOL]: 瞄准长按、蓄力取消走廊或调试句柄变化时同步更新本文件与 scripts/CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let browser;
try {
browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });
await page.waitForSelector('.start-btn', { timeout: 10000 });
await page.click('.start-btn');
await page.waitForFunction(() => window.__bj8?.match?.current?.phase === 'aiming');
await wait(300);
await page.waitForFunction(() => document.querySelector('[data-control-slot="aimDial"]'), {
  timeout: 10000,
});

// 产品默认使用球杆左右键；真实拨轮验收必须沿用户入口从灯泡菜单显式开启。
await page.click('button[aria-label="打开辅助功能"]');
await page.waitForSelector('button[aria-label="拨轮瞄准"]', { timeout: 5000 });
await page.click('button[aria-label="拨轮瞄准"]');
await page.waitForFunction(
  () => document.querySelector('[data-control-slot="aimDial"] .aim-dial'),
  { timeout: 5000 },
);

const stagePlayerAim = async () => {
  await page.evaluate(() => {
    const world = window.__bj8.world.current;
    for (const ball of world.balls) {
      ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
    }
    const cue = world.balls.find(ball => ball.number === 0);
    if (cue) Object.assign(cue, { active: true, x: 0, z: 0.55 });
    world.moving = false;
    window.__bj8.setMatch({
      phase: 'aiming',
      actor: 'player',
      breaking: false,
      winner: null,
    });
    window.__bj8.sync();
  });
  await wait(180);
};

await stagePlayerAim();
const aimBefore = await page.evaluate(() => {
  const slot = document.querySelector('[data-control-slot="aimDial"]');
  const dial = slot.querySelector('.aim-dial');
  const rect = slot.getBoundingClientRect();
  const dialRect = dial.getBoundingClientRect();
  return {
    aim: window.__bj8.aim.current,
    slot: { x: rect.x, y: rect.y },
    dial: { x: dialRect.x, y: dialRect.y, width: dialRect.width, height: dialRect.height },
    vertical: dial.classList.contains('is-vertical'),
  };
});
const aimStart = {
  x: aimBefore.dial.x + aimBefore.dial.width / 2,
  y: aimBefore.dial.y + aimBefore.dial.height / 2,
};
await page.touchscreen.touchStart(aimStart.x, aimStart.y);
for (let step = 1; step <= 8; step += 1) {
  const delta = step * 4;
  await page.touchscreen.touchMove(
    aimBefore.vertical ? aimStart.x : aimStart.x + delta,
    aimBefore.vertical ? aimStart.y + delta : aimStart.y,
  );
  await wait(65);
}
await page.touchscreen.touchEnd();
await wait(180);
const aimAfter = await page.evaluate(() => {
  const slot = document.querySelector('[data-control-slot="aimDial"]');
  const rect = slot.getBoundingClientRect();
  return {
    aim: window.__bj8.aim.current,
    slot: { x: rect.x, y: rect.y },
    layoutDragging: Boolean(document.querySelector('.is-layout-dragging')),
  };
});
ok('慢速拨动持续改变瞄准角', Math.abs(aimAfter.aim - aimBefore.aim) > 0.001,
  `before=${aimBefore.aim.toFixed(4)} after=${aimAfter.aim.toFixed(4)}`);
ok('拨动超过长按时限也不进入控件拖位',
  !aimAfter.layoutDragging
    && Math.abs(aimAfter.slot.x - aimBefore.slot.x) < 1
    && Math.abs(aimAfter.slot.y - aimBefore.slot.y) < 1,
  JSON.stringify({ before: aimBefore.slot, after: aimAfter.slot }));

await stagePlayerAim();
const cancelBefore = await page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  pad: (() => {
    const rect = document.querySelector('.shoot-pad').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })(),
}));
const chargeStart = {
  x: cancelBefore.pad.x + cancelBefore.pad.width / 2,
  y: cancelBefore.pad.y + Math.min(24, cancelBefore.pad.height / 3),
};
await page.touchscreen.touchStart(chargeStart.x, chargeStart.y);
await page.touchscreen.touchMove(chargeStart.x, chargeStart.y + 28);
await wait(80);
for (let step = 1; step <= 8; step += 1) {
  await page.touchscreen.touchMove(
    chargeStart.x - step * 12,
    chargeStart.y + 28,
  );
  await wait(70);
}
await page.touchscreen.touchEnd();
await wait(700);
const cancelAfter = await page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  charging: document.querySelector('.shoot-pad')?.classList.contains('charging'),
  power: Number(document.querySelector('[role="meter"][aria-label="出杆力度"]')?.getAttribute('aria-valuenow') ?? -1),
  layoutDragging: Boolean(document.querySelector('.is-layout-dragging')),
}));
ok('蓄力后缓慢横向移出并松手不出杆',
  cancelAfter.shot === cancelBefore.shot && !cancelAfter.charging,
  JSON.stringify({ before: cancelBefore.shot, after: cancelAfter }));
ok('取消后蓄力预览归零且不误触布局拖位',
  cancelAfter.power === 0 && !cancelAfter.layoutDragging,
  JSON.stringify(cancelAfter));

await stagePlayerAim();
const normalBefore = await page.evaluate(() => window.__bj8.world.current.shot);
const normalPad = await page.evaluate(() => {
  const rect = document.querySelector('.shoot-pad').getBoundingClientRect();
  return {
    x: rect.x + rect.width / 2,
    startY: rect.y + Math.min(20, rect.height / 3),
    endY: Math.min(window.innerHeight - 2, rect.bottom - 2),
  };
});
await page.touchscreen.touchStart(normalPad.x, normalPad.startY);
for (let step = 1; step <= 6; step += 1) {
  await page.touchscreen.touchMove(
    normalPad.x,
    normalPad.startY + (normalPad.endY - normalPad.startY) * step / 6,
  );
}
await page.touchscreen.touchEnd();
await wait(600);
const normalAfter = await page.evaluate(() => window.__bj8.world.current.shot);
ok('仍可沿正常方向蓄力松手出杆', normalAfter === normalBefore + 1,
  `before=${normalBefore} after=${normalAfter}`);
ok('页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.close();
} finally {
  await browser?.close().catch(() => {});
}

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
