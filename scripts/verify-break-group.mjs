/* P0-06 出口门禁:开球进球 → 连续进球 → 分组 的端到端复测
 * 通过 __bj8 调试句柄摆球,但瞄准/出杆全部走真实鼠标输入。
 * 前置:
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 */
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 真实鼠标点击按钮(P1-05 原则:禁止 evaluate .click() 绕过真实输入路径)
async function realClickButton(page, text) {
  const box = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes(t));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
ok('开始对局按钮真实点击', await realClickButton(page, '开始对局'));
await new Promise(r => setTimeout(r, 800));

// 右上袋口
const POCKET = { x: 0.635, z: -1.27 };
// 摆球:小角度切球几何。目标球离袋口 0.35m;白球行进方向比"目标球→袋口"方向小 15°,
// 既在瞄准角 ±0.72 限制内,又让白球触球后走向底库空当,不会跟进球袋或停到库边接触区。
function staging(R) {
  const v = { x: 0.6, z: -0.8 }; // 目标球→袋口方向(单位向量,36.9°)
  const B = { x: POCKET.x - 0.35 * v.x, z: POCKET.z - 0.35 * v.z }; // 目标球
  const G = { x: B.x - v.x * 2 * R, z: B.z - v.z * 2 * R }; // 幽灵球位(触球瞬间白球球心)
  const u = { x: 0.373, z: -0.928 }; // 白球行进方向(v 顺时针减 15°,21.9°,在瞄准限制内)
  const C = { x: G.x - u.x * 0.31, z: G.z - u.z * 0.31 }; // 白球起点
  const aimPoint = { x: G.x + u.x * 0.2, z: G.z + u.z * 0.2 }; // 瞄准点(过幽灵球位延长线上)
  return { B, C, aimPoint };
}

// 摆球:目标球与白球按切球几何就位(注意:balls 数组按球堆顺序,须按 number 查找)
async function stagePot(ballNumber) {
  await page.evaluate(({ n, pocket }) => {
    const world = window.__bj8.world.current;
    const R = world.balls[0].r ?? 0.0286;
    const v = { x: 0.6, z: -0.8 };
    const B = { x: pocket.x - 0.35 * v.x, z: pocket.z - 0.35 * v.z };
    const G = { x: B.x - v.x * 2 * R, z: B.z - v.z * 2 * R };
    const u = { x: 0.373, z: -0.928 };
    const C = { x: G.x - u.x * 0.31, z: G.z - u.z * 0.31 };
    // 清场:除白球外全部移出
    for (const b of world.balls) {
      if (b.number === 0) continue;
      b.active = false; b.vx = 0; b.vz = 0; b.x = 0; b.z = 0;
    }
    const ball = world.balls.find(b => b.number === n);
    ball.active = true;
    ball.x = B.x; ball.z = B.z;
    ball.vx = 0; ball.vz = 0; ball.wx = 0; ball.wy = 0; ball.wz = 0;
    const cue = world.balls[0];
    cue.active = true;
    cue.x = C.x; cue.z = C.z;
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
    // 亚像素细化(±1px,0.2px 步进):远端台面 1px≈数毫米,切球瞄准需要亚像素精度
    if (best) {
      for (let dx = -1; dx <= 1; dx += 0.2) {
        for (let dy = -1; dy <= 1; dy += 0.2) {
          const r = dist(best.cx + dx, best.cy + dy);
          if (r && r.d < best.d) best = r;
        }
      }
    }
    return best;
  }, target);
  if (!pt || pt.d > 0.005) return null;
  // 单次 down/up:不能再拖拽——第一人称相机会随瞄准角转动,
  // 拖动会在相机转动后的新姿态下二次采样,把瞄准角带偏
  await page.mouse.move(pt.cx, pt.cy);
  await page.mouse.down();
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
  // 小力度(约 33 力)即可:目标球仅 0.35m 行程,限制白球跟进距离
  for (let i = 1; i <= 3; i++) await page.mouse.move(pad.x, pad.y + i * 8);
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

const stagedAimPoint = () => {
  // 与页面内摆球相同的几何,球半径取标准 0.0286
  return staging(0.0286).aimPoint;
};

const expectedAim = () => {
  const st = staging(0.0286);
  return Math.atan2(st.aimPoint.x - st.C.x, -(st.aimPoint.z - st.C.z));
};

const assertAim = async (label) => {
  const actual = await page.evaluate(() => window.__bj8.aim.current);
  const expected = expectedAim();
  ok(label, Math.abs(actual - expected) < 0.02, `期望${expected.toFixed(3)} 实际${actual.toFixed(3)}`);
};

// --- 第一杆:开球进 1 号 ---
await stagePot(1);
const aim1 = await aimAtWorld(stagedAimPoint());
ok('摆球后可瞄准幽灵球位(网格反查命中)', !!aim1, aim1 ? `偏差 ${aim1.d.toFixed(4)}m` : '未命中');
await assertAim('瞄准角与切球线一致');
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
const aim2 = await aimAtWorld(stagedAimPoint());
ok('第二杆摆球后可瞄准幽灵球位', !!aim2, aim2 ? `偏差 ${aim2.d.toFixed(4)}m` : '未命中');
await assertAim('第二杆瞄准角与切球线一致');
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
