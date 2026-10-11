/** Shared, opt-in cue-tip calibration. Never reads a target or an outcome. */
import type { CueSpin } from '../physics';
export type FollowFeel = 'current' | 'light-follow';
export const FOLLOW_BIAS = 0.03;
export const FOLLOW_TAPER_RADIUS = 0.25;
/** Equivalent to a very slightly raised tip; explicit spin outside the center stays exact. */
export function followFeelSpin(spin: CueSpin, feel: FollowFeel): CueSpin {
  if (feel === 'current') return { ...spin };
  const radiusSquared = spin.x * spin.x + spin.y * spin.y;
  const weight = Math.max(0, 1 - radiusSquared / FOLLOW_TAPER_RADIUS ** 2);
  return { x: spin.x + FOLLOW_BIAS * weight * weight, y: spin.y };
}
