/** Favor the princess through shot choice, never by rewriting physics or a result. */
import { confidenceAdjustedLevel, createOpponentProfile, levelLabel, levelToSigma, type GameMode, type OpponentProfile, type PlayerSkillProfile } from './model';

export const FRIENDLY_STYLE_DESCRIPTION = '按公主的准度和走位调整下一局。陪练会留机会，连让三杆后认真打一杆。';
const MAX_CONSECUTIVE_OPPORTUNITIES = 3;

export function createFriendlyOpponentProfile(player: PlayerSkillProfile, mode: GameMode): OpponentProfile {
  const original = createOpponentProfile(player, mode);
  const recent = player.recentResults ?? [];
  // A loss relaxes the next match promptly; wins only ease this relief back gradually.
  const relief = Math.min(10, recent.reduce((value, won) => Math.max(0, value + (won ? -1 : 3)), 0));
  const practice = mode === 'practice';
  let accuracyAttempts = 0;
  let accuracySuccesses = 0;
  let routeAttempts = 0;
  let routeSuccesses = 0;
  for (const assessment of (player.recentAssessments ?? []).slice(-3)) {
    accuracyAttempts += assessment.accuracyAttempts;
    accuracySuccesses += assessment.accuracySuccesses;
    routeAttempts += assessment.routeAttempts;
    routeSuccesses += assessment.routeSuccesses;
  }
  // Keep the long-term skill as the anchor; limited evidence moves it only a little.
  const accuracyForm = (accuracySuccesses - .5 * accuracyAttempts) / (accuracyAttempts + 4);
  const routeForm = (routeSuccesses - .6 * routeAttempts) / (routeAttempts + 3);
  const form = (accuracyForm * .72 + routeForm * .28) * 24;
  const level = Math.max(0, Math.min(practice ? 58 : 72,
    confidenceAdjustedLevel(player) + form - (practice ? 10 : 6) - relief));
  const progress = Math.max(0, Math.min(1, (level - 15) / 36));
  return {
    ...original,
    effectiveLevel: level, targetLevel: level, tierLevel: Math.round(level), label: levelLabel(level),
    aimSigma: levelToSigma(level),
    aimWindowFraction: (practice ? 1.75 : 1.5) - .48 * progress,
    powerJitter: (practice ? .14 : .10) - .05 * progress,
    tactical: {
      ...original.tactical, allowSafety: false,
      candidateLimit: practice ? 3 : 4,
      simulationLimit: practice ? 15 : 18,
      followUpWeight: (practice ? .42 : .55) * progress,
      alternativeChance: (practice ? .45 : .3) - .2 * progress,
      opportunityChance: Math.min(.82, (practice ? .62 : .46) - .28 * progress + relief * .015),
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
