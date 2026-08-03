/*
[INPUT]: 只依赖常量表与纯数学；禁止依赖 React、DOM、规则状态或渲染层
[OUTPUT]: 对外输出 240 Hz 确定性世界：步进、统一袋口内弧捕获几何、球碰/首碰/碰库/落袋事件、标准开球位与击球接口
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
 * - 库边: 速度相关恢复系数 + 切向摩擦 + 侧旋反踢（Mathaven & Stronge 的简化版）
 * - 球球: 恢复系数 + 切向摩擦（throw）+ TOI 回滚（步内精确触点，对齐瞄准辅助线）
 * - 球堆力量传导: 一球同时冲向两球的"叉路"接触走三联立求解（detectFork/resolveForkTriple），
 *   冲量按接触几何分配；若逐对顺序结算，索引在前的接触会吃掉全部法向冲量形成单链动量漏斗，
 *   开球 77% 动能灌进一颗球、球堆炸不散。低速堆叠（<REST_SPEED）仍按完全非弹性逐对处理防抖动
 */
import {
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
  BALL_RESTITUTION,
  BALL_THROW_FRICTION,
  predictBallCollisionDirections,
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
const FORK_MIN_SPEED = 0.5;          // 叉路联立求解的冲球者最低速度（远高于 REST_SPEED，低速堆叠仍走逐对防抖路径）

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
    };

export type BilliardsWorld = {
  balls: BallState[];
  events: PhysicsEvent[];
  time: number;
  moving: boolean;
  shot: number;
  firstContact: number | null;
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

  return { balls, events: [], time: 0, moving: false, shot: 0, firstContact: null };
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

function pocketBall(world: BilliardsWorld, ball: BallState, pocketIndex: number) {
  const speed = Math.hypot(ball.vx, ball.vz);
  const entryX = ball.x;
  const entryZ = ball.z;
  const entryVx = ball.vx;
  const entryVz = ball.vz;
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
    time: world.time,
    speed,
    entryX,
    entryZ,
    entryVx,
    entryVz,
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
) {
  const incomingNormal = ball.vx * hit.nx + ball.vz * hit.nz;
  if (incomingNormal >= 0) return;
  const speed = Math.abs(incomingNormal);
  const e = Math.max(CUSHION_E_MIN, CUSHION_E_BASE - CUSHION_E_SLOPE * speed);
  const tx = -hit.nz;
  const tz = hit.nx;
  const tangentVelocity = ball.vx * tx + ball.vz * tz;
  const outgoingNormal = -incomingNormal * e;
  const outgoingTangent =
    tangentVelocity * CUSHION_TANGENTIAL_KEEP + ball.wy * R * CUSHION_SPIN_KICK;
  ball.vx = hit.nx * outgoingNormal + tx * outgoingTangent;
  ball.vz = hit.nz * outgoingNormal + tz * outgoingTangent;
  ball.wy *= CUSHION_SPIN_DAMP;
  const roll = rollingSpin(ball.vx, ball.vz);
  ball.wx = ball.wx * 0.4 + roll.wx * 0.6;
  ball.wz = ball.wz * 0.4 + roll.wz * 0.6;
  world.events.push({ type: "cushion", ball: ball.number, time: world.time, speed });
}

/**
 * 球心对直线库边与圆弧离散角衬做连续扫掠，按最早接触结算；
 * 一固定步最多处理三次边界接触，避免高速球穿过袋角或在尖点无限迭代。
 */
function advanceBallAgainstTable(world: BilliardsWorld, ball: BallState, dt: number) {
  let remaining = dt;
  for (let collision = 0; collision < 3 && remaining > 1e-8; collision += 1) {
    const hit = earliestBoundaryHit(ball, remaining);
    const drop = earliestPocketDrop(ball, remaining);
    if (drop && (!hit || drop.time <= hit.time + 1e-9)) {
      ball.x += ball.vx * drop.time;
      ball.z += ball.vz * drop.time;
      pocketBall(world, ball, drop.pocket);
      return;
    }
    if (!hit) {
      ball.x += ball.vx * remaining;
      ball.z += ball.vz * remaining;
      return;
    }

    ball.x += ball.vx * hit.time;
    ball.z += ball.vz * hit.time;
    remaining -= hit.time;
    resolveBoundaryVelocity(world, ball, hit);
    // 离开接触面一丝，避免下一轮把同一接触重复判为 t=0。
    ball.x += hit.nx * 1e-7;
    ball.z += hit.nz * 1e-7;
    remaining = Math.max(0, remaining - 1e-8);
  }

  if (ball.active && remaining > 0) {
    ball.x += ball.vx * remaining;
    ball.z += ball.vz * remaining;
  }
}

/**
 * 叉路接触：冲球者同时冲向两颗低速球（球堆内的一球对两球接触）。
 * 逐对顺序结算会把全部法向冲量给索引在前的接触，形成索引序单链动量漏斗
 * （实测开球 77% 动能灌进一颗角球）；联立求解让冲量按接触几何分配，
 * 对称叉路两目标各得约一半（等质量假设下切向分量各自保持，法向满足 e 恢复）。
 */
type ForkContact = { striker: BallState; targets: [BallState, BallState] };

function detectFork(world: BilliardsWorld, first: BallState, second: BallState): ForkContact | null {
  for (const [candidate, other] of [[first, second], [second, first]] as const) {
    const strikerSpeed = Math.hypot(candidate.vx, candidate.vz);
    if (strikerSpeed < FORK_MIN_SPEED) continue;
    if (Math.hypot(other.vx, other.vz) > strikerSpeed * 0.5) continue;
    let extra: BallState | null = null;
    for (const ball of world.balls) {
      if (ball === candidate || ball === other || !ball.active) continue;
      const dx = ball.x - candidate.x;
      const dz = ball.z - candidate.z;
      const minimum = R * 2;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > minimum * minimum) continue;
      const distance = Math.sqrt(distanceSquared) || minimum;
      const approaching =
        ((ball.vx - candidate.vx) * dx + (ball.vz - candidate.vz) * dz) / distance;
      if (approaching >= -REST_SPEED) continue;
      if (Math.hypot(ball.vx, ball.vz) > strikerSpeed * 0.5) continue;
      if (extra) { extra = null; break; } // 三接触及以上：退回逐对顺序结算
      extra = ball;
    }
    if (extra) return { striker: candidate, targets: [other, extra] };
  }
  return null;
}

/** 叉路三联立：等质量、冲量只沿接触法线，2×2 线性方程求解两目标法向速度 */
function resolveForkTriple(world: BilliardsWorld, fork: ForkContact, dt: number) {
  const { striker, targets } = fork;
  const minimum = R * 2;

  // 两接触各自求本步内 TOI，取最早触点统一回滚三球
  let t0 = 0;
  for (const target of targets) {
    const dx = target.x - striker.x;
    const dz = target.z - striker.z;
    const rvx = target.vx - striker.vx;
    const rvz = target.vz - striker.vz;
    const a = rvx * rvx + rvz * rvz;
    const b = rvx * dx + rvz * dz;
    const c = dx * dx + dz * dz - minimum * minimum;
    const disc = b * b - a * c;
    if (a > 1e-12 && disc > 0) {
      let t = (-b - Math.sqrt(disc)) / a;
      if (t < -dt) t = -dt;
      if (t > 0) t = 0;
      if (t < t0) t0 = t;
    }
  }
  for (const ball of [striker, targets[0], targets[1]]) {
    ball.x += ball.vx * t0;
    ball.z += ball.vz * t0;
  }

  // 触点法线与各接触法向接近速度（冲量前的相对速度）
  const normals: Array<{ nx: number; nz: number; rvn: number; rvx: number; rvz: number }> = [];
  for (const target of targets) {
    const cdx = target.x - striker.x;
    const cdz = target.z - striker.z;
    const cDist = Math.hypot(cdx, cdz) || minimum;
    const rvx = target.vx - striker.vx;
    const rvz = target.vz - striker.vz;
    const nx = cdx / cDist;
    const nz = cdz / cDist;
    normals.push({ nx, nz, rvn: rvx * nx + rvz * nz, rvx, rvz });
  }

  // 2β1 + c·β2 = -(1+e)·rvn1；c·β1 + 2β2 = -(1+e)·rvn2（等质量动量守恒 + 各接触 e 恢复）
  const e = BALL_RESTITUTION;
  const cDot = normals[0].nx * normals[1].nx + normals[0].nz * normals[1].nz;
  const rhs0 = -(1 + e) * normals[0].rvn;
  const rhs1 = -(1 + e) * normals[1].rvn;
  const det = 4 - cDot * cDot;
  let beta0 = (2 * rhs0 - cDot * rhs1) / det;
  let beta1 = (2 * rhs1 - cDot * rhs0) / det;
  // 解出负冲量（接触实际在分离）时退化该接触为普通两球碰撞
  if (beta0 < 0) { beta0 = 0; beta1 = rhs1 / 2; }
  if (beta1 < 0) { beta1 = 0; beta0 = rhs0 / 2; }
  if (beta0 < 0) beta0 = 0;
  if (beta1 < 0) beta1 = 0;
  const betas = [beta0, beta1];

  for (let i = 0; i < 2; i += 1) {
    const { nx, nz } = normals[i];
    const beta = betas[i];
    targets[i].vx += beta * nx;
    targets[i].vz += beta * nz;
    striker.vx -= beta * nx;
    striker.vz -= beta * nz;
  }

  // 切向摩擦（throw）：逐接触按 beta 当法向冲量，与逐对路径同式
  for (let i = 0; i < 2; i += 1) {
    const { nx, nz, rvx, rvz } = normals[i];
    const tx = -nz;
    const tz = nx;
    const relativeTangent = rvx * tx + rvz * tz;
    const jt =
      Math.min(BALL_THROW_FRICTION * betas[i], Math.abs(relativeTangent) * 0.5) *
      Math.sign(relativeTangent);
    striker.vx += jt * tx * 0.5;
    striker.vz += jt * tz * 0.5;
    targets[i].vx -= jt * tx * 0.5;
    targets[i].vz -= jt * tz * 0.5;
  }

  // 用碰撞后的新速度走完本步剩余时间（与逐对路径一致，保持链条逐步多跳传播）
  const advance = -t0;
  if (advance > 0) {
    for (const ball of [striker, targets[0], targets[1]]) {
      ball.x += ball.vx * advance;
      ball.z += ball.vz * advance;
    }
  }

  for (let i = 0; i < targets.length; i += 1) {
    if (betas[i] <= 0) continue;
    world.events.push({
      type: "ball-collision",
      first: striker.number,
      second: targets[i].number,
      time: world.time,
      speed: Math.abs(normals[i].rvn),
    });
  }

  if (world.firstContact === null) {
    const cueInvolved = striker.number === 0 || targets.some((t) => t.number === 0);
    if (cueInvolved) {
      const object =
        striker.number === 0
          ? Math.abs(normals[0].rvn) >= Math.abs(normals[1].rvn)
            ? targets[0]
            : targets[1]
          : striker;
      world.firstContact = object.number;
      world.events.push({
        type: "first-contact",
        ball: object.number,
        time: world.time,
        speed: Math.max(Math.abs(normals[0].rvn), Math.abs(normals[1].rvn)),
      });
    }
  }
}

/**
 * 球球碰撞：法向冲量 + 切向摩擦（throw）
 * 高速碰撞先做 TOI（time-of-impact）回滚：固定步进下球在步内过冲，
 * 若按过冲位置算法线，出射角最多可偏十几度（240Hz、4m/s 时步长占 2R 的 30%）。
 * 回滚到本步内精确触点再结算，使实际球路与瞄准辅助线（理想 ghost-ball 几何）对齐。
 */
function resolveBallPair(world: BilliardsWorld, first: BallState, second: BallState, dt: number): boolean {
  if (!first.active || !second.active) return false;

  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const minimum = R * 2;
  const distanceSquared = dx * dx + dz * dz;

  if (distanceSquared > minimum * minimum) return false;

  const rvx = second.vx - first.vx;
  const rvz = second.vz - first.vz;

  // 当前法向（仅用于判断是否接近与低速路径）
  const distanceNow = Math.sqrt(distanceSquared) || minimum;
  const approachingNow = (rvx * dx + rvz * dz) / distanceNow;
  if (approachingNow >= 0) return false;

  // 高速叉路：冲球者同时冲向两颗低速球时走三联立求解，避免索引序动量漏斗
  if (-approachingNow >= REST_SPEED) {
    const fork = detectFork(world, first, second);
    if (fork) {
      resolveForkTriple(world, fork, dt);
      return true;
    }
  }

  let nx: number, nz: number;
  let advanceFirst = 0;
  let advanceSecond = 0;

  if (-approachingNow < REST_SPEED) {
    // 低速接触：过冲可忽略，按完全非弹性处理，避免静态接触抖动互相供能
    nx = dx / distanceNow;
    nz = dz / distanceNow;
    const overlap = minimum - distanceNow;
    first.x -= nx * overlap * 0.5;
    first.z -= nz * overlap * 0.5;
    second.x += nx * overlap * 0.5;
    second.z += nz * overlap * 0.5;
  } else {
    // 高速碰撞：解 |r + rv·t|² = (2R)² 求本步内精确碰撞时刻 t0 ≤ 0
    const a = rvx * rvx + rvz * rvz;
    const b = rvx * dx + rvz * dz;
    const c = distanceSquared - minimum * minimum; // < 0（重叠中）
    const disc = b * b - a * c;
    let t0 = 0;
    if (a > 1e-12 && disc > 0) {
      t0 = (-b - Math.sqrt(disc)) / a; // 最近的过去时刻
      if (t0 < -dt) t0 = -dt; // 上一步遗留重叠时只回滚本步
      if (t0 > 0) t0 = 0;
    }
    // 回滚两球到触点
    first.x += first.vx * t0;
    first.z += first.vz * t0;
    second.x += second.vx * t0;
    second.z += second.vz * t0;
    // 触点法线（理想 ghost-ball 几何）
    const cdx = second.x - first.x;
    const cdz = second.z - first.z;
    const cDist = Math.hypot(cdx, cdz) || minimum;
    nx = cdx / cDist;
    nz = cdz / cDist;
    advanceFirst = -t0;
    advanceSecond = -t0;
  }

  const relativeNormal = rvx * nx + rvz * nz;
  if (relativeNormal >= 0) {
    // 回滚后已分离（数值边界情形），直接前进剩余时间
    first.x += first.vx * advanceFirst;
    first.z += first.vz * advanceFirst;
    second.x += second.vx * advanceSecond;
    second.z += second.vz * advanceSecond;
    return false;
  }

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

  // 用碰撞后的新速度走完本步剩余时间
  if (advanceFirst > 0) {
    first.x += first.vx * advanceFirst;
    first.z += first.vz * advanceFirst;
  }
  if (advanceSecond > 0) {
    second.x += second.vx * advanceSecond;
    second.z += second.vz * advanceSecond;
  }

  world.events.push({
    type: "ball-collision",
    first: first.number,
    second: second.number,
    time: world.time,
    speed: Math.abs(relativeNormal),
  });

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
  return true;
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
  world.time += dt;

  for (const ball of world.balls) {
    if (!ball.active) continue;
    advanceBallAgainstTable(world, ball, dt);
  }

  let collisionOccurred = true;
  let iterations = 0;
  while (collisionOccurred && iterations < 8) {
    collisionOccurred = false;
    for (let first = 0; first < world.balls.length; first += 1) {
      for (let second = first + 1; second < world.balls.length; second += 1) {
        collisionOccurred =
          resolveBallPair(world, world.balls[first], world.balls[second], dt) ||
          collisionOccurred;
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
