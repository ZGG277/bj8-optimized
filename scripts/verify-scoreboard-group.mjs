/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core 与 __bj8 调试句柄
[OUTPUT]: 花色分组后双方 mini-rack 球号归属断言与截图
[POS]: 规则分组到比分板呈现的浏览器出口门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 花色分组后比分板球型图标验证：先开球进 1 号（不分组），再进 9 号 → 玩家应为花色球，
 * 玩家侧 mini-rack 应渲染 9-15+8，对手侧渲染 1-7+8 */
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';

const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));

const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (btn) await page.mouse.click(btn.x, btn.y);
await new Promise(r => setTimeout(r, 1800));

const R = 0.0286;
const POCKET = { x: 0.635, z: -1.27 };
const v = { x: 0.6, z: -0.8 };
const u = { x: 0.373, z: -0.928 };
const B = { x: POCKET.x - 0.35 * v.x, z: POCKET.z - 0.35 * v.z };
const G = { x: B.x - v.x * 2 * R, z: B.z - v.z * 2 * R };
const C = { x: G.x - u.x * 0.31, z: G.z - u.z * 0.31 };
const aimPoint = { x: G.x + u.x * 0.2, z: G.z + u.z * 0.2 };

async function stagePot(n) {
  await page.evaluate(({ n, B, C }) => {
    const world = window.__bj8.world.current;
    for (const b of world.balls) {
      if (b.number === 0) continue;
      b.active = false; b.vx = 0; b.vz = 0; b.x = 0; b.z = 0;
    }
    Object.assign(world.balls.find(b => b.number === n), { active: true, x: B.x, z: B.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    Object.assign(world.balls[0], { active: true, x: C.x, z: C.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    world.moving = false; world.events = []; world.firstContact = null;
    window.__bj8.sync();
  }, { n, B, C });
  await new Promise(r => setTimeout(r, 400));
}

async function aimAndFire() {
  const pt = await page.evaluate((t) => {
    const scene = window.__bj8.scene.current;
    const vp = document.querySelector('.viewport');
    const rect = vp.getBoundingClientRect();
    let best = null;
    const test = (cx, cy) => {
      const hit = scene.screenToTable(cx, cy);
      if (!hit) return;
      const d = Math.hypot(hit.x - t.x, hit.z - t.z);
      if (!best || d < best.d) best = { d, cx, cy };
    };
    for (let ix = 0; ix <= 32; ix++) for (let iy = 0; iy <= 24; iy++)
      test(rect.left + (rect.width * ix) / 32, rect.top + (rect.height * iy) / 24);
    const spanX = rect.width * 0.02, spanY = rect.height * 0.02;
    for (let dx = -spanX; dx <= spanX; dx += 1) for (let dy = -spanY; dy <= spanY; dy += 1) test(best.cx + dx, best.cy + dy);
    for (let dx = -1; dx <= 1; dx += 0.2) for (let dy = -1; dy <= 1; dy += 0.2) test(best.cx + dx, best.cy + dy);
    return best;
  }, aimPoint);
  console.log('  aim.d =', pt?.d?.toFixed(4));
  if (!pt || pt.d > 0.005) throw new Error('瞄准未命中');
  await page.mouse.move(pt.cx, pt.cy);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
  const prev = await page.evaluate(() => window.__bj8.world.current.shot);
  const pad = await page.evaluate(() => {
    const el = document.querySelector('.shoot-pad');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(pad.x, pad.y);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(pad.x, pad.y + i * 8);
  await page.mouse.up();
  await page.waitForFunction((s) => window.__bj8.world.current.shot > s, { timeout: 8000 }, prev);
  await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));
}

await stagePot(1);
await aimAndFire();
console.log('after shot1:', await page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  ball1: window.__bj8.world.current.balls.find(b => b.number === 1).active,
  turn: document.querySelector('.match-state p')?.textContent,
  group: document.querySelector('.player-card .identity small')?.textContent,
})));
await stagePot(9);
await aimAndFire();
console.log('after shot2:', await page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  ball9: window.__bj8.world.current.balls.find(b => b.number === 9).active,
  turn: document.querySelector('.match-state p')?.textContent,
  group: document.querySelector('.player-card .identity small')?.textContent,
})));

const state = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.player-card')].map(card => ({
    name: card.querySelector('.identity strong')?.textContent,
    group: card.querySelector('.identity small')?.textContent,
    balls: [...card.querySelectorAll('.mini-ball')].map(b => b.textContent),
  }));
  return cards;
});
console.log(JSON.stringify(state, null, 2));
const me = state.find(c => c.name === '你');
const rival = state.find(c => c.name === '顾燃');
const okMe = me?.group === '花色球' && me.balls.join(',') === '9,10,11,12,13,14,15,8';
const okRival = rival?.group === '全色球' && rival.balls.join(',') === '1,2,3,4,5,6,7,8';
console.log(`${okMe ? '✓' : '✗'} 玩家花色球且图标为 9-15`);
console.log(`${okRival ? '✓' : '✗'} 对手全色球且图标为 1-7`);
console.log('ERRORS:', JSON.stringify(errors.slice(0, 5)));
await page.screenshot({ path: 'shots/34-scoreboard-stripe.png' });
await page.close();
await browser.disconnect();
process.exit(okMe && okRival && errors.length === 0 ? 0 : 1);
