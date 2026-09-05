/*
[INPUT]: 只依赖二维接触法线、球心速度、垂直轴角速度与球半径
[OUTPUT]: 对外提供球球接触点相对速度、法/切向冲量及共享的碰后方向预测
[POS]: 物理纯接触模型；stepWorld 与 aim 预测的唯一球球冲量事实源，不依赖世界状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
export const BALL_RESTITUTION = 0.97;
export const BALL_THROW_FRICTION = 0.055;

/** 等质量实心球：m=1，I=2/5 mR²。 */
const SPHERE_INERTIA_FACTOR = 2 / 5;

export type BallCollisionBody = {
  vx: number;
  vz: number;
  wy: number;
};

export type BallContactVelocity = {
  normal: number;
  tangent: number;
  tx: number;
  tz: number;
};

export type BallCollisionImpulse = BallContactVelocity & {
  normalImpulse: number;
  tangentImpulse: number;
};

/**
 * 球球接触点的相对速度（second - first）。
 * 水平切向速度包含两球垂直轴自旋；这是 throw 与侧旋传递的输入。
 */
export function ballContactRelativeVelocity(
  first: BallCollisionBody,
  second: BallCollisionBody,
  nx: number,
  nz: number,
  radius: number,
): BallContactVelocity {
  const length = Math.hypot(nx, nz) || 1;
  const unitNx = nx / length;
  const unitNz = nz / length;
  const tx = -unitNz;
  const tz = unitNx;
  const relativeVx = second.vx - first.vx;
  const relativeVz = second.vz - first.vz;
  return {
    normal: relativeVx * unitNx + relativeVz * unitNz,
    tangent:
      relativeVx * tx + relativeVz * tz + radius * (first.wy + second.wy),
    tx,
    tz,
  };
}

/**
 * 一次球球冲量解。切向有效质量同时计入两球平动与转动：
 * 2/m + 2R²/I = 7（m=1, I=2/5mR²）。
 */
export function solveBallCollisionImpulse(
  first: BallCollisionBody,
  second: BallCollisionBody,
  nx: number,
  nz: number,
  radius: number,
  restitution = BALL_RESTITUTION,
  friction = BALL_THROW_FRICTION,
): BallCollisionImpulse {
  const relative = ballContactRelativeVelocity(first, second, nx, nz, radius);
  const normalImpulse = relative.normal < 0
    ? -(1 + restitution) * relative.normal * 0.5
    : 0;
  const tangentEffectiveMass = 2 + 2 / SPHERE_INERTIA_FACTOR;
  const unconstrainedTangent = -relative.tangent / tangentEffectiveMass;
  const tangentLimit = friction * normalImpulse;
  const tangentImpulse = Math.max(
    -tangentLimit,
    Math.min(tangentLimit, unconstrainedTangent),
  );
  return { ...relative, normalImpulse, tangentImpulse };
}

/** 向等质量两球施加一对大小相等、方向相反的接触冲量。 */
export function applyBallCollisionImpulse(
  first: BallCollisionBody,
  second: BallCollisionBody,
  nx: number,
  nz: number,
  radius: number,
  normalImpulse: number,
  tangentImpulse: number,
) {
  const length = Math.hypot(nx, nz) || 1;
  const unitNx = nx / length;
  const unitNz = nz / length;
  const tx = -unitNz;
  const tz = unitNx;
  const impulseX = normalImpulse * unitNx + tangentImpulse * tx;
  const impulseZ = normalImpulse * unitNz + tangentImpulse * tz;
  first.vx -= impulseX;
  first.vz -= impulseZ;
  second.vx += impulseX;
  second.vz += impulseZ;

  // 两个接触臂反向、冲量也反向，因此两球垂直轴角动量同向改变。
  const angularDelta = tangentImpulse / (SPHERE_INERTIA_FACTOR * radius);
  first.wy += angularDelta;
  second.wy += angularDelta;
}

export type PredictedCollisionDirections = {
  object: { x: number; z: number };
  cue: { x: number; z: number };
  objectSpeedRatio: number;
  cueSpeedRatio: number;
};

/**
 * 单位速度、无初始自旋的母球撞静止目标球后的“瞬时”二维方向。
 * 它不包含随后布面摩擦走位，也不声称预测不同力度/旋转的完整轨迹。
 * 冲量必须经 solve/applyBallCollisionImpulse 与 physics 步进共享。
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
  const cue = { vx: dx, vz: dz, wy: 0 };
  const object = { vx: 0, vz: 0, wy: 0 };
  const impulse = solveBallCollisionImpulse(cue, object, nx, nz, 1);
  applyBallCollisionImpulse(
    cue,
    object,
    nx,
    nz,
    1,
    impulse.normalImpulse,
    impulse.tangentImpulse,
  );

  const objectVx = object.vx;
  const objectVz = object.vz;
  const cueVx = cue.vx;
  const cueVz = cue.vz;
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
