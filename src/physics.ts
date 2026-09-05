/*
[INPUT]: 只依赖常量表与纯数学；禁止依赖 React、DOM、规则状态或渲染层
[OUTPUT]: 对外输出 240 Hz 确定性世界：全局最早 TOI 步进、统一球碰/库边/袋口时序、接触事件与可观测求解预算
[POS]: 物理内核层，规则与 UI 的事实来源；所有时间积分必须以 PHYSICS_DT 固定步长进行
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/*
 * 中式八球物理引擎 - 确定性二维台球物理（含自旋）
 *
 * 模型参考：
 * - 滑动/滚动两阶段摩擦（Dr. Dave Billiards / pooltool）
 *   滑动期: 线加速度 -μs·g·û，角加速度由接触点摩擦扭矩驱动，直到 |u|→0 进入纯滚动
 *   滚动期: 恒定滚动阻力减速度（非指数衰减），垂直轴旋转缓慢衰减；
 *   静止残旋为线性+正比混合衰减（~2s 收敛，避免满塞 stun 后 world.moving 仅靠 wy 空转 18s）
 * - 库边: 速度相关恢复系数 + 接触点切向冲量 + 总能量护栏（Mathaven & Stronge 的二维简化）
 * - 球球: 全步区间解析 TOI + 含垂直轴自旋的接触点相对速度 + throw 冲量
 * - 球堆力量传导: 同刻/微缝接触网走固定迭代累积冲量，按球号稳定排序；
 *   在质心系做总能量护栏，保留线动量并防止多接触恢复目标重复供能
 */
import {
  applyBallCollisionImpulse,
  ballContactRelativeVelocity,
  BALL_RESTITUTION,
  BALL_THROW_FRICTION,
} from './physics/collision-model';
import {
  createCushionSegments,
  createPocketGeometries,
  getPocketCaptureDepth,
  getPocketAimWindow,
  worldToPocketLocal,
  type CushionSegment,
  type PocketGeometry,
} from './physics/table-geometry';
export {
  applyBallCollisionImpulse,
  ballContactRelativeVelocity,
  BALL_RESTITUTION,
  BALL_THROW_FRICTION,
  predictBallCollisionDirections,
  solveBallCollisionImpulse,
  type BallCollisionBody,
  type BallCollisionImpulse,
  type BallContactVelocity,
  type PredictedCollisionDirections,
} from './physics/collision-model';
export {
  getPocketAimWindow,
  getPocketCaptureDepth,
  isInsidePocketCapture,
  isInsidePocketShelf,
  pocketLocalToWorld,
  worldToPocketLocal,
  ACTIVE_POCKET_MOUTH_PRESET,
  POCKET_MOUTH_PRESET,
  POCKET_MOUTH_WIDTH_PRESETS,
  type CushionSegment,
  type PocketAimWindow,
  type PocketGeometry,
  type PocketMouthWidthPreset,
  type Point2,
} from './physics/table-geometry';

export const TABLE = {
  width: 1.27,            // 台面宽 1.27m
  length: 2.54,           // 台面长 2.54m
  ballRadius: 0.028575,   // 球半径 57.15mm
} as const;

export const PHYSICS_DT = 1 / 240;  // 240Hz 固定时间步

const G = 9.81;
const R = TABLE.ballRadius;

// ---- 物理参数（经手感仿真调校） ----
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
const CUSHION_SPIN_KICK = 0.18;      // 库边切向摩擦冲量上限 μ·Jn

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
  | { type: "ball-collision"; first: number; second: number; time: number; speed: number }
  | { type: "first-contact"; ball: number; time: number; speed: number }
  | { type: "cushion"; ball: number; time: number; speed: number }
  | {
      type: "pocket";
      ball: number;
      pocket: number;
      time: number;
      speed: number;
      entryX: number;
      entryZ: number;
      entryVx: number;
      entryVz: number;
      entryWx?: number;
      entryWy?: number;
      entryWz?: number;
    };

export type BilliardsWorld = {
  balls: BallState[];
  events: PhysicsEvent[];
  time: number;
  moving: boolean;
  shot: number;
  firstContact: number | null;
  /** 最近/历史固定步处理的全局 TOI 事件批次，用于性能与退化可观测。 */
  lastStepEventCount: number;
  maxStepEventCount: number;
  /** 安全预算耗尽次数；耗尽时不会无检测推进剩余时间。 */
  eventBudgetExhaustions: number;
};

export type Pocket = PocketGeometry;

// 六袋顺序保持：左上、右上、左中、右中、左下、右下。
// 袋口、库边、瞄准与渲染全部消费同一份参数化几何。
export const POCKETS: readonly Pocket[] = createPocketGeometries(TABLE);
export const CUSHION_SEGMENTS: readonly CushionSegment[] =
  createCushionSegments(TABLE, POCKETS);

export type PlannedShot = { angle: number; power: number; target: number; pocket: number; spin?: CueSpin };

function groupFor(number: number): BallGroup {
  if (number === 0) return "cue";
  if (number === 8) return "eight";
  return number < 8 ? "solid" : "stripe";
}

function makeBall(number: number, x: number, z: number): BallState {
  return { id: number, number, group: groupFor(number), x, z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, active: true };
}

// 摆球位置扰动：模拟真实球框无法 100% 贴紧以及台面微小不平。
// 数值控制在球径的 ~1.5% 以内，既不影响人眼识别，也足以打破对称开球。
const RACK_POSITION_JITTER = 0.00045;

/**
 * 对球堆做轻量重叠消除。小球随机偏移后偶发重叠，沿球心连线推开。
 */
function settleRack(balls: BallState[], iterations = 8) {
  const objectBalls = balls.filter((b) => b.number !== 0);
  const minDistance = R * 2;
  for (let i = 0; i < iterations; i++) {
    let moved = false;
    for (let a = 0; a < objectBalls.length; a++) {
      for (let b = a + 1; b < objectBalls.length; b++) {
        const first = objectBalls[a];
        const second = objectBalls[b];
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0 && dist < minDistance) {
          const overlap = (minDistance - dist) * 0.51;
          const nx = dx / dist;
          const nz = dz / dist;
          first.x -= nx * overlap;
          first.z -= nz * overlap;
          second.x += nx * overlap;
          second.z += nz * overlap;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * 创建初始球局。
 * 不传 rng 时用固定摆法（测试与复现用确定性）；
 * 传 rng（如 Math.random）时每局随机摆法：8 号居中、底角一全一花、
 * 其余随机，并叠加微小位置抖动——固定摆法下即使球序不同，
 * 几何完全对称仍会导致同力度开球结果过于相似。
 */
export function createInitialWorld(rng?: () => number): BilliardsWorld {
  // 白球始终放在开球线中点标准位；随机性只用于球堆，避免重开后母球“自己跑位”。
  const balls: BallState[] = [makeBall(0, 0, TABLE.length * 0.25)];

  const rackOrder = rng
    ? shuffledRackOrder(rng)
    : [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 13, 6, 14, 7, 15];
  const diameter = TABLE.ballRadius * 2.015;
  const rowDepth = diameter * Math.sqrt(3) / 2;
  const apexZ = -TABLE.length * 0.25;
  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      const number = rackOrder[index];
      let x = (column - row / 2) * diameter;
      let z = apexZ - row * rowDepth;
      if (rng) {
        x += (rng() - 0.5) * 2 * RACK_POSITION_JITTER;
        z += (rng() - 0.5) * 2 * RACK_POSITION_JITTER;
      }
      balls.push(makeBall(number, x, z));
      index += 1;
    }
  }

  if (rng) settleRack(balls);

  return {
    balls,
    events: [],
    time: 0,
    moving: false,
    shot: 0,
    firstContact: null,
    lastStepEventCount: 0,
    maxStepEventCount: 0,
    eventBudgetExhaustions: 0,
  };
}

/** 随机摆球次序：8 号居中（索引 4），底角两位（索引 9/14）一全一花，其余乱序 */
function shuffledRackOrder(rng: () => number): number[] {
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const pick = (arr: number[]) => arr.splice(Math.floor(rng() * arr.length), 1)[0];
  const cornerA = rng() < 0.5 ? pick(solids) : pick(stripes);
  const cornerB = cornerA < 8 ? pick(stripes) : pick(solids);
  const rest = [...solids, ...stripes];
  const order: number[] = [];
  for (let i = 0; i < 15; i++) {
    if (i === 4) order.push(8);
    else if (i === 9) order.push(cornerA);
    else if (i === 14) order.push(cornerB);
    else order.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  return order;
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

/**
 * 将瞄准角限制在母球朝向对面半台的方向内。
 * 开球时母球在开球区（正 z），球堆在负 z，因此有效方向约为 [-π/2, π/2]；
 * 母球跑到对面半台时则自动翻转前方，避免玩家把杆转到身后导致视角天旋地转。
 */
export function clampAimToForwardHalf(cue: { x: number; z: number } | undefined, angle: number): number {
  if (!cue) return angle;
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (cue.z > 0) {
    // 母球在头台（含开球区），只能朝球堆/负 z 半台
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
  }
  // 母球在球堆半台，只能朝头台/正 z 半台
  if (a > -Math.PI / 2 && a < Math.PI / 2) {
    return a <= 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  return a;
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

  // 力度映射：1-100 -> 速度 0.35-10.0 m/s（满分可开出有力的球堆）
  const normalizedPower = Math.min(100, Math.max(1, power)) / 100;
  const speed = 0.35 + normalizedPower * 9.65;

  cue.vx = Math.sin(angle) * speed;
  cue.vz = -Math.cos(angle) * speed;

  // 球杆冲量直接作用在击球点：水平中心杆不预先“赠送”纯滚动，
  // 因此初始以滑动为主；高/低杆由垂直偏移产生沿滚动轴的角冲量。
  const roll = rollingSpin(cue.vx, cue.vz);
  const sx = spin ? Math.min(1, Math.max(-1, spin.x)) : 0;
  const sy = spin ? Math.min(1, Math.max(-1, spin.y)) : 0;
  // 最大高/低杆约 ±2.6 倍纯滚动角速度；中杆则为 0。
  cue.wx = roll.wx * sx * 2.6;
  cue.wz = roll.wz * sx * 2.6;
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
      const aimWindow = getPocketAimWindow(pocket);

      const pocketDx = aimWindow.center.x - target.x;
      const pocketDz = aimWindow.center.z - target.z;
      const pocketDistance = Math.hypot(pocketDx, pocketDz);
      if (pocketDistance === 0) continue;

      const ghostX = target.x - (pocketDx / pocketDistance) * R * 2;
      const ghostZ = target.z - (pocketDz / pocketDistance) * R * 2;

      if (Math.abs(ghostX) > TABLE.width / 2 || Math.abs(ghostZ) > TABLE.length / 2) continue;

      if (!pathClear(
        world,
        target.x,
        target.z,
        aimWindow.center.x,
        aimWindow.center.z,
        new Set([target.number]),
      )) continue;
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

function pocketBall(
  world: BilliardsWorld,
  ball: BallState,
  pocketIndex: number,
  eventTime = world.time,
) {
  const speed = Math.hypot(ball.vx, ball.vz);
  const entryX = ball.x;
  const entryZ = ball.z;
  const entryVx = ball.vx;
  const entryVz = ball.vz;
  const entryWx = ball.wx;
  const entryWy = ball.wy;
  const entryWz = ball.wz;
  ball.active = false;
  ball.vx = 0;
  ball.vz = 0;
  ball.wx = 0;
  ball.wy = 0;
  ball.wz = 0;
  world.events.push({
    type: "pocket",
    ball: ball.number,
    pocket: pocketIndex,
    time: eventTime,
    speed,
    entryX,
    entryZ,
    entryVx,
    entryVz,
    entryWx,
    entryWy,
    entryWz,
  });
}

type BoundaryHit = {
  time: number;
  nx: number;
  nz: number;
  segment: CushionSegment;
};

function considerBoundaryHit(
  current: BoundaryHit | null,
  candidate: BoundaryHit | null,
): BoundaryHit | null {
  if (!candidate) return current;
  if (!current || candidate.time < current.time - 1e-9) return candidate;
  return current;
}

function sweptEndpointHit(
  ball: BallState,
  point: { x: number; z: number },
  maxTime: number,
  segment: CushionSegment,
): BoundaryHit | null {
  const ox = ball.x - point.x;
  const oz = ball.z - point.z;
  const a = ball.vx * ball.vx + ball.vz * ball.vz;
  if (a <= 1e-12) return null;
  const b = 2 * (ox * ball.vx + oz * ball.vz);
  const c = ox * ox + oz * oz - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  for (const time of roots) {
    if (time < -1e-9 || time > maxTime + 1e-9) continue;
    const hx = ball.x + ball.vx * Math.max(0, time);
    const hz = ball.z + ball.vz * Math.max(0, time);
    const length = Math.hypot(hx - point.x, hz - point.z) || 1;
    const nx = (hx - point.x) / length;
    const nz = (hz - point.z) / length;
    if (ball.vx * nx + ball.vz * nz >= -1e-8) continue;
    return { time: Math.max(0, time), nx, nz, segment };
  }
  return null;
}

function sweptSegmentHit(
  ball: BallState,
  segment: CushionSegment,
  maxTime: number,
): BoundaryHit | null {
  const abx = segment.b.x - segment.a.x;
  const abz = segment.b.z - segment.a.z;
  const length = Math.hypot(abx, abz);
  if (length <= 1e-9) return null;
  const tx = abx / length;
  const tz = abz / length;
  const distance =
    (ball.x - segment.a.x) * segment.inward.x +
    (ball.z - segment.a.z) * segment.inward.z;
  const normalVelocity = ball.vx * segment.inward.x + ball.vz * segment.inward.z;
  let best: BoundaryHit | null = null;

  if (normalVelocity < -1e-8) {
    const time = distance <= R
      ? 0
      : (R - distance) / normalVelocity;
    if (time >= -1e-9 && time <= maxTime + 1e-9) {
      const hx = ball.x + ball.vx * Math.max(0, time);
      const hz = ball.z + ball.vz * Math.max(0, time);
      const projection = (hx - segment.a.x) * tx + (hz - segment.a.z) * tz;
      if (projection >= -1e-8 && projection <= length + 1e-8) {
        best = {
          time: Math.max(0, time),
          nx: segment.inward.x,
          nz: segment.inward.z,
          segment,
        };
      }
    }
  }

  best = considerBoundaryHit(best, sweptEndpointHit(ball, segment.a, maxTime, segment));
  best = considerBoundaryHit(best, sweptEndpointHit(ball, segment.b, maxTime, segment));
  return best;
}

function earliestBoundaryHit(ball: BallState, maxTime: number): BoundaryHit | null {
  let best: BoundaryHit | null = null;
  for (const segment of CUSHION_SEGMENTS) {
    best = considerBoundaryHit(best, sweptSegmentHit(ball, segment, maxTime));
  }
  return best;
}

function earliestPocketDrop(
  ball: BallState,
  maxTime: number,
): { time: number; pocket: number } | null {
  let best: { time: number; pocket: number } | null = null;
  for (const pocket of POCKETS) {
    const local = worldToPocketLocal(pocket, ball);
    const depthVelocity = ball.vx * pocket.outward.x + ball.vz * pocket.outward.z;
    if (depthVelocity <= 1e-9) continue;
    const lateralVelocity = ball.vx * pocket.tangent.x + ball.vz * pocket.tangent.z;
    const insideAt = (time: number) => {
      const depth = local.depth + depthVelocity * time;
      const lateral = local.lateral + lateralVelocity * time;
      const captureDepth = getPocketCaptureDepth(pocket, lateral);
      return captureDepth !== null && depth >= captureDepth - 1e-9;
    };
    let time: number | null = insideAt(0) ? 0 : null;

    // 台内捕获边界是一段半椭圆。解析求交可在 240Hz 高速步进中避免穿过 7–8mm 凹弧。
    if (time === null) {
      const depthScale = pocket.captureInset;
      const lateralScale = pocket.dropHalfWidth;
      const a = (depthVelocity / depthScale) ** 2 +
        (lateralVelocity / lateralScale) ** 2;
      const b = 2 * (
        local.depth * depthVelocity / (depthScale ** 2) +
        local.lateral * lateralVelocity / (lateralScale ** 2)
      );
      const c = (local.depth / depthScale) ** 2 +
        (local.lateral / lateralScale) ** 2 - 1;
      const discriminant = b * b - 4 * a * c;
      if (a > 1e-12 && discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        for (const candidate of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
          if (candidate < -1e-9 || candidate > maxTime + 1e-9) continue;
          const clampedTime = Math.max(0, candidate);
          const depth = local.depth + depthVelocity * clampedTime;
          if (depth <= 1e-7 && insideAt(clampedTime)) {
            time = time === null ? clampedTime : Math.min(time, clampedTime);
          }
        }
      }
    }

    // 极斜来球也可能从横向进入已越过袋口线的捕获区；用边界候选补齐该连续情况。
    if (time === null) {
      const candidates = [
        -local.depth / depthVelocity,
        lateralVelocity === 0 ? Infinity : (pocket.dropHalfWidth - local.lateral) / lateralVelocity,
        lateralVelocity === 0 ? Infinity : (-pocket.dropHalfWidth - local.lateral) / lateralVelocity,
      ].filter(candidate => candidate >= -1e-9 && candidate <= maxTime + 1e-9);
      for (const candidate of candidates) {
        const clampedTime = Math.max(0, candidate);
        if (insideAt(clampedTime)) {
          time = time === null ? clampedTime : Math.min(time, clampedTime);
        }
      }
    }

    if (time === null) continue;
    if (!best || time < best.time) best = { time: Math.max(0, time), pocket: pocket.index };
  }
  return best;
}

function resolveBoundaryVelocity(
  world: BilliardsWorld,
  ball: BallState,
  hit: BoundaryHit,
  eventTime = world.time,
) {
  const incomingNormal = ball.vx * hit.nx + ball.vz * hit.nz;
  if (incomingNormal >= 0) return;
  const speed = Math.abs(incomingNormal);
  const e = Math.max(CUSHION_E_MIN, CUSHION_E_BASE - CUSHION_E_SLOPE * speed);
  const tx = -hit.nz;
  const tz = hit.nx;
  const tangentVelocity = ball.vx * tx + ball.vz * tz + ball.wy * R;
  const normalImpulse = -(1 + e) * incomingNormal;
  const unconstrainedTangentImpulse = -tangentVelocity / 3.5;
  const tangentLimit = CUSHION_SPIN_KICK * normalImpulse;
  const tangentImpulse = Math.max(
    -tangentLimit,
    Math.min(tangentLimit, unconstrainedTangentImpulse),
  );

  const energyBefore = kineticEnergy(ball);
  ball.vx += normalImpulse * hit.nx + tangentImpulse * tx;
  ball.vz += normalImpulse * hit.nz + tangentImpulse * tz;
  ball.wy += tangentImpulse / (0.4 * R);
  ball.wx *= CUSHION_TANGENTIAL_KEEP;
  ball.wz *= CUSHION_TANGENTIAL_KEEP;

  // 数值护栏：库边是被动接触，不得创生平动+转动总能。
  const energyAfter = kineticEnergy(ball);
  if (energyAfter > energyBefore + 1e-10 && energyAfter > 0) {
    const scale = Math.sqrt(energyBefore / energyAfter);
    ball.vx *= scale;
    ball.vz *= scale;
    ball.wx *= scale;
    ball.wy *= scale;
    ball.wz *= scale;
  }
  world.events.push({ type: "cushion", ball: ball.number, time: eventTime, speed });
}

const EVENT_TIME_EPS = 1e-9;
const CONTACT_SPEED_EPS = 1e-8;
const CONTACT_POSITION_EPS = 1e-8;
// 摆球为防浮点重叠保留了 1.5%R 微缝；在高速冲击中视为同一接触网。
const SIMULTANEOUS_CONTACT_SLOP = R * 0.02;
const MAX_STEP_EVENTS = 96;
const CONTACT_SOLVER_ITERATIONS = 24;

type BallPairHit = {
  time: number;
  first: BallState;
  second: BallState;
  nx: number;
  nz: number;
};

type StepEvent =
  | { type: 'ball'; time: number; hit: BallPairHit }
  | { type: 'boundary'; time: number; ball: BallState; hit: BoundaryHit }
  | { type: 'pocket'; time: number; ball: BallState; pocket: number };

function kineticEnergy(ball: BallState): number {
  const linear = ball.vx * ball.vx + ball.vz * ball.vz;
  const angular = 0.4 * R * R * (
    ball.wx * ball.wx + ball.wy * ball.wy + ball.wz * ball.wz
  );
  return 0.5 * (linear + angular);
}

/** 解整个未来时间区间的球球 TOI，而不依赖步末已经重叠。 */
function sweptBallPairHit(
  first: BallState,
  second: BallState,
  maxTime: number,
): BallPairHit | null {
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const rvx = second.vx - first.vx;
  const rvz = second.vz - first.vz;
  const diameter = R * 2;
  const distanceSquared = dx * dx + dz * dz;
  const relativeSpeedSquared = rvx * rvx + rvz * rvz;
  const distance = Math.sqrt(distanceSquared) || diameter;
  const currentNx = distanceSquared > 1e-18 ? dx / distance : 1;
  const currentNz = distanceSquared > 1e-18 ? dz / distance : 0;
  const currentNormalSpeed = rvx * currentNx + rvz * currentNz;

  if (distanceSquared <= diameter * diameter + CONTACT_POSITION_EPS) {
    if (currentNormalSpeed >= -CONTACT_SPEED_EPS) return null;
    return { time: 0, first, second, nx: currentNx, nz: currentNz };
  }
  if (relativeSpeedSquared <= 1e-14) return null;

  const b = dx * rvx + dz * rvz;
  if (b >= 0) return null;
  const c = distanceSquared - diameter * diameter;
  const discriminant = b * b - relativeSpeedSquared * c;
  if (discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / relativeSpeedSquared;
  if (time < -EVENT_TIME_EPS || time > maxTime + EVENT_TIME_EPS) return null;
  const clampedTime = Math.max(0, time);
  const hitDx = dx + rvx * clampedTime;
  const hitDz = dz + rvz * clampedTime;
  const hitDistance = Math.hypot(hitDx, hitDz) || diameter;
  return {
    time: clampedTime,
    first,
    second,
    nx: hitDx / hitDistance,
    nz: hitDz / hitDistance,
  };
}

function stepEventPriority(event: StepEvent): number {
  if (event.type === 'ball') return 0;
  if (event.type === 'boundary') return 1;
  return 2;
}

function findEarliestStepEvents(activeBalls: BallState[], maxTime: number): StepEvent[] {
  let earliest = Infinity;
  let events: StepEvent[] = [];
  const consider = (event: StepEvent | null) => {
    if (!event) return;
    if (event.time < earliest - EVENT_TIME_EPS) {
      earliest = event.time;
      events = [event];
    } else if (Math.abs(event.time - earliest) <= EVENT_TIME_EPS) {
      events.push(event);
    }
  };

  for (let first = 0; first < activeBalls.length; first += 1) {
    const ball = activeBalls[first];
    const boundary = earliestBoundaryHit(ball, maxTime);
    if (boundary) consider({ type: 'boundary', time: boundary.time, ball, hit: boundary });
    const pocket = earliestPocketDrop(ball, maxTime);
    if (pocket) consider({ type: 'pocket', time: pocket.time, ball, pocket: pocket.pocket });
    for (let second = first + 1; second < activeBalls.length; second += 1) {
      const hit = sweptBallPairHit(ball, activeBalls[second], maxTime);
      if (hit) consider({ type: 'ball', time: hit.time, hit });
    }
  }

  return events.sort((a, b) => {
    const priority = stepEventPriority(a) - stepEventPriority(b);
    if (priority !== 0) return priority;
    const aNumber = a.type === 'ball' ? Math.min(a.hit.first.number, a.hit.second.number) : a.ball.number;
    const bNumber = b.type === 'ball' ? Math.min(b.hit.first.number, b.hit.second.number) : b.ball.number;
    return aNumber - bNumber;
  });
}

function advanceActiveBalls(balls: BallState[], dt: number) {
  if (dt <= 0) return;
  for (const ball of balls) {
    if (!ball.active) continue;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
  }
}

type ContactConstraint = BallPairHit & {
  speed: number;
  targetNormal: number;
  normalImpulse: number;
  tangentImpulse: number;
};

/**
 * 同刻多接触用固定迭代的累积冲量求解。球号排序保证数组顺序不改变结果，
 * 累积法向冲量非负、切向冲量受 Coulomb 上限约束，防止球堆互相供能。
 */
function resolveBallContacts(
  world: BilliardsWorld,
  hits: BallPairHit[],
  eventTime: number,
) {
  const expandedHits = [...hits];
  const seedKeys = new Set(hits.map((hit) => (
    `${Math.min(hit.first.number, hit.second.number)}:${Math.max(hit.first.number, hit.second.number)}`
  )));
  const known = new Set(seedKeys);
  const active = world.balls.filter((ball) => ball.active).sort((a, b) => a.number - b.number);
  for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
      const first = active[firstIndex];
      const second = active[secondIndex];
      const key = `${first.number}:${second.number}`;
      if (known.has(key)) continue;
      const dx = second.x - first.x;
      const dz = second.z - first.z;
      const distance = Math.hypot(dx, dz);
      if (distance > R * 2 + SIMULTANEOUS_CONTACT_SLOP) continue;
      const nx = distance > 1e-12 ? dx / distance : 1;
      const nz = distance > 1e-12 ? dz / distance : 0;
      expandedHits.push({ time: 0, first, second, nx, nz });
      known.add(key);
    }
  }

  // 只解从本批真实 TOI 边可达的接触岛；桌面另一端的近接触球群不得被纳入动量/能量修正。
  const pending = [...expandedHits];
  while (pending.length > 0) {
    const island = [pending.shift()!];
    const bodies = new Set<BallState>([island[0].first, island[0].second]);
    let added = true;
    while (added) {
      added = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const candidate = pending[index];
        if (!bodies.has(candidate.first) && !bodies.has(candidate.second)) continue;
        island.push(candidate);
        bodies.add(candidate.first);
        bodies.add(candidate.second);
        pending.splice(index, 1);
        added = true;
      }
    }
    const seeded = island.some((hit) => seedKeys.has(
      `${Math.min(hit.first.number, hit.second.number)}:${Math.max(hit.first.number, hit.second.number)}`,
    ));
    if (seeded) resolveContactIsland(world, island, eventTime);
  }
}

function resolveContactIsland(
  world: BilliardsWorld,
  hits: BallPairHit[],
  eventTime: number,
) {
  const contacts: ContactConstraint[] = hits
    .map((hit) => {
      const dx = hit.second.x - hit.first.x;
      const dz = hit.second.z - hit.first.z;
      const distance = Math.hypot(dx, dz) || R * 2;
      const nx = dx / distance;
      const nz = dz / distance;
      const relative = ballContactRelativeVelocity(hit.first, hit.second, nx, nz, R);
      const speed = Math.max(0, -relative.normal);
      const restitution = speed < REST_SPEED ? 0 : BALL_RESTITUTION;
      return {
        ...hit,
        nx,
        nz,
        speed,
        targetNormal: restitution * speed,
        normalImpulse: 0,
        tangentImpulse: 0,
      };
    })
    .sort((a, b) => (
      Math.min(a.first.number, a.second.number) - Math.min(b.first.number, b.second.number)
      || Math.max(a.first.number, a.second.number) - Math.max(b.first.number, b.second.number)
    ));

  const contactBodies = [...new Set(contacts.flatMap((contact) => [contact.first, contact.second]))];
  const energyBefore = contactBodies.reduce((sum, ball) => sum + kineticEnergy(ball), 0);

  for (const contact of contacts) {
    const distance = Math.hypot(
      contact.second.x - contact.first.x,
      contact.second.z - contact.first.z,
    );
    const overlap = R * 2 - distance;
    if (overlap > 0) {
      const correction = overlap * 0.5 + 1e-10;
      contact.first.x -= contact.nx * correction;
      contact.first.z -= contact.nz * correction;
      contact.second.x += contact.nx * correction;
      contact.second.z += contact.nz * correction;
    }
  }

  for (let iteration = 0; iteration < CONTACT_SOLVER_ITERATIONS; iteration += 1) {
    for (const contact of contacts) {
      const relative = ballContactRelativeVelocity(
        contact.first,
        contact.second,
        contact.nx,
        contact.nz,
        R,
      );
      const closingSpeed = Math.max(0, -relative.normal);
      if (closingSpeed >= REST_SPEED) {
        // 接触网中的后续球对在冲击传入时才获得接近速度；
        // 锁定本批观测到的最大接近速度，为每个真实激活的接触施加恢复目标。
        contact.speed = Math.max(contact.speed, closingSpeed);
        contact.targetNormal = Math.max(
          contact.targetNormal,
          BALL_RESTITUTION * closingSpeed,
        );
      }
      const normalDelta = (contact.targetNormal - relative.normal) * 0.5;
      const nextNormal = Math.max(0, contact.normalImpulse + normalDelta);
      const appliedNormal = nextNormal - contact.normalImpulse;
      contact.normalImpulse = nextNormal;
      if (Math.abs(appliedNormal) > 1e-14) {
        applyBallCollisionImpulse(
          contact.first,
          contact.second,
          contact.nx,
          contact.nz,
          R,
          appliedNormal,
          0,
        );
      }

      const tangentRelative = ballContactRelativeVelocity(
        contact.first,
        contact.second,
        contact.nx,
        contact.nz,
        R,
      ).tangent;
      const tangentDelta = -tangentRelative / 7;
      const tangentLimit = BALL_THROW_FRICTION * contact.normalImpulse;
      const nextTangent = Math.max(
        -tangentLimit,
        Math.min(tangentLimit, contact.tangentImpulse + tangentDelta),
      );
      const appliedTangent = nextTangent - contact.tangentImpulse;
      contact.tangentImpulse = nextTangent;
      if (Math.abs(appliedTangent) > 1e-14) {
        applyBallCollisionImpulse(
          contact.first,
          contact.second,
          contact.nx,
          contact.nz,
          R,
          0,
          appliedTangent,
        );
      }
    }
  }

  const energyAfter = contactBodies.reduce((sum, ball) => sum + kineticEnergy(ball), 0);
  if (energyAfter > energyBefore + 1e-10 && contactBodies.length > 0) {
    // 固定迭代多接触恢复目标可能重复做功；在质心系缩放内能，
    // 保持整个接触网线动量，同时确保平动+转动总能不超过冲量前。
    const count = contactBodies.length;
    const comVx = contactBodies.reduce((sum, ball) => sum + ball.vx, 0) / count;
    const comVz = contactBodies.reduce((sum, ball) => sum + ball.vz, 0) / count;
    const comEnergy = 0.5 * count * (comVx * comVx + comVz * comVz);
    const internalBefore = Math.max(0, energyBefore - comEnergy);
    const internalAfter = Math.max(0, energyAfter - comEnergy);
    const scale = internalAfter > 0 ? Math.min(1, Math.sqrt(internalBefore / internalAfter)) : 1;
    for (const ball of contactBodies) {
      ball.vx = comVx + (ball.vx - comVx) * scale;
      ball.vz = comVz + (ball.vz - comVz) * scale;
      ball.wx *= scale;
      ball.wy *= scale;
      ball.wz *= scale;
    }
  }

  const resolvedContacts = contacts.filter((contact) => contact.normalImpulse > 1e-10);
  for (const contact of resolvedContacts) {
    const eventSpeed = Math.max(
      contact.speed,
      contact.normalImpulse * 2 / (1 + BALL_RESTITUTION),
    );
    world.events.push({
      type: 'ball-collision',
      first: contact.first.number,
      second: contact.second.number,
      time: eventTime,
      speed: eventSpeed,
    });
  }

  if (world.firstContact === null) {
    const cueContacts = resolvedContacts
      .filter((contact) => contact.first.number === 0 || contact.second.number === 0)
      .sort((a, b) => b.speed - a.speed || (
        (a.first.number === 0 ? a.second.number : a.first.number)
        - (b.first.number === 0 ? b.second.number : b.first.number)
      ));
    const first = cueContacts[0];
    if (first) {
      const object = first.first.number === 0 ? first.second : first.first;
      world.firstContact = object.number;
      world.events.push({
        type: 'first-contact',
        ball: object.number,
        time: eventTime,
        speed: first.speed,
      });
    }
  }
}

/** 固定步内按全局最早 TOI 统一排序球球、库边和袋口事件。 */
function advanceWorldContinuous(
  world: BilliardsWorld,
  dt: number,
  stepStart: number,
): { iterations: number; exhausted: boolean } {
  let elapsed = 0;
  let iterations = 0;
  while (elapsed < dt - EVENT_TIME_EPS && iterations < MAX_STEP_EVENTS) {
    const activeBalls = world.balls
      .filter((ball) => ball.active)
      .sort((a, b) => a.number - b.number);
    const remaining = dt - elapsed;
    const events = findEarliestStepEvents(activeBalls, remaining);
    if (events.length === 0) {
      advanceActiveBalls(activeBalls, remaining);
      elapsed = dt;
      break;
    }

    const eventDelta = Math.max(0, events[0].time);
    advanceActiveBalls(activeBalls, eventDelta);
    elapsed += eventDelta;
    const eventTime = stepStart + elapsed;

    const ballHits = events
      .filter((event): event is Extract<StepEvent, { type: 'ball' }> => event.type === 'ball')
      .map((event) => event.hit);
    if (ballHits.length > 0) resolveBallContacts(world, ballHits, eventTime);

    for (const event of events) {
      if (event.type !== 'boundary' || !event.ball.active) continue;
      resolveBoundaryVelocity(world, event.ball, event.hit, eventTime);
      event.ball.x += event.hit.nx * 1e-9;
      event.ball.z += event.hit.nz * 1e-9;
    }

    // 同刻球碰/库碰优先；只有冲量后仍沿袋外方向跨过捕获线才落袋。
    for (const event of events) {
      if (event.type !== 'pocket' || !event.ball.active) continue;
      const confirmed = earliestPocketDrop(event.ball, 0);
      if (confirmed?.pocket === event.pocket) {
        pocketBall(world, event.ball, event.pocket, eventTime);
      }
    }

    iterations += 1;
    if (eventDelta <= EVENT_TIME_EPS && ballHits.length === 0 &&
        !events.some((event) => event.type === 'boundary' || event.type === 'pocket')) {
      break;
    }
  }

  const exhausted = iterations >= MAX_STEP_EVENTS && elapsed < dt - EVENT_TIME_EPS;
  // 安全退化：预算耗尽时保留未模拟的位移，绝不在无 CCD 检测下直接推进。
  if (!exhausted && elapsed < dt) advanceActiveBalls(world.balls, dt - elapsed);
  return { iterations, exhausted };
}

/**
 * 台面摩擦：滑动期（û 反方向减速 + 扭矩）→ 纯滚动期（恒定滚动阻力）
 */
function applyClothFriction(ball: BallState, dt: number) {
  const speed = Math.hypot(ball.vx, ball.vz);

  if (speed <= 0 && ball.wx === 0 && ball.wy === 0 && ball.wz === 0) return;

  // 接触点滑动速度 u = v - R·(ω×ŷ)，其中 (ω×ŷ) = (-wz, 0, wx)
  const slipX = ball.vx - R * (-ball.wz);
  const slipZ = ball.vz - R * (ball.wx);
  const slipSpeed = Math.hypot(slipX, slipZ);

  if (slipSpeed > SLIP_EPS) {
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
  // 静止残旋叠加正比项：满塞 stun 后球停在原地时，wy≈238 rad/s 全靠线性衰减需 18s，
  // 期间 world.moving 仅靠 wy 维系，系统长时间误报"球在运动中"；
  // 正比衰减使任何量级残旋都在 ~2s 内收敛，视觉上是球原地打转自然停下
  if (ball.wy !== 0) {
    const moving = Math.hypot(ball.vx, ball.vz) > STOP_SPEED;
    const rate = moving ? SPIN_DECEL : SPIN_DECEL * 6 + Math.abs(ball.wy) * 2;
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
  const stepStart = world.time;
  const stepResult = advanceWorldContinuous(world, dt, stepStart);
  world.lastStepEventCount = stepResult.iterations;
  world.maxStepEventCount = Math.max(world.maxStepEventCount, stepResult.iterations);
  if (stepResult.exhausted) world.eventBudgetExhaustions += 1;
  world.time = stepStart + dt;

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
