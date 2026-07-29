/*
[INPUT]: 指针横向位移与当前最近合法袋口几何解
[OUTPUT]: 对外提供无限拨轮的连续变速角度换算与接近/精瞄状态
[POS]: 纯输入换算层；远袋保证可持续旋转，近袋按有效袋口窗口平滑降档，不依赖 React/DOM
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { PrecisionAimSolution } from '../aim/aim-solution';

/** 约 900px 转完整一周；拨轮可反复抬手续拨，因此没有行程边界。 */
export const AIM_DIAL_COARSE_RAD_PER_PX = Math.PI * 2 / 900;
/** 进入该倍数后开始平滑降档，比旧 2.6× 呼出窗更宽。 */
export const AIM_DIAL_APPROACH_RATIO = 3.8;
/** 退出锁定略宽，避免临界处在两个袋口间闪烁。 */
export const AIM_DIAL_UNLOCK_RATIO = 4.8;
/** 精瞄时约 180px 走完整个有效袋口左右边缘。 */
export const AIM_DIAL_FINE_TRAVEL_PX = 180;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function aimDialRatio(solution: PrecisionAimSolution | null): number | null {
  if (!solution) return null;
  return Math.abs(solution.error) / Math.max(0.0005, solution.halfWidth);
}

export function aimDialMode(
  solution: PrecisionAimSolution | null,
): 'coarse' | 'approach' | 'fine' {
  const ratio = aimDialRatio(solution);
  if (ratio === null || ratio >= AIM_DIAL_APPROACH_RATIO) return 'coarse';
  return ratio <= 1 ? 'fine' : 'approach';
}

/**
 * 传动比随袋口接近度连续变化：
 * ratio<=1 时 180px 横跨完整袋口；ratio>=3.8 时回到粗档，中间 smoothstep 插值。
 */
export function aimDialRadiansPerPixel(solution: PrecisionAimSolution | null): number {
  if (!solution) return AIM_DIAL_COARSE_RAD_PER_PX;
  const ratio = aimDialRatio(solution) ?? AIM_DIAL_APPROACH_RATIO;
  const fine = solution.halfWidth * 2 / AIM_DIAL_FINE_TRAVEL_PX;
  const blend = smoothstep((ratio - 1) / (AIM_DIAL_APPROACH_RATIO - 1));
  return fine + (AIM_DIAL_COARSE_RAD_PER_PX - fine) * blend;
}

export function aimDialAngleDelta(
  pixelDelta: number,
  solution: PrecisionAimSolution | null,
): number {
  return pixelDelta * aimDialRadiansPerPixel(solution);
}
