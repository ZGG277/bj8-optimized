/*
[INPUT]: 只依赖二维单位向量与球球恢复/切向摩擦参数
[OUTPUT]: 对外提供 BALL_RESTITUTION、BALL_THROW_FRICTION 与碰撞后母球/目标球方向预测
[POS]: 物理纯碰撞模型；被 stepWorld、瞄准辅助与精瞄反解共享，不依赖世界状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
export const BALL_RESTITUTION = 0.97;
export const BALL_THROW_FRICTION = 0.055;

export type PredictedCollisionDirections = {
  object: { x: number; z: number };
  cue: { x: number; z: number };
  objectSpeedRatio: number;
  cueSpeedRatio: number;
};

/**
 * 单位速度母球撞静止目标球后的二维方向预测。
 * 公式必须与 physics.ts resolveBallPair 的法向冲量/throw 保持一致。
 */
export function predictBallCollisionDirections(
  cueDx: number,
  cueDz: number,
  normalX: number,
  normalZ: number,
): PredictedCollisionDirections {
  const cueLength = Math.hypot(cueDx, cueDz) || 1;
  const normalLength = Math.hypot(normalX, normalZ) || 1;
  const dx = cueDx / cueLength;
  const dz = cueDz / cueLength;
  const nx = normalX / normalLength;
  const nz = normalZ / normalLength;
  const relativeNormal = -(dx * nx + dz * nz);
  const jn = Math.max(0, -(1 + BALL_RESTITUTION) * relativeNormal * 0.5);
  const tx = -nz;
  const tz = nx;
  const relativeTangent = -(dx * tx + dz * tz);
  const jt =
    Math.min(BALL_THROW_FRICTION * jn, Math.abs(relativeTangent) * 0.5) *
    Math.sign(relativeTangent);

  const objectVx = jn * nx - jt * tx * 0.5;
  const objectVz = jn * nz - jt * tz * 0.5;
  const cueVx = dx - jn * nx + jt * tx * 0.5;
  const cueVz = dz - jn * nz + jt * tz * 0.5;
  const objectSpeedRatio = Math.hypot(objectVx, objectVz);
  const cueSpeedRatio = Math.hypot(cueVx, cueVz);
  return {
    object: {
      x: objectSpeedRatio > 0 ? objectVx / objectSpeedRatio : nx,
      z: objectSpeedRatio > 0 ? objectVz / objectSpeedRatio : nz,
    },
    cue: {
      x: cueSpeedRatio > 0 ? cueVx / cueSpeedRatio : 0,
      z: cueSpeedRatio > 0 ? cueVz / cueSpeedRatio : 0,
    },
    objectSpeedRatio,
    cueSpeedRatio,
  };
}
