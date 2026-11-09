import { describe, expect, it } from 'vitest';
import { beginMatch, createInitialMatchState } from '../match/match-machine';
import { companionInstruction, groupInstruction, terminalFoulInstruction } from './companion-instructions';
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
  it('separates a terminal foul from a turn handoff and announces black eight only while aiming', () => {
    const finished = { ...match(), phase: 'finished' as const, messageKey: 'lose-8-foul' as const, messageParams: { actor: 'opponent' as const, reason: 'scratch' as const } };
    expect(companionInstruction({ match: finished, guide: '下拉蓄力' })).toBeNull();
    expect(terminalFoulInstruction(finished)).toBe('我这杆白球也进袋了，这局归公主啦。');
    expect(companionInstruction({ match: match(), eightReady: true })?.text).toContain('黑八');
    expect(companionInstruction({ match: { ...match(), phase: 'rolling' }, eightReady: true })).toBeNull();
  });
});
