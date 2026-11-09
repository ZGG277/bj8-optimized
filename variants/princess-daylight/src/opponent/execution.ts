/** One execution draw, shared by production and seeded evidence. Never retries a result. */
import type { ShotCandidate } from '../planner/candidates';
import { isObviousPot } from './tactical-shot';
import { sampleOpponentAimOffset, type OpponentProfile } from './model';
export function sampleOpponentExecution(shot: Pick<ShotCandidate, 'angle' | 'power' | 'tolerance' | 'friendlyOpportunity'> & Partial<Pick<ShotCandidate, 'cueDistance' | 'pocketDistance' | 'cutAngle'>>, profile: OpponentProfile, rng: () => number = Math.random) {
  const gentleContact = shot.friendlyOpportunity === true;
  const cleanAttack = !gentleContact && shot.cueDistance !== undefined && shot.pocketDistance !== undefined &&
    shot.cutAngle !== undefined && isObviousPot({
      cueDistance: shot.cueDistance, pocketDistance: shot.pocketDistance, cutAngle: shot.cutAngle, tolerance: shot.tolerance,
    });
  const sigma = gentleContact ? .0005 : cleanAttack ? shot.tolerance * .22 : profile.aimSigma;
  const aimWindow = gentleContact || cleanAttack ? .8 : profile.aimWindowFraction;
  const angle = shot.angle + sampleOpponentAimOffset(
    Math.min(profile.aimSigma, sigma), shot.tolerance, rng, aimWindow,
  );
  const jitter = gentleContact ? .005 : cleanAttack ? .015 : profile.powerJitter;
  return { angle, power: Math.min(100, Math.max(1, shot.power * (1 + (rng() * 2 - 1) * jitter))) };
}
