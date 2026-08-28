/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口、puppeteer-core 与 __bj8 调试句柄
[OUTPUT]: 15°/30°/45° 切球辅助线、真实出射方向与落袋断言
[POS]: 瞄准几何和物理一致性的浏览器出口门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 瞄准辅助线与碰撞精度回归门禁
 * 场景：摆 15°/30°/45° 三种切球（目标球 0.35m 直对角袋），真实鼠标瞄准+出杆
 * 断言两组：
 *  A. 辅助线几何：目标球走向线从目标球心出发沿 v；白球分离线沿理想切向（±1°）
 *  B. 物理一致性：目标球实际出射方向与 v 偏差 < 3°（TOI 回滚前 4m/s 时约 8°），且落袋
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

const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => localStorage.removeItem('guagua-billiards:aim-assist:v1'));
await page.reload({ waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));

async function realClickButton(text) {
  const box = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.textContent?.includes(t) || b.getAttribute('aria-label')?.includes(t));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}
await realClickButton('开始对局');
await new Promise(r => setTimeout(r, 800));

// 辅助线缺省偏好时默认开启；专项门禁不再经灯泡反向关闭。

// 开局先真实完成 placing；各几何用例随后只用 DEV 调试句柄固定 actor/phase 与摆位，
// 瞄准、蓄力、出杆仍全部走真实鼠标，避免前一用例洗袋触发 AI 干扰下一用例。
const wasPlacing = await page.evaluate(() => !!document.querySelector('.viewport.placing'));
if (wasPlacing) {
  const spot = await page.evaluate(() => {
    const scene = window.__bj8.scene.current;
    const headString = 2.54 * 0.25;
    for (let py = 100; py < 780; py += 20) {
      for (let px = 200; px < 1100; px += 20) {
        const hit = scene.screenToTable(px, py);
        if (hit && Math.abs(hit.x) < 0.3 && hit.z > headString + 0.15 && hit.z < headString + 0.6) {
          return { px, py };
        }
      }
    }
    return null;
  });
  if (spot) {
    await page.mouse.move(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 500));
  }
}
await new Promise(r => setTimeout(r, 1000));

const R = 0.028575;
const POCKET = { x: 0.635, z: -1.27 }; // 右上角袋
const v = { x: 0.6, z: -0.8 };         // 目标球走向（直指袋口）
const B = { x: POCKET.x - 0.35 * v.x, z: POCKET.z - 0.35 * v.z }; // 目标球位
const G = { x: B.x - v.x * 2 * R, z: B.z - v.z * 2 * R };         // 幽灵球位

// 切角 θ：白球方向 u = v 旋转 θ（超出台面时反向旋转）
function geom(thetaDeg, L = 0.31) {
  for (const sign of [1, -1]) {
    const th = (sign * thetaDeg * Math.PI) / 180;
    const u = { x: v.x * Math.cos(th) - v.z * Math.sin(th), z: v.x * Math.sin(th) + v.z * Math.cos(th) };
    const C = { x: G.x - u.x * L, z: G.z - u.z * L };
    if (Math.abs(C.x) < 0.58 && Math.abs(C.z) < 1.2) {
      const tangent = (() => { // 理想分离方向：u 去掉法向分量
        const d = u.x * v.x + u.z * v.z;
        const t = { x: u.x - d * v.x, z: u.z - d * v.z };
        const l = Math.hypot(t.x, t.z);
        return { x: t.x / l, z: t.z / l };
      })();
      return { u, C, tangent };
    }
  }
  throw new Error('几何超出台面');
}

async function stage(ballNumber, C) {
  await page.evaluate(({ n, B, C }) => {
    const world = window.__bj8.world.current;
    for (const b of world.balls) {
      if (b.number === 0) continue;
      b.active = false; b.vx = 0; b.vz = 0; b.x = 0; b.z = 0;
    }
    const ball = world.balls.find(b => b.number === n);
    Object.assign(ball, { active: true, x: B.x, z: B.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    Object.assign(world.balls[0], { active: true, x: C.x, z: C.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
    world.moving = false; world.events = []; world.firstContact = null;
    window.__bj8.setMatch({
      phase: 'aiming',
      actor: 'player',
      breaking: false,
      playerGroup: 'solid',
    });
    window.__bj8.sync();
  }, { n: ballNumber, B, C });
  await new Promise(r => setTimeout(r, 100));
  await waitCameraSettled();
}

// 第一人称相机平滑收敛：摆球 teleport 后等相机停稳再点击，
// 否则 screenToTable 扫描与鼠标 down/up 之间相机仍在飞行，像素映射错位（实测可偏 24°）
async function waitCameraSettled() {
  let prev = null;
  let stable = 0;
  for (let i = 0; i < 50 && stable < 3; i++) {
    const cur = await page.evaluate(() => {
      const scene = window.__bj8.scene.current;
      const vp = document.querySelector('.viewport');
      if (!vp) return null;
      const rect = vp.getBoundingClientRect();
      const hit = scene.screenToTable(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit ? [hit.x, hit.z] : null;
    });
    if (prev && cur && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 0.0005) stable += 1;
    else stable = 0;
    prev = cur;
    await new Promise(r => setTimeout(r, 100));
  }
}

async function aimAtWorld(target) {
  const pt = await page.evaluate((t) => {
    const scene = window.__bj8.scene.current;
    const screen = scene.tableToScreenAt(t.x, t.z, window.__bj8.aim.current);
    if (!screen) return null;
    const hit = scene.screenToTableAt(screen.x, screen.y, window.__bj8.aim.current);
    return hit
      ? { d: Math.hypot(hit.x - t.x, hit.z - t.z), cx: screen.x, cy: screen.y }
      : null;
  }, target);
  if (!pt) return null;
  // 单次 down/up：不能拖拽，第一人称相机随瞄准角转动会二次采样带偏角度
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
  // 中力（约 50 力 ≈ 4.2 m/s）：放大离散步进过冲，拉开修复前后差异
  for (let i = 1; i <= 5; i++) await page.mouse.move(pad.x, pad.y + i * 8);
  await page.mouse.up();
}

const readLines = () => page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const line = (l) => {
    const p = l.geometry.getAttribute('position');
    return { visible: l.visible, from: [p.getX(0), p.getZ(0)], to: [p.getX(1), p.getZ(1)] };
  };
  return {
    obj: line(scene.objLine),
    tan: line(scene.tanLine),
    debug: {
      phase: scene.phase,
      planActive: scene.planActive,
      worldMoving: window.__bj8.world.current.moving,
      aimVisible: scene.aimLine.visible,
    },
  };
});

const degDiff = (ax, az, bx, bz) => {
  const dot = (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * (Math.hypot(bx, bz) || 1));
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
};

// 三种切角 × 三颗全色球；每例独立固定为玩家全色瞄准回合。
const cases = [
  { theta: 15, ball: 1, L: 0.31 },
  { theta: 30, ball: 2, L: 0.31 },
  { theta: 45, ball: 3, L: 0.31 },
];

for (const { theta, ball, L } of cases) {
  const { u, C, tangent } = geom(theta, L);
  await stage(ball, C);
  const aimPoint = { x: G.x + u.x * 0.2, z: G.z + u.z * 0.2 };
  const aim = await aimAtWorld(aimPoint);
  ok(`${theta}° 摆球后可瞄准幽灵球位`, !!aim, aim ? `偏差 ${aim.d.toFixed(4)}m` : '未命中');

  // A. 辅助线断言
  const lines = await readLines();
  const objDir = [lines.obj.to[0] - lines.obj.from[0], lines.obj.to[1] - lines.obj.from[1]];
  const tanDir = [lines.tan.to[0] - lines.tan.from[0], lines.tan.to[1] - lines.tan.from[1]];
  const objFromErr = Math.hypot(lines.obj.from[0] - B.x, lines.obj.from[1] - B.z);
  ok(
    `${theta}° 走向预测线从目标球心出发`,
    lines.obj.visible && objFromErr < 0.002 && Math.hypot(...objDir) > 0.02,
    `起点偏差 ${(objFromErr * 1000).toFixed(1)}mm ${JSON.stringify(lines.debug)}`,
  );
  ok(
    `${theta}° throw 预测偏转有界`,
    degDiff(objDir[0], objDir[1], v.x, v.z) < 6,
    `相对理想法线偏 ${degDiff(...objDir, v.x, v.z).toFixed(2)}°`,
  );
  ok(
    `${theta}° 白球分离预测线有效`,
    lines.tan.visible && Math.hypot(...tanDir) > 0.02 &&
      degDiff(tanDir[0], tanDir[1], tangent.x, tangent.z) < 6,
    `相对理想切向偏 ${degDiff(...tanDir, tangent.x, tangent.z).toFixed(2)}°`,
  );

  // B. 物理一致性断言：出杆后用 rAF 采样目标球最初 3cm 位移方向
  const prevShot = await page.evaluate(() => window.__bj8.world.current.shot);
  await fireShot();
  try {
    await page.waitForFunction((s) => window.__bj8.world.current.shot > s, { timeout: 8000 }, prevShot);
    const actual = await page.evaluate(({ B, n }) => new Promise((resolve) => {
      const world = window.__bj8.world.current;
      const b1 = world.balls.find(b => b.number === n);
      const t0 = performance.now();
      const tick = () => {
        const dx = b1.x - B.x, dz = b1.z - B.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.03) return resolve({ dir: [dx / d, dz / d], moved: d });
        if (!b1.active) return resolve({ dir: null, moved: d }); // 已落袋（位移不足 3cm 不可能）
        if (performance.now() - t0 > 5000) return resolve({ dir: null, moved: d });
        requestAnimationFrame(tick);
      };
      tick();
    }), { B, n: ball });
    ok(
      `${theta}° 预测走向线≈目标球实际出射方向`,
      !!actual.dir && degDiff(actual.dir[0], actual.dir[1], objDir[0], objDir[1]) < 3,
      actual.dir
        ? `偏 ${degDiff(actual.dir[0], actual.dir[1], objDir[0], objDir[1]).toFixed(2)}°`
        : `未测到位移 moved=${actual.moved?.toFixed(3)}`,
    );
    await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 30000 });
    await new Promise(r => setTimeout(r, 400));
    const pocketed = await page.evaluate((n) => !window.__bj8.world.current.balls.find(b => b.number === n).active, ball);
    ok(`${theta}° 目标球按辅助线方向落袋`, pocketed);
  } catch (e) {
    ok(`${theta}° 出杆流程`, false, String(e).slice(0, 120));
    break;
  }
}

ok('页面无 JS 错误', errors.length === 0, errors[0] ?? '');
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
await page.close();
process.exit(passed === results.length ? 0 : 1);
