/*
[INPUT]: 指针横向位移、用户主动选择的普通/精调档与当前最近合法袋口几何解
[OUTPUT]: 对外提供无限拨轮的固定双档角度换算与仅供提示的袋口接近度
[POS]: 纯输入换算层；同一档位的手指位移永远对应同一杆向变化，袋口几何不得暗改传动比
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { PrecisionAimSolution } from '../aim/aim-solution';

/** 约 900px 转完整一周；拨轮可反复抬手续拨，因此没有行程边界。 */
export const AIM_DIAL_COARSE_RAD_PER_PX = Math.PI * 2 / 900;
/** 精调离合约 12000px 转完整一周，100px 手势约调整 3°。 */
export const AIM_DIAL_FINE_RAD_PER_PX = Math.PI * 2 / 12000;
/** 进入该倍数后只提示“可精调”，不改变传动比。 */
export const AIM_DIAL_APPROACH_RATIO = 3.8;
/** 退出锁定略宽，避免临界处在两个袋口间闪烁。 */
export const AIM_DIAL_UNLOCK_RATIO = 4.8;

export type AimDialGear = 'normal' | 'fine';

export function aimDialRatio(solution: PrecisionAimSolution | null): number | null {
  if (!solution) return null;
  return Math.abs(solution.error) / Math.max(0.0005, solution.halfWidth);
}

/**
 * 双档均为固定传动比。档位只允许由用户明确选择，绝不读取袋口距离，
 * 从而保证一次手势内和不同球路之间都能建立稳定肌肉记忆。
 */
export function aimDialRadiansPerPixel(gear: AimDialGear): number {
  return gear === 'fine' ? AIM_DIAL_FINE_RAD_PER_PX : AIM_DIAL_COARSE_RAD_PER_PX;
}

export function aimDialAngleDelta(
  pixelDelta: number,
  gear: AimDialGear,
): number {
  return pixelDelta * aimDialRadiansPerPixel(gear);
}
