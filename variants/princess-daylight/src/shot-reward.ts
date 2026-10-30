import type { RoundResolution, ShotFacts } from './match/types';

export type ShotReward = {
  shotId: number;
  ballNumbers: number[];
  text: string;
};

export function rewardForStoppedShot(facts: ShotFacts, resolution: RoundResolution): ShotReward | null {
  const next = resolution.next;
  if (next.phase === 'finished' || next.messageParams.actor !== 'player'
    || (next.messageKey !== 'pot-continue' && next.messageKey !== 'group-assigned')) return null;
  const ballNumbers = facts.pocketed.filter(number => {
    if (number < 1 || number > 15 || number === 8) return false;
    if (!next.playerGroup) return true;
    return next.playerGroup === 'solid' ? number < 8 : number > 8;
  });
  if (!ballNumbers.length) return null;
  return {
    shotId: facts.shotId,
    ballNumbers,
    text: ballNumbers.length > 1 ? `连进 ${ballNumbers.length} 球 · 继续` : '漂亮进球 · 继续',
  };
}
