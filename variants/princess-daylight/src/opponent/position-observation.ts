import type { BilliardsWorld } from '../physics';
import { legalNumbers } from '../match/match-machine';
import type { MatchState, ShotFacts } from '../match/types';
import { generateCandidates } from '../planner/candidates';
import type { ShotCapture } from '../planner/review';
import type { PositionOutcome, ShotSkillObservation } from './model';

export function observePlayerShot(
  capture: ShotCapture & { assisted: boolean },
  worldAfter: BilliardsWorld,
  before: MatchState,
  facts: ShotFacts,
  next: MatchState,
): ShotSkillObservation {
  const foul = next.messageKey === 'foul' || next.messageKey.startsWith('lose-8');
  const legal = legalNumbers(capture.worldBefore, 'player', before.playerGroup);
  let target = capture.intent?.target;
  let tolerance = capture.intent?.halfWidth ?? null;
  if (!capture.breaking && tolerance === null) {
    // A clear near miss can fall outside the fine-aim window. Recover only a nearby
    // direct route to the contacted ball (or a nearby route on a whiff).
    let nearestError = .12;
    for (const shot of generateCandidates(capture.worldBefore, legal)) {
      if (facts.firstContact !== null && shot.target !== facts.firstContact) continue;
      const delta = shot.angle - capture.angle;
      const error = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
      if (error >= nearestError) continue;
      nearestError = error;
      target = shot.target;
      tolerance = shot.tolerance;
    }
  }
  const pocketed = target !== undefined && facts.pocketed.includes(target);
  const continuedAfterPot = !capture.breaking && !foul && next.phase === 'aiming' &&
    next.actor === 'player' && facts.pocketed.some(number => legal.includes(number));
  return {
    tolerance,
    pocketed,
    foul,
    assisted: capture.assisted,
    position: continuedAfterPot
      ? positionAfterPot(worldAfter, legalNumbers(worldAfter, 'player', next.playerGroup))
      : 'unknown',
  };
}

/** Without a declared position plan, judge whether a legal pot left a playable next shot.
 * Geometric opportunity, not a guarantee of a pot; no extra physics search on the UI thread.
 */
export function positionAfterPot(world: BilliardsWorld, legal: number[]): PositionOutcome {
  if (!world.balls.some(ball => ball.active && legal.includes(ball.number))) return 'unknown';
  return generateCandidates(world, legal).some(shot =>
    shot.tolerance >= .008 && shot.cutAngle <= 1.05 && shot.cueDistance + shot.pocketDistance <= 2.8)
    ? 'success' : 'miss';
}
