import { describe, expect, it } from 'vitest';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import { companionInstruction, earlyEightAnnouncement, groupInstruction, terminalEightInstruction } from './companion-instructions';
const match = () => beginMatch(createInitialMatchState());

describe('companion-owned operational instructions', () => {
  it('announces each real group with the companion’s own group', () => {
    expect(groupInstruction(null)).toBeNull();
    expect(groupInstruction('solid')).toBe('公主这局打全色球，1到7号，我打花色。');
    expect(groupInstruction('stripe')).toBe('公主这局打花色球，9到15号，我打全色。');
  });
  it('prioritizes the required event above the guide without replacing the speaker or identity', () => {
    const rule = { id: 4, sceneId: 'P_SCRATCH', text: '公主白球进袋啦，该我打咯。', companionId: 'lu-jingchen' };
    expect(companionInstruction({ match: match(), prioritySpeech: rule, guide: '下拉蓄力' })).toBe(rule);
  });
  it('keeps the placement correction actionable and the free ball in the same channel', () => {
    const placing = { ...match(), phase: 'placing' as const, messageKey: 'placing-freeball' as const };
    expect(companionInstruction({ match: placing })?.text).toContain('光圈');
    const rule = { id: 1, sceneId: 'N_SCRATCH', text: '我把白球打进袋了。' };
    expect(companionInstruction({ match: { ...placing, messageKey: 'place-occupied' }, prioritySpeech: rule })?.text).toContain('有球');
  });
  it.each([
    { actor: 'player', firstContact: 8, pocketed: [8], remainingSolids: 2, key: 'lose-8-foul', shooter: '公主' },
    { actor: 'player', firstContact: 3, pocketed: [3, 8], remainingSolids: 0, key: 'lose-8-early', shooter: '公主' },
    { actor: 'opponent', firstContact: 9, pocketed: [8], remainingSolids: 2, key: 'lose-8-early', shooter: '我' },
  ] as const)('explains a premature black eight for $actor ($key)', ({ actor, firstContact, pocketed, remainingSolids, key, shooter }) => {
    const { next } = resolveStoppedShot({ ...match(), actor, playerGroup: 'solid', breaking: false }, {
      shotId: 1, firstContact, pocketed: [...pocketed], remainingSolids, remainingStripes: 2,
      cueScratch: false, cushionAfterFirstContact: false,
    });
    expect(next.messageKey).toBe(key);
    expect(next.winner).toBe(actor === 'player' ? 'opponent' : 'player');
    expect(earlyEightAnnouncement(next)?.text).toBe(`${shooter}提前打进黑八啦，这局就结束了。咱们再来一局。`);
    expect(terminalEightInstruction(next)).toBe('清完本组球后，下一杆才能打黑八。');
  });

  it('separates a terminal foul from a turn handoff and announces black eight only while aiming', () => {
    const finished = { ...match(), phase: 'finished' as const, messageKey: 'lose-8-foul' as const, messageParams: { actor: 'opponent' as const, reason: 'scratch' as const } };
    expect(earlyEightAnnouncement(finished)).toBeNull();
    expect(companionInstruction({ match: finished, guide: '下拉蓄力' })).toBeNull();
    expect(terminalEightInstruction(finished)).toBe('我打进了黑八，但这杆白球也进袋了，这局结束啦。');
    expect(companionInstruction({ match: match(), eightReady: true })?.text).toContain('黑八');
    expect(companionInstruction({ match: { ...match(), phase: 'rolling' }, eightReady: true })).toBeNull();
  });
});
