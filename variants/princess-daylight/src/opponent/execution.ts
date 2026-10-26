/** One execution draw, shared by production and seeded evidence. Never retries a result. */
import type { ShotCandidate } from '../planner/candidates';
import { sampleOpponentAimOffset, type OpponentProfile } from './model';
export function sampleOpponentExecution(shot: Pick<ShotCandidate, 'angle' | 'power' | 'tolerance' | 'friendlyOpportunity'>, profile: OpponentProfile, rng: () => number = Math.random) {
  const gentleContact = shot.friendlyOpportunity === true;
  const angle = shot.angle + sampleOpponentAimOffset(
    gentleContact ? Math.min(profile.aimSigma, 0.0005) : profile.aimSigma,
    shot.tolerance, rng, gentleContact ? 0.8 : profile.aimWindowFraction,
  );
  const jitter = gentleContact ? 0.005 : profile.powerJitter;
  return { angle, power: Math.min(100, Math.max(1, shot.power * (1 + (rng() * 2 - 1) * jitter))) };
}
