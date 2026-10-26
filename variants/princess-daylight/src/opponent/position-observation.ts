import type { BilliardsWorld } from '../physics';
import { generateCandidates } from '../planner/candidates';
import type { PositionOutcome } from './model';

/** Without a declared position plan, judge whether a legal pot left a playable next shot.
 * Geometric opportunity, not a guarantee of a pot; no extra physics search on the UI thread.
 */
export function positionAfterPot(world: BilliardsWorld, legal: number[]): PositionOutcome {
  if (!world.balls.some(ball => ball.active && legal.includes(ball.number))) return 'unknown';
  return generateCandidates(world, legal).some(shot =>
    shot.tolerance >= .008 && shot.cutAngle <= 1.05 && shot.cueDistance + shot.pocketDistance <= 2.8)
    ? 'success' : 'miss';
}
