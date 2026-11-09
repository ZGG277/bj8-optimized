/*
[INPUT]: 出杆方、规则结算与同一杆物理事实。
[OUTPUT]: 本局逐杆记录，包含合法入袋、换手、犯规、黑八资格与连杆。
[POS]: 陪练话术的数据来源，记录在当前对局内存中。
[PROTOCOL]: 变更时同步 match/CLAUDE.md。
*/
import { groupOfNumber, oppositeGroup } from './match-machine';
import type { Actor, FoulReason, MatchMessageKey, MatchState, ObjectGroup, RoundResolution, ShotFacts } from './types';

export type SettledShot = Readonly<Omit<ShotFacts, 'pocketed'> & {
  actor: Actor;
  groupAtStart: ObjectGroup | null;
  breaking: boolean;
  pocketed: readonly number[];
  legalPots: readonly number[];
  foul: FoulReason | null;
  result: MatchMessageKey;
  nextActor: Actor | null;
  winner: Actor | null;
  blackEightAtStart: boolean;
  blackEightMiss: boolean;
  scoringRun: number;
}>;

function shooterGroup(playerGroup: ObjectGroup | null, actor: Actor): ObjectGroup | null {
  if (!playerGroup || actor === 'player') return playerGroup;
  return oppositeGroup(playerGroup);
}

export function settledShot(before: MatchState, facts: ShotFacts, { next }: RoundResolution, previous?: SettledShot): SettledShot {
  const pocketed = [...new Set(facts.pocketed)];
  const groupAtStart = shooterGroup(before.playerGroup, before.actor);
  const creditedGroup = groupAtStart ?? shooterGroup(next.playerGroup, before.actor);
  const foul = next.messageParams.reason ?? null;
  const finished = next.phase === 'finished';
  const won = finished && next.messageKey === 'win-8' && next.winner === before.actor;
  const legalPots = foul || (finished && !won) ? [] : pocketed.filter(number => {
    if (number === 8) return won;
    const group = groupOfNumber(number);
    return group !== null && (!creditedGroup || group === creditedGroup);
  });
  const remaining = groupAtStart === 'solid' ? facts.remainingSolids : facts.remainingStripes;
  const blackEightAtStart = !before.breaking && groupAtStart !== null && remaining === 0
    && !pocketed.some(number => groupOfNumber(number) === groupAtStart);
  const nextActor = finished ? null : next.actor;
  const continues = nextActor === before.actor && !before.breaking && legalPots.length > 0;
  const previousRun = previous?.actor === before.actor && previous.nextActor === before.actor ? previous.scoringRun : 0;
  return {
    ...facts, actor: before.actor, groupAtStart, breaking: before.breaking,
    pocketed, legalPots, foul, result: next.messageKey, nextActor,
    winner: next.winner, blackEightAtStart,
    blackEightMiss: blackEightAtStart && !foul && !finished && facts.firstContact === 8 && !pocketed.includes(8),
    scoringRun: continues ? previousRun + 1 : 0,
  };
}
