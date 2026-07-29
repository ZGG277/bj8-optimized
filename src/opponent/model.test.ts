/*
[INPUT]: 依赖 vitest 与 opponent/model 纯函数
[OUTPUT]: 覆盖难度归一、防抖、辅助降权、冷启动收缩、模式映射与持久化容错
[POS]: 自适应对手领域层回归测试
[PROTOCOL]: 模型字段或阈值变化时同步更新本文件与 model.ts 头部
*/
import { describe, expect, it } from 'vitest';
import {
  PLAYER_SKILL_STORAGE_KEY,
  applyShotObservation,
  confidenceAdjustedLevel,
  createOpponentProfile,
  createPlayerSkillProfile,
  levelToSigma,
  loadPlayerSkillProfile,
  opponentTierFor,
  savePlayerSkillProfile,
} from './model';

describe('player skill model', () => {
  it('penalizes an easy miss more than a hard miss', () => {
    const base = createPlayerSkillProfile();
    const easyMiss = applyShotObservation(base, {
      tolerance: 0.03,
      pocketed: false,
      foul: false,
      position: 'unknown',
      assisted: false,
    });
    const hardMiss = applyShotObservation(base, {
      tolerance: 0.002,
      pocketed: false,
      foul: false,
      position: 'unknown',
      assisted: false,
    });
    expect(easyMiss.executionLevel).toBeLessThan(hardMiss.executionLevel);
  });

  it('rewards a hard success more than an easy success', () => {
    const base = createPlayerSkillProfile();
    const easy = applyShotObservation(base, {
      tolerance: 0.03,
      pocketed: true,
      foul: false,
      position: 'success',
      assisted: false,
    });
    const hard = applyShotObservation(base, {
      tolerance: 0.002,
      pocketed: true,
      foul: false,
      position: 'success',
      assisted: false,
    });
    expect(hard.executionLevel).toBeGreaterThan(easy.executionLevel);
  });

  it('downweights a shot after consulting guidance', () => {
    const base = createPlayerSkillProfile();
    const unassisted = applyShotObservation(base, {
      tolerance: 0.006,
      pocketed: true,
      foul: false,
      position: 'unknown',
      assisted: false,
    });
    const assisted = applyShotObservation(base, {
      tolerance: 0.006,
      pocketed: true,
      foul: false,
      position: 'unknown',
      assisted: true,
    });
    expect(assisted.qualifiedShots).toBeCloseTo(0.55);
    expect(assisted.executionLevel).toBeLessThan(unassisted.executionLevel);
  });

  it('caps movement and grows confidence only with evidence', () => {
    let profile = createPlayerSkillProfile();
    for (let i = 0; i < 10; i += 1) {
      profile = applyShotObservation(profile, {
        tolerance: 0.001,
        pocketed: true,
        foul: false,
        position: 'success',
        assisted: false,
      });
    }
    expect(profile.level).toBeLessThanOrEqual(54);
    expect(profile.executionLevel).toBeLessThanOrEqual(54);
    expect(profile.confidence).toBeGreaterThan(0);
    expect(profile.confidence).toBeLessThan(1);
  });

  it('maps higher levels to smaller execution sigma', () => {
    expect(levelToSigma(80)).toBeLessThan(levelToSigma(40));
  });
});

describe('opponent profile', () => {
  it('shrinks an uncertain player toward the neutral level', () => {
    const uncertain = { ...createPlayerSkillProfile(), level: 90, confidence: 0 };
    expect(confidenceAdjustedLevel(uncertain)).toBe(50);
    expect(opponentTierFor(uncertain, 'practice')).toBe(45);
    expect(opponentTierFor(uncertain, 'challenge')).toBe(60);
  });

  it('makes challenge visible and stronger while locking a bounded form offset', () => {
    const player = { ...createPlayerSkillProfile(), level: 64, confidence: 1 };
    const practice = createOpponentProfile(player, 'practice', () => 0.5);
    const challenge = createOpponentProfile(player, 'challenge', () => 1);
    expect(practice.tierLevel).toBe(59);
    expect(practice.planner.maxDepth).toBe(1);
    expect(challenge.tierLevel).toBe(70);
    expect(challenge.planner.maxDepth).toBe(2);
    expect(challenge.formOffset).toBe(3);
    expect(challenge.aimSigma).toBeLessThan(practice.aimSigma);
  });
});

describe('profile persistence', () => {
  it('round-trips a valid profile and recovers from broken JSON', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    const profile = applyShotObservation(createPlayerSkillProfile(), {
      tolerance: 0.01,
      pocketed: true,
      foul: false,
      position: 'success',
      assisted: false,
    });
    savePlayerSkillProfile(profile, storage);
    expect(loadPlayerSkillProfile(storage)).toEqual(profile);

    data.set(PLAYER_SKILL_STORAGE_KEY, '{broken');
    expect(loadPlayerSkillProfile(storage)).toEqual(createPlayerSkillProfile());
  });
});
