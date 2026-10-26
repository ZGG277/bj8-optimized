/** Favor the princess through shot choice, never by rewriting physics or a result. */
import { confidenceAdjustedLevel, createOpponentProfile, levelLabel, levelToSigma, type GameMode, type OpponentProfile, type PlayerSkillProfile } from './model';

export const FRIENDLY_STYLE_DESCRIPTION = '对手不打防守，会多留机会；每局结束后按公主的准度和走位调整';

export function createFriendlyOpponentProfile(player: PlayerSkillProfile, mode: GameMode): OpponentProfile {
  const original = createOpponentProfile(player, mode);
  const recent = player.recentResults ?? [];
  // A loss relaxes the next match promptly; wins only ease this relief back gradually.
  const relief = Math.min(10, recent.reduce((value, won) => Math.max(0, value + (won ? -1 : 3)), 0));
  const level = Math.max(0, Math.min(mode === 'practice' ? 48 : 62,
    confidenceAdjustedLevel(player) - (mode === 'practice' ? 10 : 6) - relief));
  return {
    ...original,
    effectiveLevel: level, targetLevel: level, tierLevel: Math.round(level), label: levelLabel(level),
    aimSigma: levelToSigma(level),
    aimWindowFraction: mode === 'practice' ? 1.75 : 1.5,
    powerJitter: mode === 'practice' ? .14 : .10,
    tactical: {
      ...original.tactical, allowSafety: false,
      candidateLimit: mode === 'practice' ? 3 : 4,
      simulationLimit: mode === 'practice' ? 15 : 18,
      followUpWeight: 0,
      alternativeChance: mode === 'practice' ? .45 : .3,
      opportunityChance: Math.min(.82, (mode === 'practice' ? .62 : .46) + relief * .015),
      deadlineMs: mode === 'practice' ? 750 : 1000,
    },
  };
}

/** More give-backs while ahead or on a run, without changing the locked skill level. */
export function friendlyTurnTactics(profile: OpponentProfile, playerRemaining: number, opponentRemaining: number, run: number) {
  const lead = Math.max(0, playerRemaining - opponentRemaining);
  const extra = Math.min(.18, lead * .06) + (run >= 2 ? .26 : run === 1 ? .14 : 0);
  return { ...profile.tactical, allowSafety: false,
    opportunityChance: Math.min(.94, (profile.tactical.opportunityChance ?? 0) + extra) };
}
