/* P0-06 出口门禁:开球进球 → 连续进球 → 分组 的端到端复测
 * 通过 __bj8 调试句柄摆球,但瞄准/出杆全部走真实鼠标输入。
 * 前置:
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5199/';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9333',
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
  btn?.click();
});
await new Promise(r => setTimeout(r, 800));

// 右上袋口
const POCKET = { x: 0.635, z: -1.27 };
// 摆球:目标球放在袋口前方,白球放在"目标球-袋口"连线的反延长线上
async function stagePot(ballNumber) {
  await page.evaluate(({ n, pocket }) => {
    const world = window.__bj8.world.current;
    const R = world.balls[0].r ?? 0.0286;
    // 清场:除白球外全部移出
    for (const b of world.balls) {
      if (b.number === 0) continue;
      b.active = false; b.vx = 0; b.vz = 0; b.x = 0; b.z = 0;
    }
    // 目标球:袋口前方约 0.128m(注意:balls 数组按球堆顺序,须按 number 查找)
    const ball = world.balls.find(b => b.number === n);
    ball.active = true;
    ball.x = pocket.x - 0.08;
    ball.z = pocket.z + 0.10;
    ball.vx = 0; ball.vz = 0; ball.wx = 0; ball.wy = 0; ball.wz = 0;
    // 白球:在 目标球→袋口 方向的反向延长线上,距目标球 2R+0.25
    const dx = pocket.x - ball.x, dz = pocket.z - ball.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const cue = world.balls[0];
    cue.active = true;
    cue.x = ball.x - ux * (2 * R + 0.25);
    cue.z = ball.z - uz * (2 * R + 0.25);
    cue.vx = 0; cue.vz = 0; cue.wx = 0; cue.wy = 0; cue.wz = 0;
    world.moving = false;
    world.events = [];
    world.firstContact = null;
  }, { n: ballNumber, pocket: POCKET });
  await new Promise(r => setTimeout(r, 350)); // 等 React 同步快照
}

// 网格反查 + 局部细化:找到屏幕上最接近世界坐标 target 的点,真实点击瞄准
async function aimAtWorld(target) {
  const pt = await page.evaluate((t) => {
    const scene = window.__bj8.scene.current;
    const vp = document.querySelector('.viewport');
    const rect = vp.getBoundingClientRect();
    const dist = (cx, cy) => {
      const hit = scene.screenToTable(cx, cy);
      return hit ? { d: Math.hypot(hit.x - t.x, hit.z - t.z), cx, cy } : null;
    };
    let best = null;
    // 粗扫
    for (let ix = 0; ix <= 32; ix++) {
      for (let iy = 0; iy <= 24; iy++) {
        const r = dist(rect.left + (rect.width * ix) / 32, rect.top + (rect.height * iy) / 24);
        if (r && (!best || r.d < best.d)) best = r;
      }
    }
    // 局部细化(±2% 视口,1px 步进)
    if (best) {
      const spanX = rect.width * 0.02, spanY = rect.height * 0.02;
      for (let dx = -spanX; dx <= spanX; dx += 1) {
        for (let dy = -spanY; dy <= spanY; dy += 1) {
          const r = dist(best.cx + dx, best.cy + dy);
          if (r && r.d < best.d) best = r;
        }
      }
    }
    return best;
  }, target);
  if (!pt || pt.d > 0.02) return null;
  await page.mouse.move(pt.cx, pt.cy);
  await page.mouse.down();
  await page.mouse.move(pt.cx + 2, pt.cy + 2, { steps: 2 });
  await page.mouse.up();
  return pt;
}

async function fireShot() {
  const pad = await page.evaluate(() => {
    const el = document.querySelector('.shoot-pad');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(pad.x, pad.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(pad.x, pad.y + i * 20);
  await page.mouse.up();
}

// 先等出杆计数增加(球杆触球动画后才击球),再等物理停止
async function waitShotSettled(prevShot, timeoutMs = 30000) {
  try {
    await page.waitForFunction((s) => window.__bj8.world.current.shot > s, { timeout: 8000 }, prevShot);
    await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

const hud = async () => page.evaluate(() => ({
  shot: window.__bj8.world.current.shot,
  ball1: window.__bj8.world.current.balls.find(b => b.number === 1).active,
  ball2: window.__bj8.world.current.balls.find(b => b.number === 2).active,
  target: document.querySelector('.shot-target strong')?.textContent,
  targetHint: document.querySelector('.shot-target small')?.textContent,
  myGroup: document.querySelector('.player-card .identity small')?.textContent,
  turn: document.querySelector('.match-state p')?.textContent,
}));

const stagedBallPos = async (n) => page.evaluate((k) => {
  const b = window.__bj8.world.current.balls.find(x => x.number === k);
  return { x: b.x, z: b.z };
}, n);

// --- 第一杆:开球进 1 号 ---
await stagePot(1);
const ball1Pos = await stagedBallPos(1);
const aim1 = await aimAtWorld(ball1Pos);
ok('摆球后可瞄准 1 号球(网格反查命中)', !!aim1, aim1 ? `偏差 ${aim1.d.toFixed(4)}m` : '未命中');
const prevShot1 = (await hud()).shot;
await fireShot();
ok('第一杆出杆且物理停止', await waitShotSettled(prevShot1));
await new Promise(r => setTimeout(r, 400));
const s1 = await hud();
ok('开球进 1 号', s1.ball1 === false, JSON.stringify(s1));
ok('开球后退出开球态(合法目标提示)', s1.targetHint !== '第一杆', s1.targetHint);
ok('开球进球后继续击球(仍是你的回合)', s1.turn === '你的回合', s1.turn);
ok('开球进球未分组(仍开放球局)', s1.myGroup === '开放球局', s1.myGroup);

// --- 第二杆:再进 2 号 → 应确定分组 ---
await stagePot(2);
const ball2Pos = await stagedBallPos(2);
const aim2 = await aimAtWorld(ball2Pos);
ok('第二杆摆球后可瞄准 2 号球', !!aim2, aim2 ? `偏差 ${aim2.d.toFixed(4)}m` : '未命中');
const prevShot2 = (await hud()).shot;
await fireShot();
ok('第二杆出杆且物理停止', await waitShotSettled(prevShot2));
await new Promise(r => setTimeout(r, 400));
const s2 = await hud();
ok('第二杆进 2 号', s2.ball2 === false, JSON.stringify(s2));
ok('连续进球后分组为全色球', s2.myGroup === '全色球', s2.myGroup);
ok('合法目标显示全色球', s2.target === '全色球', s2.target);
ok('分组后继续击球(仍是你的回合)', s2.turn === '你的回合', s2.turn);
ok('页面无 JS 错误', errors.length === 0, errors[0] ?? '');

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
await page.close();
process.exit(passed === results.length ? 0 : 1);
