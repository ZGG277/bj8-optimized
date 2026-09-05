/*
[INPUT]: 当前世界、用户当前杆向与合法首碰球；复用 aim 的袋口畅通性和 physics 的球碰出射预测
[OUTPUT]: 仅供相机构图冻结的首碰目标/出射袋口身份；不返回也不修改杆向、拨轮或物理状态
[POS]: 相机语义层；按实际目标球出射方向选袋，不能借用拨轮的角窗归一误差排序
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  getCueBall,
  getPocketAimWindow,
  POCKETS,
  TABLE,
  predictBallCollisionDirections,
  type BilliardsWorld,
} from './physics';
import { aimSolutionForPocket, firstObjectHit } from './aim/aim-solution';

export type CameraAimIntent = {
  target: number;
  pocket: number;
  /** 目标球实际出射向量与目标→袋口向量的夹角，越小越贴近真实球路。 */
  directionError: number;
};

const R = TABLE.ballRadius;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function objectDirectionAtFirstContact(
  world: BilliardsWorld,
  angle: number,
  targetNumber: number,
) {
  const cue = getCueBall(world);
  const target = world.balls.find(ball => ball.active && ball.number === targetNumber);
  if (!cue?.active || !target) return null;
  const cueDx = Math.sin(angle);
  const cueDz = -Math.cos(angle);
  const offsetX = target.x - cue.x;
  const offsetZ = target.z - cue.z;
  const projection = offsetX * cueDx + offsetZ * cueDz;
  const perpendicular2 = offsetX * offsetX + offsetZ * offsetZ - projection * projection;
  const diameter = R * 2;
  if (projection <= 0 || perpendicular2 >= diameter * diameter) return null;
  const contactDistance = projection - Math.sqrt(Math.max(0, diameter * diameter - perpendicular2));
  const contactX = cue.x + cueDx * contactDistance;
  const contactZ = cue.z + cueDz * contactDistance;
  const normalX = (target.x - contactX) / diameter;
  const normalZ = (target.z - contactZ) / diameter;
  const predicted = predictBallCollisionDirections(cueDx, cueDz, normalX, normalZ).object;
  const magnitude = Math.hypot(predicted.x, predicted.z);
  return magnitude > 1e-8 ? { x: predicted.x / magnitude, z: predicted.z / magnitude } : null;
}

/**
 * 相机袋口只由“当前首碰后目标球将往哪里走”决定：
 * - 先复用 aimSolutionForPocket 过滤被挡的目标→袋口路线；
 * - 再以 physics 的碰撞出射方向最小化未归一化的实际夹角；
 * - dot<=0 的反向袋永不入选，避免薄切把画面带到目标球身后。
 */
export function inferCameraAimIntent(
  world: BilliardsWorld,
  angle: number,
  legalTargets: readonly number[],
): CameraAimIntent | null {
  const targetNumber = firstObjectHit(world, angle);
  if (targetNumber === null || !legalTargets.includes(targetNumber)) return null;
  const target = world.balls.find(ball => ball.active && ball.number === targetNumber);
  const direction = objectDirectionAtFirstContact(world, angle, targetNumber);
  if (!target || !direction) return null;

  let best: CameraAimIntent | null = null;
  for (let index = 0; index < POCKETS.length; index += 1) {
    // 复用既有的清路/袋口窗口几何；不要用它的 currentAngle 误差排名。
    if (!aimSolutionForPocket(world, targetNumber, index, angle)) continue;
    const mouth = getPocketAimWindow(POCKETS[index]);
    const toPocketX = mouth.center.x - target.x;
    const toPocketZ = mouth.center.z - target.z;
    const distance = Math.hypot(toPocketX, toPocketZ);
    if (distance <= 1e-8) continue;
    const nx = toPocketX / distance;
    const nz = toPocketZ / distance;
    const dot = direction.x * nx + direction.z * nz;
    if (dot <= 0) continue;
    const directionError = Math.acos(clamp(dot, -1, 1));
    if (!best || directionError < best.directionError - 1e-10 ||
      (Math.abs(directionError - best.directionError) <= 1e-10 && index < best.pocket)) {
      best = { target: targetNumber, pocket: index, directionError };
    }
  }
  return best;
}
