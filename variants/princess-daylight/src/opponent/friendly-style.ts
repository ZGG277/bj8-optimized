/** Favor the princess through shot choice, never by rewriting physics or a result. */
import { confidenceAdjustedLevel, createOpponentProfile, levelLabel, levelToSigma, recordedAccuracy, type GameMode, type OpponentProfile, type PlayerSkillProfile } from './model';

export const FRIENDLY_STYLE_DESCRIPTION = '按公主多局的准度和走位匹配实力。顺手的球认真打，难球偶尔留一杆机会。';
const MAX_CONSECUTIVE_OPPORTUNITIES = 3;

export function createFriendlyOpponentProfile(player: PlayerSkillProfile, mode: GameMode): OpponentProfile {
  const original = createOpponentProfile(player, mode);
  const practice = mode === 'practice';
  const accuracy = recordedAccuracy(player);
  // Use lifetime evidence. These bounded adjustments complement the difficulty-adjusted level;
  // a single rack carries little weight, and early-eight losses do not change the tier by themselves.
  const precision = (accuracy.successes - .5 * accuracy.attempts) / (accuracy.attempts + 24);
  const route = (player.positionSuccesses - .5 * player.positionAttempts) / (player.positionAttempts + 16);
  const form = (precision * .72 + route * .28) * 8;
  const level = Math.min(100, confidenceAdjustedLevel(player) + (practice ? 8 : 12) + form);
  const progress = Math.max(0, Math.min(1, (level - 25) / 75));
  return {
    ...original,
    effectiveLevel: level, targetLevel: level, tierLevel: Math.round(level), label: levelLabel(level),
    aimSigma: levelToSigma(level),
    aimWindowFraction: (practice ? 1.45 : 1.3) - .45 * progress,
    powerJitter: (practice ? .14 : .10) - .05 * progress,
    tactical: {
      ...original.tactical, allowSafety: false,
      candidateLimit: practice ? 3 : 4,
      simulationLimit: practice ? 15 : 18,
      followUpWeight: (practice ? .42 : .55) * progress,
      alternativeChance: (practice ? .45 : .3) - .2 * progress,
      opportunityChance: (practice ? .48 : .34) - .22 * progress,
      deadlineMs: practice ? 750 : 1000,
    },
  };
}

/** More give-backs while ahead or on a run, without changing the locked skill level. */
export function friendlyTurnTactics(profile: OpponentProfile, playerRemaining: number, opponentRemaining: number, run: number, opportunityStreak: number) {
  if (opportunityStreak >= MAX_CONSECUTIVE_OPPORTUNITIES) {
    return { ...profile.tactical, allowSafety: false, opportunityChance: 0, alternativeChance: 0 };
  }
  const lead = Math.max(0, playerRemaining - opponentRemaining);
  const extra = Math.min(.18, lead * .06) + (run >= 2 ? .26 : run === 1 ? .14 : 0);
  return { ...profile.tactical, allowSafety: false,
    opportunityChance: Math.min(.94, (profile.tactical.opportunityChance ?? 0) + extra) };
}
