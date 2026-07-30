/*
[INPUT]: 依赖 physics 的 BilliardsWorld / TABLE / POCKETS 统一物理几何
[OUTPUT]: 对外提供精瞄候选检测、拨轮最近袋口解、袋口窗口反解、迟滞判定与 pocket 名称
[POS]: 纯瞄准几何层；把 360° 世界角映射为目标球→袋口的局部高精度窗口，不依赖 UI/规则/渲染
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  POCKETS,
  TABLE,
  getPocketAimWindow,
  getCueBall,
  predictBallCollisionDirections,
  type BilliardsWorld,
  type Pocket,
} from '../physics';

const R = TABLE.ballRadius;
export const PRECISION_ENTER_MULTIPLIER = 2.6;
export const PRECISION_EXIT_MULTIPLIER = 4;

const POCKET_NAMES = ['左上底袋', '右上底袋', '左中袋', '右中袋', '左下底袋', '右下底袋'];

export type PrecisionAimSolution = {
  target: number;
  pocket: number;
  pocketName: string;
  centerAngle: number;
  leftAngle: number;
  rightAngle: number;
  halfWidth: number;
  offset: number;
  error: number;
};

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDelta(a: number, b: number): number {
  return wrapAngle(a - b);
}

function pathClear(
  world: BilliardsWorld,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  ignored: ReadonlySet<number>,
): boolean {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) return false;
  for (const ball of world.balls) {
    if (!ball.active || ignored.has(ball.number)) continue;
    const t = Math.min(
      1,
      Math.max(0, ((ball.x - fromX) * dx + (ball.z - fromZ) * dz) / lengthSquared),
    );
    const nearestX = fromX + dx * t;
    const nearestZ = fromZ + dz * t;
    if (Math.hypot(ball.x - nearestX, ball.z - nearestZ) < R * 2) return false;
  }
  return true;
}

/** 当前世界瞄准角首先撞到的目标球；无球则返回 null。 */
export function firstObjectHit(world: BilliardsWorld, angle: number): number | null {
  const cue = getCueBall(world);
  if (!cue?.active) return null;
  const dx = Math.sin(angle);
  const dz = -Math.cos(angle);
  let bestT = Infinity;
  let best: number | null = null;
  for (const ball of world.balls) {
    if (!ball.active || ball.number === 0) continue;
    const ox = ball.x - cue.x;
    const oz = ball.z - cue.z;
    const projection = ox * dx + oz * dz;
    if (projection <= 0) continue;
    const perpendicular2 = ox * ox + oz * oz - projection * projection;
    const diameter2 = (R * 2) ** 2;
    if (perpendicular2 >= diameter2) continue;
    const t = projection - Math.sqrt(diameter2 - perpendicular2);
    if (t < bestT) {
      bestT = t;
      best = ball.number;
    }
  }
  return best;
}

/**
 * 把袋口横向位置 offset(-1..1) 反解为世界瞄准角。
 * offset=0 指向有效袋口中心，±1 指向两侧角尖内缩后的可进球边界。
 */
export function aimAngleForPocketOffset(
  world: BilliardsWorld,
  targetNumber: number,
  pocketIndex: number,
  offset: number,
): number | null {
  return pocketAimGeometry(world, targetNumber, pocketIndex, offset)?.angle ?? null;
}

function pocketAimGeometry(
  world: BilliardsWorld,
  targetNumber: number,
  pocketIndex: number,
  offset: number,
): { angle: number; ghostX: number; ghostZ: number } | null {
  const cue = getCueBall(world);
  const target = world.balls.find((ball) => ball.number === targetNumber && ball.active);
  const pocket = POCKETS[pocketIndex];
  if (!cue?.active || !target || !pocket) return null;

  const aimWindow = getPocketAimWindow(pocket);
  const clampedOffset = Math.max(-1, Math.min(1, offset));
  const mouthX = aimWindow.center.x + pocket.tangent.x * clampedOffset * aimWindow.halfWidth;
  const mouthZ = aimWindow.center.z + pocket.tangent.z * clampedOffset * aimWindow.halfWidth;
  const pdx = mouthX - target.x;
  const pdz = mouthZ - target.z;
  const pocketDistance = Math.hypot(pdx, pdz);
  if (pocketDistance <= 1e-9) return null;
  const objectDx = mouthX - target.x;
  const objectDz = mouthZ - target.z;
  const objectDistance = Math.hypot(objectDx, objectDz);
  if (objectDistance <= 1e-9) return null;
  const desiredX = objectDx / objectDistance;
  const desiredZ = objectDz / objectDistance;
  const geometricGhostX = target.x - desiredX * R * 2;
  const geometricGhostZ = target.z - desiredZ * R * 2;
  const geometricAngle = Math.atan2(geometricGhostX - cue.x, -(geometricGhostZ - cue.z));

  // 物理球球碰撞含切向摩擦（throw）；围绕几何杆向做小范围确定性反解，
  // 让预测的真实目标球方向指向所选袋口落点，而不是只让理想法线指向它。
  let best: { angle: number; ghostX: number; ghostZ: number; error: number } | null = null;
  for (let step = -80; step <= 80; step += 1) {
    const angle = geometricAngle + step * 0.001;
    const cueDx = Math.sin(angle);
    const cueDz = -Math.cos(angle);
    const ox = target.x - cue.x;
    const oz = target.z - cue.z;
    const projection = ox * cueDx + oz * cueDz;
    const perpendicular2 = ox * ox + oz * oz - projection * projection;
    const diameter2 = (R * 2) ** 2;
    if (projection <= 0 || perpendicular2 >= diameter2) continue;
    const hitDistance = projection - Math.sqrt(diameter2 - perpendicular2);
    const ghostX = cue.x + cueDx * hitDistance;
    const ghostZ = cue.z + cueDz * hitDistance;
    const nx = (target.x - ghostX) / (R * 2);
    const nz = (target.z - ghostZ) / (R * 2);
    const predicted = predictBallCollisionDirections(cueDx, cueDz, nx, nz);
    const error = Math.abs(
      Math.atan2(
        predicted.object.x * desiredZ - predicted.object.z * desiredX,
        predicted.object.x * desiredX + predicted.object.z * desiredZ,
      ),
    );
    if (!best || error < best.error) best = { angle, ghostX, ghostZ, error };
  }
  if (!best) return null;
  return {
    angle: best.angle,
    ghostX: best.ghostX,
    ghostZ: best.ghostZ,
  };
}

export function aimSolutionForPocket(
  world: BilliardsWorld,
  targetNumber: number,
  pocketIndex: number,
  currentAngle: number,
): PrecisionAimSolution | null {
  const cue = getCueBall(world);
  const target = world.balls.find((ball) => ball.number === targetNumber && ball.active);
  const pocket: Pocket | undefined = POCKETS[pocketIndex];
  if (!cue?.active || !target || !pocket) return null;
  const aimWindow = getPocketAimWindow(pocket);
  if (!pathClear(
    world,
    target.x,
    target.z,
    aimWindow.center.x,
    aimWindow.center.z,
    new Set([targetNumber]),
  )) return null;

  const center = pocketAimGeometry(world, targetNumber, pocketIndex, 0);
  const leftAngle = aimAngleForPocketOffset(world, targetNumber, pocketIndex, -1);
  const rightAngle = aimAngleForPocketOffset(world, targetNumber, pocketIndex, 1);
  if (!center || leftAngle === null || rightAngle === null) return null;
  const centerAngle = center.angle;
  if (!pathClear(
    world,
    cue.x,
    cue.z,
    center.ghostX,
    center.ghostZ,
    new Set([0, targetNumber]),
  )) return null;

  const left = angleDelta(leftAngle, centerAngle);
  const right = angleDelta(rightAngle, centerAngle);
  const halfWidth = Math.max(0.0005, (Math.abs(left) + Math.abs(right)) / 2);
  const error = angleDelta(currentAngle, centerAngle);
  const offset = error < 0
    ? error / Math.max(0.0005, Math.abs(left))
    : error / Math.max(0.0005, Math.abs(right));

  return {
    target: targetNumber,
    pocket: pocketIndex,
    pocketName: POCKET_NAMES[pocketIndex] ?? `${pocketIndex} 号袋`,
    centerAngle,
    leftAngle,
    rightAngle,
    halfWidth,
    offset: Math.max(-1, Math.min(1, offset)),
    error,
  };
}

/**
 * 只有当前首碰球合法、目标球到袋口无遮挡，且杆向进入袋口窗口附近时才返回精瞄解。
 * 本函数只给出纯几何候选；是否激活浮层由交互层在用户选定幽灵球后决定。
 */
export function findPrecisionAim(
  world: BilliardsWorld,
  currentAngle: number,
  legalTargets: readonly number[],
  multiplier = PRECISION_ENTER_MULTIPLIER,
): PrecisionAimSolution | null {
  const best = findAimDialTarget(world, currentAngle, legalTargets);
  if (!best || Math.abs(best.error) > best.halfWidth * multiplier) return null;
  return best;
}

/**
 * 拨轮的候选袋口不受精瞄触发窗限制：幽灵球落位后拨轮始终可用，
 * 本函数只负责返回当前合法首碰球最接近的畅通袋口，供连续变速与提示使用。
 */
export function findAimDialTarget(
  world: BilliardsWorld,
  currentAngle: number,
  legalTargets: readonly number[],
): PrecisionAimSolution | null {
  const target = firstObjectHit(world, currentAngle);
  if (target === null || !legalTargets.includes(target)) return null;
  let best: PrecisionAimSolution | null = null;
  for (let pocket = 0; pocket < POCKETS.length; pocket += 1) {
    const solution = aimSolutionForPocket(world, target, pocket, currentAngle);
    if (!solution) continue;
    if (!best || Math.abs(solution.error) / solution.halfWidth < Math.abs(best.error) / best.halfWidth) {
      best = solution;
    }
  }
  return best;
}

/** 已进入精瞄后用更宽的退出窗，避免临界角附近来回跳模式。 */
export function precisionStillValid(
  world: BilliardsWorld,
  currentAngle: number,
  legalTargets: readonly number[],
  active: Pick<PrecisionAimSolution, 'target' | 'pocket'>,
): boolean {
  const next = aimSolutionForPocket(world, active.target, active.pocket, currentAngle);
  return (
    legalTargets.includes(active.target) &&
    next !== null &&
    Math.abs(next.error) <= next.halfWidth * PRECISION_EXIT_MULTIPLIER
  );
}
