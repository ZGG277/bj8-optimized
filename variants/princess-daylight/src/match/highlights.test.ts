import { describe, expect, it } from 'vitest';
import { addShotHighlight, EMPTY_HIGHLIGHTS } from './highlights';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from './match-machine';
import type { ShotFacts } from './types';
const base = { ...beginMatch(createInitialMatchState()), breaking: false, playerGroup: 'solid' as const };
const shot = (patch: Partial<ShotFacts> = {}): ShotFacts => ({ shotId: 1, firstContact: 1, pocketed: [1], cueScratch: false, cushionAfterFirstContact: true, remainingSolids: 6, remainingStripes: 7, ...patch });
const add = (previous = EMPTY_HIGHLIGHTS, facts = shot(), before = base) => addShotHighlight(previous, before, facts, resolveStoppedShot(before, facts));
describe('real match highlights', () => {
  it('counts only legal player-group balls, and resets the run after a miss', () => {
    const two = add(EMPTY_HIGHLIGHTS, shot({ pocketed: [1, 2, 9], remainingSolids: 5, remainingStripes: 6 }));
    expect(two).toEqual({ shots: 1, legalPots: 2, bestRun: 2, run: 2 });
    const three = add(two, shot({ pocketed: [3] }));
    const miss = add(three, shot({ pocketed: [] }));
    expect(miss).toEqual({ shots: 3, legalPots: 3, bestRun: 3, run: 0 });
    expect(add(miss).bestRun).toBe(3);
  });
  it('never rewards scratches, early 8 or opponent pots', () => {
    expect(add(EMPTY_HIGHLIGHTS, shot({ cueScratch: true })).legalPots).toBe(0);
    expect(add(EMPTY_HIGHLIGHTS, shot({ pocketed: [8] })).legalPots).toBe(0);
    const before = { ...base, actor: 'opponent' as const };
    expect(addShotHighlight(EMPTY_HIGHLIGHTS, before, shot(), resolveStoppedShot(before, shot()))).toBe(EMPTY_HIGHLIGHTS);
  });
  it('includes a clean winning 8 and counts a legal break before grouping', () => {
    expect(add(EMPTY_HIGHLIGHTS, shot({ firstContact: 8, pocketed: [8], remainingSolids: 0 })).legalPots).toBe(1);
    const before = beginMatch(createInitialMatchState());
    const facts = shot({ pocketed: [1, 9] });
    expect(addShotHighlight(EMPTY_HIGHLIGHTS, before, facts, resolveStoppedShot(before, facts)).legalPots).toBe(2);
  });
});
