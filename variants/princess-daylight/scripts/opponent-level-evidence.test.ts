import { describe, expect, it } from 'vitest';
import {
  createOpponentProfile,
  createPlayerSkillProfile,
  sampleOpponentAimOffset,
} from '../src/opponent/model';

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function profileAt(level: 25 | 60 | 90) {
  if (level === 25) return createOpponentProfile(createPlayerSkillProfile(), 'practice');
  return createOpponentProfile({
    ...createPlayerSkillProfile(),
    level: level - 3,
    confidence: 1,
    totalPlayerShots: 1,
  }, 'practice');
}

describe('顾燃等级差异证据', () => {
  it('固定袋口容错与随机种子时，低中高等级的失误率和走位预算依次分开', () => {
    const tolerance = 0.01;
    const samples = 10_000;
    const evidence = ([25, 60, 90] as const).map(level => {
      const profile = profileAt(level);
      const rng = mulberry32(20260909);
      let misses = 0;
      let absoluteOffset = 0;
      for (let index = 0; index < samples; index += 1) {
        const offset = sampleOpponentAimOffset(
          profile.aimSigma,
          tolerance,
          rng,
          profile.aimWindowFraction,
        );
        absoluteOffset += Math.abs(offset);
        if (Math.abs(offset) > tolerance) misses += 1;
      }
      return {
        level,
        missRate: Number((misses / samples).toFixed(4)),
        meanAbsoluteOffset: Number((absoluteOffset / samples).toFixed(5)),
        powerJitter: Number(profile.powerJitter.toFixed(4)),
        candidateLimit: profile.tactical.candidateLimit,
        simulationLimit: profile.tactical.simulationLimit,
        followUpWeight: Number(profile.tactical.followUpWeight.toFixed(4)),
      };
    });

    console.log('OPPONENT_LEVEL_EVIDENCE', JSON.stringify(evidence));
    expect(evidence[0].missRate).toBeGreaterThan(evidence[1].missRate);
    expect(evidence[1].missRate).toBeGreaterThan(evidence[2].missRate);
    expect(evidence.map(row => row.candidateLimit)).toEqual([1, 3, 5]);
    expect(evidence.map(row => row.simulationLimit)).toEqual([3, 9, 15]);
    expect(evidence[0].followUpWeight).toBeLessThan(evidence[1].followUpWeight);
    expect(evidence[1].followUpWeight).toBeLessThan(evidence[2].followUpWeight);
  });
});
