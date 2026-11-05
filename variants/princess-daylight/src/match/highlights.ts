/*
[INPUT]: 去重后的真实一杆结算和出杆前击球方/分组
[OUTPUT]: 本局玩家出杆数、合法进球数与最高连续进球数
[POS]: 局后亮点纯聚合；不读取存档、不制造成绩或修改判罚
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { MatchState, RoundResolution, ShotFacts } from './types';
export type MatchHighlights = { shots: number; legalPots: number; bestRun: number; run: number };
export const EMPTY_HIGHLIGHTS: MatchHighlights = { shots: 0, legalPots: 0, bestRun: 0, run: 0 };
export function addShotHighlight(previous: MatchHighlights, before: MatchState, facts: ShotFacts, resolution: RoundResolution): MatchHighlights {
  if (before.actor !== 'player') return previous;
  const next = resolution.next;
  const illegal = next.messageKey === 'foul' || next.messageKey.startsWith('lose-8');
  const group = before.playerGroup ?? next.playerGroup;
  const pots = illegal ? 0 : facts.pocketed.filter(n => n === 8 ? next.winner === 'player'
    : n >= 1 && n <= 15 && (!group || (group === 'solid' ? n < 8 : n > 8))).length;
  const run = pots > 0 ? previous.run + pots : 0;
  return { shots: previous.shots + 1, legalPots: previous.legalPots + pots, bestRun: Math.max(previous.bestRun, run), run };
}
