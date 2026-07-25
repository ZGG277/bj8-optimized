/*
[INPUT]: 只依赖常量表与纯数学；禁止依赖 React、DOM、规则状态或渲染层
[OUTPUT]: 对外输出 240 Hz 确定性世界：步进、首碰/碰库/落袋事件、合法目标推导与击球接口
[POS]: 物理内核层，规则与 UI 的事实来源；所有时间积分必须以 PHYSICS_DT 固定步长进行
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/*
 * 中式八球物理引擎 - 确定性二维台球物理（含自旋）
 *
 * 模型参考：
 * - 滑动/滚动两阶段摩擦（Dr. Dave Billiards / pooltool）
 *   滑动期: 线加速度 -μs·g·û，角加速度由接触点摩擦扭矩驱动，直到 |u|→0 进入纯滚动
 *   滚动期: 恒定滚动阻力减速度（非指数衰减），垂直轴旋转缓慢衰减
 * - 库边: 速度相关恢复系数 + 切向摩擦 + 侧旋反踢（Mathaven & Stronge 的简化版）
 * - 球球: 恢复系数 + 切向摩擦（throw）
 */

export const TABLE = {
  width: 1.27,            // 台面宽 1.27m
  length: 2.54,           // 台面长 2.54m
  ballRadius: 0.028575,   // 球半径 57.15mm
  cornerPocketRadius: 0.068,
  sidePocketRadius: 0.062,
} as const;

export const PHYSICS_DT = 1 / 240;  // 240Hz 固定时间步

const G = 9.81;
const R = TABLE.ballRadius;

// ---- 物理参数（经手感仿真调校） ----
const BALL_RESTITUTION = 0.94;       // 球球碰撞恢复系数
const BALL_THROW_FRICTION = 0.055;   // 球球切向摩擦（throw）
const SLIDE_FRICTION = 0.21;         // 滑动摩擦系数 μs（减速 ≈ 2.06 m/s²）
const ROLL_DECEL = 0.6;              // 滚动阻力减速度 m/s²（手感调校：中力停球约 4 秒）
const SPIN_DECEL = 2.2;              // 垂直轴侧旋衰减 rad/s²
const SLIP_EPS = 0.004;              // 滑动→滚动切换阈值 (m/s)
const STOP_SPEED = 0.008;            // 停止判定阈值（m/s）
const STOP_SPIN = 0.4;               // 自旋停止阈值（rad/s）
const REST_SPEED = 0.08;             // 低于此法向速度的球碰按完全非弹性处理（防抖动供能）

// 库边：恢复系数随撞击速度降低（高速弹得更"死"）
const CUSHION_E_BASE = 0.82;
const CUSHION_E_SLOPE = 0.035;       // 每 m/s 法向速度降低的 e
const CUSHION_E_MIN = 0.52;
const CUSHION_TANGENTIAL_KEEP = 0.72; // 库边切向速度保留比例
const CUSHION_SPIN_KICK = 0.42;      // 侧旋对切向反弹的反踢强度
const CUSHION_SPIN_DAMP = 0.55;      // 碰库后侧旋保留比例

export type BallGroup = "cue" | "solid" | "eight" | "stripe";

export type BallState = {
  id: number;
  number: number;
  group: BallGroup;
  x: number;
  z: number;
  vx: number;
  vz: number;
  wx: number;  // 角速度（rad/s），绕世界 X 轴
  wy: number;  // 绕垂直 Y 轴（侧旋/塞）
  wz: number;  // 绕世界 Z 轴
  active: boolean;
};

/** 击球点偏移：x 垂直（+高杆/-低杆），y 水平（+右塞/-左塞），范围 -1..1 */
export type CueSpin = { x: number; y: number };

export type PhysicsEvent =
  | { type: "first-contact"; ball: number; time: number; speed: number }
  | { type: "cushion"; ball: number; time: number; speed: number }
  | { type: "pocket"; ball: number; pocket: number; time: number; speed: number };

export type BilliardsWorld = {
  balls: BallState[];
  events: PhysicsEvent[];
  time: number;
  moving: boolean;
  shot: number;
  firstContact: number | null;
};

type Pocket = { x: number; z: number; radius: number };

// 6个袋口：左上、左中、左下、右上、右中、右下
const POCKETS: Pocket[] = [
  { x: -TABLE.width / 2, z: -TABLE.length / 2, radius: TABLE.cornerPocketRadius },
  { x: TABLE.width / 2, z: -TABLE.length / 2, radius: TABLE.cornerPocketRadius },
  { x: -TABLE.width / 2, z: 0, radius: TABLE.sidePocketRadius },
  { x: TABLE.width / 2, z: 0, radius: TABLE.sidePocketRadius },
  { x: -TABLE.width / 2, z: TABLE.length / 2, radius: TABLE.cornerPocketRadius },
  { x: TABLE.width / 2, z: TABLE.length / 2, radius: TABLE.cornerPocketRadius },
];

export type PlannedShot = { angle: number; power: number; target: number; pocket: number };

function groupFor(number: number): BallGroup {
  if (number === 0) return "cue";
  if (number === 8) return "eight";
  return number < 8 ? "solid" : "stripe";
}

function makeBall(number: number, x: number, z: number): BallState {
  return { id: number, number, group: groupFor(number), x, z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, active: true };
}

/**
 * 创建初始球局
 */
export function createInitialWorld(): BilliardsWorld {
  const balls: BallState[] = [makeBall(0, 0, TABLE.length * 0.25)];

  const rackOrder = [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 13, 6, 14, 7, 15];
  const diameter = TABLE.ballRadius * 2.015;
  const rowDepth = diameter * Math.sqrt(3) / 2;
  const apexZ = -TABLE.length * 0.25;
  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      const number = rackOrder[index];
      balls.push(makeBall(number, (column - row / 2) * diameter, apexZ - row * rowDepth));
      index += 1;
    }
  }

  return { balls, events: [], time: 0, moving: false, shot: 0, firstContact: null };
}

export function cloneWorld(world: BilliardsWorld): BilliardsWorld {
  return {
    ...world,
    balls: world.balls.map((ball) => ({ ...ball })),
    events: world.events.map((event) => ({ ...event })),
  };
}

export function getCueBall(world: BilliardsWorld): BallState | undefined {
  return world.balls.find((ball) => ball.number === 0);
}

/** 纯滚动角速度：ω = (ŷ × v) / R */
function rollingSpin(vx: number, vz: number): { wx: number; wz: number } {
  return { wx: vz / R, wz: -vx / R };
}

/**
 * 击打白球
 * @param spin 击球点：x>0 高杆(跟进) x<0 低杆(缩杆) y 侧旋(塞)
 */
export function strikeCueBall(world: BilliardsWorld, angle: number, power: number, spin?: CueSpin): boolean {
  const cue = getCueBall(world);
  if (!cue || !cue.active || world.moving) {
    return false;
  }

  // 力度映射：1-100 -> 速度 0.35-8.0 m/s（满分可开出有力的球堆）
  const normalizedPower = Math.min(100, Math.max(1, power)) / 100;
  const speed = 0.35 + normalizedPower * 7.65;

  cue.vx = Math.sin(angle) * speed;
  cue.vz = -Math.cos(angle) * speed;

  // 初始角速度：纯滚动 + 击球点偏移附加旋转
  const roll = rollingSpin(cue.vx, cue.vz);
  const sx = spin ? Math.min(1, Math.max(-1, spin.x)) : 0;
  const sy = spin ? Math.min(1, Math.max(-1, spin.y)) : 0;
  // 高/低杆：沿滚动轴附加，最大约 ±2.6 倍纯滚动量
  cue.wx = roll.wx * (1 + sx * 2.6);
  cue.wz = roll.wz * (1 + sx * 2.6);
  // 侧旋：绕垂直轴
  cue.wy = sy * (speed / R) * 0.85;

  world.events = [];
  world.firstContact = null;
  world.moving = true;
  world.shot += 1;

  return true;
}

export function respotCueBall(world: BilliardsWorld, x = 0, z = TABLE.length * 0.25) {
  const cue = getCueBall(world);
  if (!cue) return;

  cue.active = true;
  cue.x = Math.min(TABLE.width / 2 - R, Math.max(-TABLE.width / 2 + R, x));
  cue.z = Math.min(TABLE.length / 2 - R, Math.max(-TABLE.length / 2 + R, z));
  cue.vx = 0;
  cue.vz = 0;
  cue.wx = 0;
  cue.wy = 0;
  cue.wz = 0;
}

function pathClear(
  world: BilliardsWorld,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  ignored: Set<number>
): boolean {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return false;

  for (const ball of world.balls) {
    if (!ball.active || ignored.has(ball.number)) continue;
    const projection = Math.min(1, Math.max(0, ((ball.x - fromX) * dx + (ball.z - fromZ) * dz) / lengthSquared));
    const nearestX = fromX + dx * projection;
    const nearestZ = fromZ + dz * projection;
    const distance = Math.hypot(ball.x - nearestX, ball.z - nearestZ);
    if (distance < R * 2.08) return false;
  }
  return true;
}

export function planSimpleShot(world: BilliardsWorld, legalNumbers: number[], skill: number): PlannedShot | null {
  const cue = getCueBall(world);
  if (!cue || !cue.active) return null;

  let best: (PlannedShot & { score: number }) | null = null;

  for (const target of world.balls) {
    if (!target.active || !legalNumbers.includes(target.number)) continue;

    for (let pocketIndex = 0; pocketIndex < POCKETS.length; pocketIndex += 1) {
      const pocket = POCKETS[pocketIndex];

      const pocketDx = pocket.x - target.x;
      const pocketDz = pocket.z - target.z;
      const pocketDistance = Math.hypot(pocketDx, pocketDz);
      if (pocketDistance === 0) continue;

      const ghostX = target.x - (pocketDx / pocketDistance) * R * 2;
      const ghostZ = target.z - (pocketDz / pocketDistance) * R * 2;

      if (Math.abs(ghostX) > TABLE.width / 2 || Math.abs(ghostZ) > TABLE.length / 2) continue;

      if (!pathClear(world, target.x, target.z, pocket.x, pocket.z, new Set([target.number]))) continue;
      if (!pathClear(world, cue.x, cue.z, ghostX, ghostZ, new Set([0, target.number]))) continue;

      const cueDistance = Math.hypot(ghostX - cue.x, ghostZ - cue.z);

      const cutPenalty = Math.abs(
        (pocketDx * (ghostZ - cue.z) - pocketDz * (ghostX - cue.x)) /
        (pocketDistance * Math.max(cueDistance, 0.001))
      );

      const score = cueDistance + pocketDistance + cutPenalty * 1.4;

      if (!best || score < best.score) {
        const baseAngle = Math.atan2(ghostX - cue.x, -(ghostZ - cue.z));
        const errorScale = Math.max(0.002, (100 - skill) * 0.00042);
        const executionError = (Math.random() - 0.5) * errorScale;

        best = {
          angle: baseAngle + executionError,
          power: Math.min(78, Math.max(38, 35 + (cueDistance + pocketDistance) * 15)),
          target: target.number,
          pocket: pocketIndex,
          score,
        };
      }
    }
  }

  if (!best) return null;
  return { angle: best.angle, power: best.power, target: best.target, pocket: best.pocket };
}

function pocketBall(world: BilliardsWorld, ball: BallState, pocketIndex: number) {
  const speed = Math.hypot(ball.vx, ball.vz);
  ball.active = false;
  ball.vx = 0;
  ball.vz = 0;
  ball.wx = 0;
  ball.wy = 0;
  ball.wz = 0;
  world.events.push({ type: "pocket", ball: ball.number, pocket: pocketIndex, time: world.time, speed });
}

function detectPocket(world: BilliardsWorld, ball: BallState): boolean {
  for (let index = 0; index < POCKETS.length; index += 1) {
    const pocket = POCKETS[index];
    const dx = ball.x - pocket.x;
    const dz = ball.z - pocket.z;
    if (dx * dx + dz * dz <= pocket.radius * pocket.radius) {
      pocketBall(world, ball, index);
      return true;
    }
  }
  return false;
}

function inPocketMouth(ball: BallState, axis: "x" | "z"): boolean {
  const sideMouth = TABLE.sidePocketRadius * 1.05;
  const cornerMouth = TABLE.cornerPocketRadius * 1.05;

  if (axis === "x") {
    return Math.abs(ball.z) < sideMouth || Math.abs(Math.abs(ball.z) - TABLE.length / 2) < cornerMouth;
  }
  return Math.abs(Math.abs(ball.x) - TABLE.width / 2) < cornerMouth;
}

/**
 * 库边碰撞：法向速度相关恢复 + 切向摩擦 + 侧旋反踢
 */
function resolveCushions(world: BilliardsWorld, ball: BallState) {
  const xLimit = TABLE.width / 2 - R;
  const zLimit = TABLE.length / 2 - R;
  let hit = false;
  let hitSpeed = 0;

  // X方向库边（法向为 x）
  if (Math.abs(ball.x) > xLimit && !inPocketMouth(ball, "x")) {
    ball.x = Math.sign(ball.x) * xLimit;
    const vn = Math.abs(ball.vx);
    const e = Math.max(CUSHION_E_MIN, CUSHION_E_BASE - CUSHION_E_SLOPE * vn);
    ball.vx = -ball.vx * e;
    // 切向（z）摩擦衰减 + 侧旋反踢：ωy 把球往 ŷ×n̂ 方向踢
    ball.vz = ball.vz * CUSHION_TANGENTIAL_KEEP + ball.wy * R * CUSHION_SPIN_KICK * -Math.sign(ball.x);
    hit = true;
    hitSpeed = vn;
  }

  // Z方向库边（法向为 z）
  if (Math.abs(ball.z) > zLimit && !inPocketMouth(ball, "z")) {
    ball.z = Math.sign(ball.z) * zLimit;
    const vn = Math.abs(ball.vz);
    const e = Math.max(CUSHION_E_MIN, CUSHION_E_BASE - CUSHION_E_SLOPE * vn);
    ball.vz = -ball.vz * e;
    ball.vx = ball.vx * CUSHION_TANGENTIAL_KEEP + ball.wy * R * CUSHION_SPIN_KICK * Math.sign(ball.z);
    hit = true;
    hitSpeed = Math.max(hitSpeed, vn);
  }

  if (hit) {
    // 碰库消耗侧旋，并重估滚动自旋（让滑动摩擦接管后续演化）
    ball.wy *= CUSHION_SPIN_DAMP;
    const roll = rollingSpin(ball.vx, ball.vz);
    ball.wx = ball.wx * 0.4 + roll.wx * 0.6;
    ball.wz = ball.wz * 0.4 + roll.wz * 0.6;
    world.events.push({ type: "cushion", ball: ball.number, time: world.time, speed: hitSpeed });
  }
}

/**
 * 球球碰撞：法向冲量 + 切向摩擦（throw）
 */
function resolveBallPair(world: BilliardsWorld, first: BallState, second: BallState) {
  if (!first.active || !second.active) return;

  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const minimum = R * 2;
  const distanceSquared = dx * dx + dz * dz;

  if (distanceSquared >= minimum * minimum) return;

  const distance = Math.sqrt(distanceSquared) || minimum;
  const nx = dx / distance;
  const nz = dz / distance;

  const overlap = minimum - distance;
  first.x -= nx * overlap * 0.5;
  first.z -= nz * overlap * 0.5;
  second.x += nx * overlap * 0.5;
  second.z += nz * overlap * 0.5;

  const rvx = second.vx - first.vx;
  const rvz = second.vz - first.vz;
  const relativeNormal = rvx * nx + rvz * nz;
  if (relativeNormal >= 0) return;

  // 低速接触按完全非弹性处理，避免静态接触抖动互相供能
  const e = -relativeNormal < REST_SPEED ? 0 : BALL_RESTITUTION;
  const jn = -(1 + e) * relativeNormal * 0.5;
  first.vx -= jn * nx;
  first.vz -= jn * nz;
  second.vx += jn * nx;
  second.vz += jn * nz;

  // 切向摩擦（throw）：沿接触切线方向拖拽目标球
  const tx = -nz;
  const tz = nx;
  const relativeTangent = rvx * tx + rvz * tz;
  const jt = Math.min(BALL_THROW_FRICTION * jn, Math.abs(relativeTangent) * 0.5) * Math.sign(relativeTangent);
  first.vx += jt * tx * 0.5;
  first.vz += jt * tz * 0.5;
  second.vx -= jt * tx * 0.5;
  second.vz -= jt * tz * 0.5;

  if (world.firstContact === null) {
    const object = first.number === 0 ? second : second.number === 0 ? first : null;
    if (object) {
      world.firstContact = object.number;
      world.events.push({
        type: "first-contact",
        ball: object.number,
        time: world.time,
        speed: Math.abs(relativeNormal),
      });
    }
  }
}

/**
 * 台面摩擦：滑动期（û 反方向减速 + 扭矩）→ 纯滚动期（恒定滚动阻力）
 */
function applyClothFriction(ball: BallState, dt: number) {
  const speed = Math.hypot(ball.vx, ball.vz);

  if (speed <= 0 && Math.abs(ball.wy) <= 0) return;

  // 接触点滑动速度 u = v - R·(ω×ŷ)，其中 (ω×ŷ) = (-wz, 0, wx)
  const slipX = ball.vx - R * (-ball.wz);
  const slipZ = ball.vz - R * (ball.wx);
  const slipSpeed = Math.hypot(slipX, slipZ);

  if (slipSpeed > SLIP_EPS && speed > 0) {
    // 滑动摩擦：滑动速度 u 以 (7/2)μg 的速率恒定衰减（线速度 μg + 角速度换算 5μg/2）
    // 用解析方式积分，避免显式欧拉在 240Hz 下过冲形成极限环
    const sux = slipX / slipSpeed;
    const suz = slipZ / slipSpeed;
    const slipDecayRate = 3.5 * SLIDE_FRICTION * G;
    const timeToRolling = slipSpeed / slipDecayRate;
    const tEff = Math.min(dt, timeToRolling);

    ball.vx -= SLIDE_FRICTION * G * sux * tEff;
    ball.vz -= SLIDE_FRICTION * G * suz * tEff;
    const alpha = (5 * SLIDE_FRICTION * G) / (2 * R);
    ball.wx += alpha * suz * tEff;
    ball.wz += alpha * -sux * tEff;

    if (tEff < dt) {
      // 本步内已收敛到纯滚动，剩余时间走滚动阻力
      const remain = dt - tEff;
      const roll = rollingSpin(ball.vx, ball.vz);
      ball.wx = roll.wx;
      ball.wz = roll.wz;
      const newSpeed = Math.hypot(ball.vx, ball.vz);
      const decel = ROLL_DECEL * remain;
      if (decel >= newSpeed) {
        ball.vx = 0;
        ball.vz = 0;
        ball.wx = 0;
        ball.wz = 0;
      } else {
        const scale = (newSpeed - decel) / newSpeed;
        ball.vx *= scale;
        ball.vz *= scale;
      }
    }
  } else if (speed > 0) {
    // 纯滚动：锁定滚动自旋，施加恒定滚动阻力
    const roll = rollingSpin(ball.vx, ball.vz);
    ball.wx = roll.wx;
    ball.wz = roll.wz;
    const decel = ROLL_DECEL * dt;
    if (decel >= speed) {
      ball.vx = 0;
      ball.vz = 0;
      ball.wx = 0;
      ball.wz = 0;
    } else {
      const scale = (speed - decel) / speed;
      ball.vx *= scale;
      ball.vz *= scale;
    }
  }

  // 垂直轴侧旋衰减（静止时衰减更快——原地打转的摩擦更大）
  if (ball.wy !== 0) {
    const rate = Math.hypot(ball.vx, ball.vz) > STOP_SPEED ? SPIN_DECEL : SPIN_DECEL * 6;
    const dw = rate * dt;
    if (Math.abs(ball.wy) <= dw) ball.wy = 0;
    else ball.wy -= Math.sign(ball.wy) * dw;
  }

  // 完全停止判定（含低速贴库/贴球的抖动收敛）
  const finalSpeed = Math.hypot(ball.vx, ball.vz);
  if (finalSpeed <= STOP_SPEED * 2.5 && slipSpeed <= 0.06 && Math.abs(ball.wy) <= 6) {
    ball.vx = 0;
    ball.vz = 0;
    ball.wx = 0;
    ball.wz = 0;
    if (Math.abs(ball.wy) <= STOP_SPIN) ball.wy = 0;
  }
}

export function stepWorld(world: BilliardsWorld, dt = PHYSICS_DT) {
  if (!world.moving) return;
  world.time += dt;

  for (const ball of world.balls) {
    if (!ball.active) continue;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;

    if (!detectPocket(world, ball)) {
      resolveCushions(world, ball);
    }
  }

  let collisionOccurred = true;
  let iterations = 0;
  while (collisionOccurred && iterations < 8) {
    collisionOccurred = false;
    for (let first = 0; first < world.balls.length; first += 1) {
      for (let second = first + 1; second < world.balls.length; second += 1) {
        const beforeFirstX = world.balls[first].x;
        const beforeSecondX = world.balls[second].x;
        resolveBallPair(world, world.balls[first], world.balls[second]);
        if (world.balls[first].x !== beforeFirstX || world.balls[second].x !== beforeSecondX) {
          collisionOccurred = true;
        }
      }
    }
    iterations++;
  }

  let moving = false;
  for (const ball of world.balls) {
    if (!ball.active) continue;
    applyClothFriction(ball, dt);
    if (ball.vx !== 0 || ball.vz !== 0 || ball.wy !== 0) moving = true;
  }
  world.moving = moving;
}

export function simulateUntilStop(world: BilliardsWorld, maxSeconds = 30): BilliardsWorld {
  const maxSteps = Math.ceil(maxSeconds / PHYSICS_DT);
  for (let index = 0; index < maxSteps && world.moving; index += 1) {
    stepWorld(world, PHYSICS_DT);
  }
  return world;
}

export function pocketedThisShot(world: BilliardsWorld): number[] {
  return world.events
    .filter((event): event is Extract<PhysicsEvent, { type: "pocket" }> => event.type === "pocket")
    .map((event) => event.ball);
}

export function isCueBallPocketed(world: BilliardsWorld): boolean {
  return !world.balls.find((ball) => ball.number === 0)?.active;
}
