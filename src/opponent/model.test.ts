/*
[INPUT]: 依赖 vitest 与 opponent/model 纯函数
[OUTPUT]: 覆盖整局一次评估、难度归一、辅助降权、冷启动收缩、顾燃安全窗执行误差、战术预算与 v1/v2/v3 持久化
[POS]: 自适应对手领域层回归测试
[PROTOCOL]: 模型字段或阈值变化时同步更新本文件与 model.ts 头部
*/
import { describe, expect, it } from 'vitest';
import {
  LEGACY_PLAYER_SKILL_STORAGE_KEY,
  PREVIOUS_PLAYER_SKILL_STORAGE_KEY,
  OPPONENT_AIM_WINDOW_FRACTION,
  PLAYER_SKILL_STORAGE_KEY,
  applyShotObservation,
  applyMatchObservations,
  confidenceAdjustedLevel,
  createOpponentProfile,
  createPlayerSkillProfile,
  levelToSigma,
  loadPlayerSkillProfile,
  opponentTierFor,
  retargetOpponentProfile,
  sampleOpponentAimOffset,
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

  it('keeps the visible profile stable during play and commits every shot once at match end', () => {
    const observation = {
      tolerance: 0.003,
      pocketed: true,
      foul: false,
      position: 'success' as const,
      assisted: false,
    };
    const profile = createPlayerSkillProfile();
    const observations = [observation, observation, observation, observation];
    expect(profile.level).toBe(50);
    expect(profile.totalPlayerShots).toBe(0);
    const settled = applyMatchObservations(profile, observations);
    expect(settled.totalPlayerShots).toBe(4);
    expect(settled.matchesEvaluated).toBe(1);
    expect(settled.level).toBeGreaterThan(50);
    expect(settled.lastMatchDelta).toBeCloseTo(1.6);
  });

  it('counts a defensive shot in the batch without changing execution evidence', () => {
    const base = createPlayerSkillProfile();
    const settled = applyMatchObservations(base, [{
      tolerance: null,
      pocketed: false,
      foul: false,
      position: 'unknown',
      assisted: false,
    }]);
    expect(settled.totalPlayerShots).toBe(1);
    expect(settled.qualifiedShots).toBe(0);
    expect(settled.executionLevel).toBe(50);
  });

  it('uses no-intent shots only for cadence and discipline', () => {
    const profile = applyMatchObservations(
      createPlayerSkillProfile(),
      Array.from({ length: 3 }, (_, i) => ({
        tolerance: null,
        pocketed: false,
        foul: i === 2,
        position: 'unknown' as const,
        assisted: false,
      })),
    );
    expect(profile.totalPlayerShots).toBe(3);
    expect(profile.qualifiedShots).toBe(0);
    expect(profile.executionLevel).toBe(50);
    expect(profile.foulAttempts).toBe(3);
    expect(profile.fouls).toBe(1);
  });

  it('never crosses the 0–100 score boundaries', () => {
    const success = {
      tolerance: 0.001,
      pocketed: true,
      foul: false,
      position: 'success' as const,
      assisted: false,
    };
    const miss = {
      ...success,
      pocketed: false,
      foul: true,
      position: 'miss' as const,
    };
    let high = {
      ...createPlayerSkillProfile(),
      level: 100,
      executionLevel: 100,
    };
    let low = {
      ...createPlayerSkillProfile(),
      level: 0,
      executionLevel: 0,
    };
    high = applyMatchObservations(high, [success, success, success]);
    low = applyMatchObservations(low, [miss, miss, miss]);
    expect(high.level).toBeLessThanOrEqual(100);
    expect(high.executionLevel).toBeLessThanOrEqual(100);
    expect(low.level).toBeGreaterThanOrEqual(0);
    expect(low.executionLevel).toBeGreaterThanOrEqual(0);
  });
});

describe('opponent profile', () => {
  const sequence = (...values: number[]) => {
    let index = 0;
    return () => values[index++ % values.length];
  };

  it('shrinks an uncertain player toward the neutral level', () => {
    const uncertain = { ...createPlayerSkillProfile(), level: 90, confidence: 0 };
    expect(confidenceAdjustedLevel(uncertain)).toBe(50);
    expect(opponentTierFor(uncertain, 'practice')).toBe(53);
    expect(opponentTierFor(uncertain, 'challenge')).toBe(60);
  });

  it('targets practice at +3 and challenge at +10 without random form drift', () => {
    const player = { ...createPlayerSkillProfile(), level: 64, confidence: 1 };
    const practice = createOpponentProfile(player, 'practice');
    const challenge = createOpponentProfile(player, 'challenge');
    expect(practice.tierLevel).toBe(67);
    expect(practice.targetLevel).toBe(67);
    expect(practice.tactical.candidateLimit).toBe(3);
    expect(practice.tactical.simulationLimit).toBe(12);
    expect(challenge.tierLevel).toBe(74);
    expect(challenge.tactical.candidateLimit).toBe(6);
    expect(challenge.tactical.simulationLimit).toBe(24);
    expect(challenge.tactical.followUpWeight).toBeGreaterThan(practice.tactical.followUpWeight);
    expect(challenge.tactical.alternativeChance).toBe(0);
    expect(challenge.aimSigma).toBeLessThan(practice.aimSigma);
  });

  it('retargets an in-progress opponent by at most three points', () => {
    const initial = createOpponentProfile(createPlayerSkillProfile(), 'practice');
    const stronger = {
      ...createPlayerSkillProfile(),
      level: 90,
      confidence: 1,
    };
    const next = retargetOpponentProfile(initial, stronger);
    expect(next.targetLevel).toBe(93);
    expect(next.effectiveLevel - initial.effectiveLevel).toBe(3);
    expect(next.aimSigma).toBeLessThan(initial.aimSigma);
    expect(next.powerJitter).toBeLessThan(initial.powerJitter);
    expect(next.powerJitter).toBeLessThan(initial.powerJitter);
    expect(next.tactical.simulationLimit).toBe(initial.tactical.simulationLimit);
  });

  it('caps both mode targets at 100', () => {
    const elite = { ...createPlayerSkillProfile(), level: 100, confidence: 1 };
    expect(opponentTierFor(elite, 'practice')).toBe(100);
    expect(opponentTierFor(elite, 'challenge')).toBe(100);
  });

  it('把高斯长尾连续压回当前杆向安全窗口内', () => {
    const tolerance = 0.01;
    const offset = sampleOpponentAimOffset(
      0.03,
      tolerance,
      sequence(1e-12, 0),
    );
    expect(Math.abs(offset)).toBeLessThanOrEqual(
      tolerance * OPPONENT_AIM_WINDOW_FRACTION,
    );
    expect(Math.abs(offset)).toBeGreaterThan(tolerance * 0.7);
  });

  it('同一随机手误下，高水平 sigma 更靠近袋口中心', () => {
    const weak = sampleOpponentAimOffset(0.02, 0.02, sequence(0.9, 0));
    const strong = sampleOpponentAimOffset(0.0025, 0.02, sequence(0.9, 0));
    expect(Math.abs(strong)).toBeLessThan(Math.abs(weak));
  });
});

describe('profile persistence', () => {
  it('round-trips a completed-match profile and recovers from broken JSON', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    const profile = applyMatchObservations(createPlayerSkillProfile(), [{
      tolerance: 0.01,
      pocketed: true,
      foul: false,
      position: 'success',
      assisted: false,
    }]);
    savePlayerSkillProfile(profile, storage);
    expect(loadPlayerSkillProfile(storage)).toEqual(profile);

    data.set(PLAYER_SKILL_STORAGE_KEY, '{broken');
    expect(loadPlayerSkillProfile(storage)).toEqual(createPlayerSkillProfile());
  });

  it('migrates a legacy v1 profile without losing learned ability', () => {
    const data = new Map<string, string>();
    const legacy = {
      version: 1,
      level: 68,
      executionLevel: 66,
      executionSigma: levelToSigma(66),
      confidence: 0.8,
      qualifiedShots: 24,
      difficultyBuckets: [8, 8, 8],
      positionAttempts: 12,
      positionSuccesses: 7,
      foulAttempts: 24,
      fouls: 2,
    };
    data.set(LEGACY_PLAYER_SKILL_STORAGE_KEY, JSON.stringify(legacy));
    const migrated = loadPlayerSkillProfile({
      getItem: (key: string) => data.get(key) ?? null,
    });
    expect(migrated.version).toBe(3);
    expect(migrated.level).toBe(68);
    expect(migrated.executionLevel).toBe(66);
    expect(migrated.totalPlayerShots).toBe(0);
  });

  it('migrates v2 pending shots once instead of restoring a three-shot queue', () => {
    const data = new Map<string, string>();
    const previous = {
      ...createPlayerSkillProfile(),
      version: 2,
      totalPlayerShots: 2,
      pendingObservations: [{
        tolerance: 0.003,
        pocketed: true,
        foul: false,
        position: 'success',
        assisted: false,
      }],
      lastBatchDelta: 0,
    };
    data.set(PREVIOUS_PLAYER_SKILL_STORAGE_KEY, JSON.stringify(previous));
    const migrated = loadPlayerSkillProfile({
      getItem: key => data.get(key) ?? null,
    });
    expect(migrated.version).toBe(3);
    expect(migrated.totalPlayerShots).toBe(2);
    expect(migrated.matchesEvaluated).toBe(1);
    expect(migrated.level).toBeGreaterThan(50);
  });
});
