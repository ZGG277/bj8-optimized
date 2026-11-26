import { describe, expect, it } from 'vitest';
import { isSnookered, safetyHighlight } from '../aim/snooker';
import { legalNumbers, resolveStoppedShot } from '../match/match-machine';
import { factsFromWorld } from '../match/shot-facts';
import { settledShot } from '../match/shot-log';
import type { MatchState, ShotFacts } from '../match/types';
import { createInitialWorld, simulateUntilStop, strikeCueBall } from '../physics';
import { searchEscapeRoute } from './escape-route';

const turn: MatchState = {
  phase: 'aiming', actor: 'player', breaking: false, playerGroup: 'solid', winner: null,
  messageKey: 'miss-turn', messageParams: {},
};
const facts: ShotFacts = {
  shotId: 1, firstContact: 1, pocketed: [], cueScratch: false, cushionAfterFirstContact: true,
  remainingSolids: 1, remainingStripes: 1,
};

function layout(blockerX = 0, blocker = 9, extraTarget = false) {
  const world = createInitialWorld(() => .5);
  for (const ball of world.balls) {
    ball.active = ball.number === 0 || ball.number === 1 || ball.number === 9 || (extraTarget && ball.number === 2);
    ball.x = ball.number === blocker ? blockerX : ball.number === 2 ? .35 : 0;
    ball.z = ball.number === 0 ? .55 : ball.number === blocker ? .2 : -.35;
  }
  return world;
}

describe('封球与单库解球', () => {
  it('只在所有合法首碰都被挡时提示，边缘能擦到或有另一颗可碰时仍是开放球', () => {
    expect(isSnookered(layout(), [1])).toBe(true);
    expect(isSnookered(layout(.06), [1])).toBe(false);
    expect(isSnookered(layout(0, 9, true), [1, 2])).toBe(false);
  });

  it('球友封住玩家时提醒，玩家新做成防守时给出反馈', () => {
    const opponent = { ...turn, actor: 'opponent' } as const;
    const fromOpponent = { ...facts, firstContact: 9 };
    const playerNext = resolveStoppedShot(opponent, fromOpponent);
    expect(safetyHighlight(layout(), settledShot(opponent, fromOpponent, playerNext), playerNext.next, opponent))
      .toMatchObject({ kind: 'snooker', actor: 'opponent' });
    const opponentNext = resolveStoppedShot(turn, facts);
    expect(safetyHighlight(layout(0, 1), settledShot(turn, facts, opponentNext), opponentNext.next, turn, layout(.12, 1)))
      .toMatchObject({ kind: 'snooker', actor: 'player' });
  });

  it('返回的借库线可用原物理引擎重打，首碰合法、整杆无犯规', () => {
    const world = layout();
    const search = searchEscapeRoute(world, turn);
    let step = search.next();
    while (!step.done) step = search.next();
    const route = step.value!;
    expect(route).not.toBeNull();
    expect(route.target).toBe(1);
    expect(strikeCueBall(world, route.angle, route.power, { x: 0, y: 0 })).toBe(true);
    simulateUntilStop(world);
    const legal = legalNumbers(layout(), 'player', turn.playerGroup);
    const shot = factsFromWorld(world);
    const resolution = resolveStoppedShot(turn, shot);
    expect(legal).toContain(shot.firstContact);
    expect(resolution.next.messageParams.reason).toBeUndefined();
    expect(world.events.filter(event => event.type === 'cushion' && event.ball === 0 && event.time <
      world.events.find(contact => contact.type === 'first-contact')!.time)).toHaveLength(1);
    expect(safetyHighlight(world, settledShot(turn, shot, resolution), resolution.next, turn, layout()))
      .toMatchObject({ kind: 'escape', target: 1 });
  });
});
