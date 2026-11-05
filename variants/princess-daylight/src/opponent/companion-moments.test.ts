import { describe, expect, it } from 'vitest';
import { COMPANIONS } from './companions';
import { companionMomentLine } from './companion-moments';
describe('companion moment identity', () => {
  it('gives all ten companions distinct short pot and thinking lines', () => {
    for (const moment of ['pot', 'thinking'] as const) {
      const lines = COMPANIONS.map(c => companionMomentLine(c.id, moment));
      expect(new Set(lines).size).toBe(10);
      for (const line of lines) expect(Array.from(line).length).toBeLessThanOrEqual(12);
      expect(companionMomentLine('missing', moment)).toBe(lines[0]);
    }
  });
});
