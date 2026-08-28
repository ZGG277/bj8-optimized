/*
[INPUT]: 母球到当前/上一指针落点的世界坐标差、上一个稳定杆向与近球区状态
[OUTPUT]: 对外提供带最小中心距离、跨心检测和迟滞的幽灵球杆向/距离解析
[POS]: input 的纯几何稳定器，防止低采样快速穿心或边界噪声把角度奇点传入 React 与相机状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

export const GHOST_RELEASE_HYSTERESIS_RATIO = 0.1;

export type GhostAimResolution = {
  angle: number;
  distance: number;
  nearCue: boolean;
};

export type GhostAimInput = {
  dx: number;
  dz: number;
  previousDx?: number | null;
  previousDz?: number | null;
  previousAngle: number;
  nearCue: boolean;
  minDistance: number;
};

function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function segmentPassesWithinRadius(
  fromX: number | null | undefined,
  fromZ: number | null | undefined,
  toX: number,
  toZ: number,
  radius: number,
): boolean {
  if (
    !Number.isFinite(fromX) ||
    !Number.isFinite(fromZ) ||
    !Number.isFinite(toX) ||
    !Number.isFinite(toZ) ||
    radius <= 0
  ) return false;

  const startX = fromX as number;
  const startZ = fromZ as number;
  const vx = toX - startX;
  const vz = toZ - startZ;
  const lengthSq = vx * vx + vz * vz;
  if (lengthSq === 0) return Math.hypot(startX, startZ) <= radius;
  const t = Math.min(1, Math.max(0, -(startX * vx + startZ * vz) / lengthSq));
  return Math.hypot(startX + vx * t, startZ + vz * t) <= radius;
}

/**
 * 幽灵球进入两球心最小距离后，固定在上一个稳定杆向的安全圆周上。
 * 离开时需额外跨过 10% 迟滞带，避免指针噪声在边界反复切换。
 */
export function resolveGhostAim({
  dx,
  dz,
  previousDx,
  previousDz,
  previousAngle,
  nearCue,
  minDistance,
}: GhostAimInput): GhostAimResolution {
  const safeMinDistance = Number.isFinite(minDistance) && minDistance > 0
    ? minDistance
    : 0;
  const pointerDistance = Math.hypot(dx, dz);
  const releaseDistance = safeMinDistance * (1 + GHOST_RELEASE_HYSTERESIS_RATIO);
  // 高频采样通常会真实进入安全圆；低采样快速穿过母球时，线段检测补上遗漏帧。
  const crossedCueSafetyCircle = !nearCue && segmentPassesWithinRadius(
    previousDx,
    previousDz,
    dx,
    dz,
    safeMinDistance,
  );
  const shouldStayStable = crossedCueSafetyCircle ||
    pointerDistance <= (nearCue ? releaseDistance : safeMinDistance);

  if (!Number.isFinite(pointerDistance) || shouldStayStable) {
    return {
      angle: normalizeAngle(previousAngle),
      distance: safeMinDistance,
      nearCue: true,
    };
  }

  return {
    angle: Math.atan2(dx, -dz),
    distance: pointerDistance,
    nearCue: false,
  };
}
