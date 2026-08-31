/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core 与 __bj8 调试句柄
[OUTPUT]: 清组后干净进 8 号的胜负、庆祝动效与整局单点训练总结断言
[POS]: 8 号胜负规则到 UI 呈现的浏览器出口门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 8 号球胜负回归门禁：清台后干净打进 8 号（无碰库）应获胜并播放庆祝动效
 * 流程：连续进球完成分组 → 摆"本组已清"局面直打 8 号 → 断言 win + confetti + 训练总结
 * 回归对象：曾把 8 号排除在"进球"外，干净进 8 被误判 no-cushion 犯规判负
 * 前置:
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 */
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

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

async function stage(n, clearGroups) {
  await page.evaluate(({ n, B, C, clearGroups }) => {
    const world = window.__bj8.world.current;
    for (const b of world.balls) {
      if (b.number === 0) continue;
      if (clearGroups && b.number >= 1 && b.number <= 15 && b.number !== n) {
        b.active = false; // 模拟本组已清台
      } else if (b.number !== n) {
        b.active = false;
      }
      b.vx = 0; b.vz = 0; b.x = 0; b.z = 0;
    }
    Object.assign(world.balls.find(b => b.number === n), { active: true, x: B.x, z: B.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    Object.assign(world.balls[0], { active: true, x: C.x, z: C.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    world.moving = false; world.events = []; world.firstContact = null;
    // 专项门禁直接固定为玩家瞄准态；摆球仍经调试句柄，瞄准与出杆继续走真实指针。
    window.__bj8.setMatch({ phase: 'aiming', actor: 'player' });
    window.__bj8.sync();
  }, { n, B, C, clearGroups });
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
  await new Promise(r => setTimeout(r, 600));
}

// 1) 开球进 1 号（不分组）
await stage(1, false);
await aimAndFire();
// 2) 进 2 号 → 玩家分全色球
await stage(2, false);
await aimAndFire();
const group = await page.evaluate(() => document.querySelector('.player-card .identity small')?.textContent);
ok('连续进球后已完成分组', group === '全色球' || group === '花色球', group);

// 3) 模拟全色已清台，直打 8 号（干净入袋、无碰库——原 bug 场景）
await stage(8, true);
await aimAndFire();

const end = await page.evaluate(() => ({
  h1: document.querySelector('.finish-mask h1')?.textContent ?? null,
  won: !!document.querySelector('.finish-mask.won'),
  confetti: document.querySelectorAll('.finish-mask .confetti i').length,
  trainingFocus: document.querySelector('.training-summary strong')?.textContent ?? null,
  nextGoal: document.querySelector('.training-summary em')?.textContent ?? null,
  messageKey: window.__bj8.match.current.messageKey,
}));
ok('清台进 8 号：对局结束且玩家获胜', end.h1 === '你赢了！', JSON.stringify(end));
ok('结算事实为 win-8（非犯规判负）', end.messageKey === 'win-8', end.messageKey);
ok('庆祝彩带已渲染', end.won && end.confetti === 28, `confetti=${end.confetti}`);
ok('结算页只显示一个训练重点和下一局目标',
  Boolean(end.trainingFocus?.includes('本局重点')) && Boolean(end.nextGoal?.includes('下一局目标')),
  JSON.stringify({ focus: end.trainingFocus, nextGoal: end.nextGoal }));
ok('页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.screenshot({ path: `${SHOT_DIR}/35-win8-celebration.png` });
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
await page.close();
process.exit(passed === results.length ? 0 : 1);
