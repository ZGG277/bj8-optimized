/** 谢不赢的固定友好风格：局前锁档，不读取比分、输赢或连败记录。 */
import { createOpponentProfile, levelLabel, levelToSigma, type GameMode, type OpponentProfile, type PlayerSkillProfile } from './model';

export const FRIENDLY_STYLE_DESCRIPTION = '谢不赢会留些机会，也会认真赢球；本局难度开球后不变';

export function createFriendlyOpponentProfile(player: PlayerSkillProfile, mode: GameMode): OpponentProfile {
  const original = createOpponentProfile(player, mode);
  const level = Math.min(original.effectiveLevel, mode === 'practice' ? 48 : 62);
  return {
    ...original,
    effectiveLevel: level, targetLevel: level, tierLevel: Math.round(level), label: levelLabel(level),
    aimSigma: levelToSigma(level),
    // Finite execution scatter is sampled once. No result rerolls and no guaranteed misses.
    aimWindowFraction: mode === 'practice' ? 1.3 : 1.18,
    powerJitter: mode === 'practice' ? 0.12 : 0.08,
    tactical: {
      ...original.tactical,
      allowSafety: false,
      candidateLimit: mode === 'practice' ? 3 : 4,
      simulationLimit: mode === 'practice' ? 15 : 18,
      followUpWeight: mode === 'practice' ? 0.08 : 0.25,
      alternativeChance: mode === 'practice' ? 0.35 : 0.2,
      opportunityChance: mode === 'practice' ? 0.28 : 0.14,
      deadlineMs: mode === 'practice' ? 750 : 1000,
    },
  };
}
