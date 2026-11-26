import { describe, expect, it } from 'vitest';
import type { PhysicsEvent } from '../physics';
import { createCompanionDialogue } from '../opponent/companion-dialogue';
import { resolveStoppedShot } from './match-machine';
import { settledShot } from './shot-log';
import { potHighlight } from './shot-highlights';
import type { MatchState, ShotFacts } from './types';

const match: MatchState = {
  phase: 'rolling', actor: 'player', playerGroup: 'solid', breaking: false,
  winner: null, messageKey: 'rolling', messageParams: {},
};
const facts = (pocketed: number[], extra: Partial<ShotFacts> = {}): ShotFacts => ({
  shotId: 1, pocketed, firstContact: 1, cushionAfterFirstContact: true, cueScratch: false,
  remainingSolids: 3, remainingStripes: 5, ...extra,
});
function record(pocketed: number[], extra?: Partial<ShotFacts>, before = match) {
  const shot = facts(pocketed, extra);
  return settledShot(before, shot, resolveStoppedShot(before, shot));
}
const first: PhysicsEvent = { type: 'first-contact', ball: 1, time: 1, speed: 2 };
const cueContact: PhysicsEvent = { type: 'ball-collision', first: 0, second: 1, time: 1, speed: 2 };
const transfer: PhysicsEvent = { type: 'ball-collision', first: 1, second: 3, time: 1.2, speed: 1 };
const pocket = (ball: number): PhysicsEvent => ({
  type: 'pocket', ball, pocket: 2, time: 3, speed: .4, entryX: 0, entryZ: 0, entryVx: .4, entryVz: 0,
});
const rail = (ball: number, time: number, x: number): PhysicsEvent => ({
  type: 'cushion', ball, time, speed: .5, rail: { side: x > 0 ? 'right' : 'left', x, z: .2 },
});

describe('特殊进球的逐杆事实', () => {
  it('只数本方合法入袋，同杆双球和开球、代进球、犯规各自独立', () => {
    expect(potHighlight(record([1, 3]), [])).toMatchObject({ kind: 'multiple-pots', balls: [1, 3] });
    expect(potHighlight(record([1, 9]), [])).toBeNull();
    expect(potHighlight(record([1, 3], { cueScratch: true }), [])).toBeNull();
    expect(potHighlight(record([1, 3], {}, { ...match, breaking: true }), [])).toBeNull();
  });

  it('传球必须有明确先后，排除同时接触和抢先碰过目标球的混战', () => {
    expect(potHighlight(record([3]), [cueContact, first, transfer, pocket(3)]))
      .toMatchObject({ kind: 'combination-pot', from: 1, target: 3 });
    expect(potHighlight(record([3]), [cueContact, first, { ...transfer, time: 1 }, pocket(3)])).toBeNull();
    expect(potHighlight(record([3]), [
      cueContact, first, transfer, { ...transfer, first: 4, time: 2 }, pocket(3),
    ])).toBeNull();
  });

  it('两次有效碰库才提示，袋口、短时间重复接触和白球进球后的碰库不计', () => {
    expect(potHighlight(record([1]), [cueContact, first, rail(1, 1.4, .55), rail(1, 2, -.55), pocket(1)]))
      .toMatchObject({ kind: 'multi-rail-pot', target: 1, rails: 2 });
    expect(potHighlight(record([1]), [
      cueContact, first, rail(1, 1.4, .55), rail(1, 1.41, .55),
      { type: 'cushion', ball: 1, time: 2, speed: .5 }, pocket(1), rail(0, 3.5, -.55),
    ])).toBeNull();
    expect(potHighlight(record([1]), [rail(0, .2, -.55), rail(0, .6, .55), cueContact, first, pocket(1)]))
      .toMatchObject({ kind: 'kick-pot', rails: 2 });
  });

  it('专属台词绕过普通冷却，连续触发时换一句，黑八结束也能回应', () => {
    const director = createCompanionDialogue(() => .99);
    const play = (shotId: number) => {
      const shot = facts([1, 3], { shotId });
      return director.settle(match, shot, resolveStoppedShot(match, shot), 1000 + shotId, undefined,
        { kind: 'multiple-pots', balls: [1, 3], shotId, actor: 'player' });
    };
    const firstLine = play(1)!;
    expect(firstLine.kind).toBe('highlight');
    director.shown(firstLine.id, 1001);
    expect(play(2)?.text).not.toBe(firstLine.text);
    const eight = facts([8], { shotId: 3, firstContact: 8, remainingSolids: 0 });
    expect(director.settle(match, eight, resolveStoppedShot(match, eight), 1010, undefined,
      { kind: 'multi-rail-pot', target: 8, rails: 2, shotId: 3, actor: 'player' })?.kind).toBe('highlight');
  });
});
