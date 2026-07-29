/*
[INPUT]: 依赖 planner/evaluate 的 erf 进球概率模型；接收合格击球事实与可注入随机数
[OUTPUT]: 玩家能力画像更新、陪练/挑战对手档案生成、等级/置信度展示与安全持久化
[POS]: 自适应对手纯领域层，不依赖 React/DOM/物理世界；局内档案由调用方创建后锁定
[PROTOCOL]: 模型字段、更新阈值或模式映射变化时，同步更新本注释、opponent/CLAUDE.md 与 model.test.ts
*/
import { erfProb } from '../planner/evaluate';

export type GameMode = 'practice' | 'challenge';
export type PositionOutcome = 'success' | 'miss' | 'unknown';

export type ShotSkillObservation = {
  /** 当前目标球→袋口线路可进球的瞄准容错半宽（rad） */
  tolerance: number;
  pocketed: boolean;
  foul: boolean;
  position: PositionOutcome;
  /** 本回合是否查看过系统规划；查看过则降低样本权重，但不丢弃 */
  assisted: boolean;
};

export type PlayerSkillProfile = {
  version: 1;
  level: number;
  executionLevel: number;
  executionSigma: number;
  confidence: number;
  qualifiedShots: number;
  difficultyBuckets: [number, number, number];
  positionAttempts: number;
  positionSuccesses: number;
  foulAttempts: number;
  fouls: number;
};

export type OpponentProfile = {
  mode: GameMode;
  /** 对外显示的稳定档位，不含本局状态波动 */
  tierLevel: number;
  /** 本局实际能力，开局生成后锁定 */
  effectiveLevel: number;
  label: string;
  formOffset: number;
  aimSigma: number;
  powerJitter: number;
  choiceTemperature: number;
  planner: {
    sigma: number;
    samples: number;
    maxDepth: 1 | 2;
    simBudget: number;
  };
};

export const PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v1';

const MIN_SIGMA = 0.0025;
const MAX_SIGMA = 0.03;
const MIN_OPPONENT_LEVEL = 26;
const MAX_OPPONENT_LEVEL = 92;
const MAX_LEVEL_UP_PER_SHOT = 0.4;
const MAX_LEVEL_DOWN_PER_SHOT = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 等级使用对数尺度映射到执行误差：高段位的细小差异不会被线性映射压扁。 */
export function levelToSigma(level: number): number {
  const t = clamp(level, 0, 100) / 100;
  return MAX_SIGMA * Math.pow(MIN_SIGMA / MAX_SIGMA, t);
}

export function levelLabel(level: number): string {
  if (level < 35) return '入门';
  if (level < 50) return '熟悉';
  if (level < 65) return '熟练';
  if (level < 80) return '进阶';
  return '高手';
}

export function createPlayerSkillProfile(): PlayerSkillProfile {
  return {
    version: 1,
    level: 50,
    executionLevel: 50,
    executionSigma: levelToSigma(50),
    confidence: 0,
    qualifiedShots: 0,
    difficultyBuckets: [0, 0, 0],
    positionAttempts: 0,
    positionSuccesses: 0,
    foulAttempts: 0,
    fouls: 0,
  };
}

function difficultyBucket(probability: number): 0 | 1 | 2 {
  if (probability >= 0.72) return 0;
  if (probability >= 0.38) return 1;
  return 2;
}

/**
 * 在线更新与 Elo 同构：实际结果 - 当前预测概率。
 * 预测来自项目既有 erf 容错模型，因此简单球失手比困难球失手降得多；
 * 每杆上下行分别封顶 0.4/0.2，保证 10 个样本最多 +4/-2。
 */
export function applyShotObservation(
  profile: PlayerSkillProfile,
  observation: ShotSkillObservation,
): PlayerSkillProfile {
  if (!Number.isFinite(observation.tolerance) || observation.tolerance <= 0) return profile;

  const expected = clamp(erfProb(observation.tolerance, profile.executionSigma), 0.02, 0.98);
  const result = observation.pocketed && !observation.foul ? 1 : 0;
  const evidenceWeight = observation.assisted ? 0.55 : 1;
  const rawExecutionDelta = (result - expected) * 0.65 * evidenceWeight;
  const executionDelta = clamp(
    rawExecutionDelta,
    -MAX_LEVEL_DOWN_PER_SHOT,
    MAX_LEVEL_UP_PER_SHOT,
  );
  const executionLevel = clamp(profile.executionLevel + executionDelta, 0, 100);

  const buckets: [number, number, number] = [...profile.difficultyBuckets];
  buckets[difficultyBucket(expected)] += evidenceWeight;

  const positionObserved = observation.position !== 'unknown';
  const positionAttempts = profile.positionAttempts + (positionObserved ? evidenceWeight : 0);
  const positionSuccesses =
    profile.positionSuccesses + (observation.position === 'success' ? evidenceWeight : 0);
  const foulAttempts = profile.foulAttempts + evidenceWeight;
  const fouls = profile.fouls + (observation.foul ? evidenceWeight : 0);

  // Beta(2,2) 先验让两个次要维度在冷启动时保持中性，不会凭一杆主导总等级。
  const positionScore = ((positionSuccesses + 2) / (positionAttempts + 4)) * 100;
  const disciplineScore = (1 - (fouls + 2) / (foulAttempts + 4)) * 100;
  const compositeTarget = executionLevel * 0.8 + positionScore * 0.12 + disciplineScore * 0.08;
  const compositeDelta = clamp(
    compositeTarget - profile.level,
    -MAX_LEVEL_DOWN_PER_SHOT,
    MAX_LEVEL_UP_PER_SHOT,
  );
  const level = clamp(profile.level + compositeDelta, 0, 100);

  const qualifiedShots = profile.qualifiedShots + evidenceWeight;
  const coveredBuckets = buckets.filter((count) => count >= 2).length;
  const confidence =
    Math.min(1, qualifiedShots / 30) * (0.6 + (coveredBuckets / buckets.length) * 0.4);

  return {
    version: 1,
    level,
    executionLevel,
    executionSigma: levelToSigma(executionLevel),
    confidence,
    qualifiedShots,
    difficultyBuckets: buckets,
    positionAttempts,
    positionSuccesses,
    foulAttempts,
    fouls,
  };
}

/** 低置信度时向中性 50 收缩，避免冷启动误判直接生成碾压型对手。 */
export function confidenceAdjustedLevel(profile: PlayerSkillProfile): number {
  return 50 + (profile.level - 50) * clamp(profile.confidence, 0, 1);
}

/** 模式档位不含 formOffset，可在开始页稳定展示。 */
export function opponentTierFor(profile: PlayerSkillProfile, mode: GameMode): number {
  const adjusted = confidenceAdjustedLevel(profile);
  if (mode === 'practice') {
    return Math.round(clamp(adjusted - 5, MIN_OPPONENT_LEVEL, 88));
  }
  // 挑战选择玩家上方最近的 10 级档位；至少高约 5 级，最高不超过 92。
  return clamp(Math.ceil((adjusted + 5) / 10) * 10, 40, MAX_OPPONENT_LEVEL);
}

export function createOpponentProfile(
  player: PlayerSkillProfile,
  mode: GameMode,
  rng: () => number = Math.random,
): OpponentProfile {
  const tierLevel = opponentTierFor(player, mode);
  const formOffset = clamp((rng() * 2 - 1) * 3, -3, 3);
  const effectiveLevel = clamp(
    tierLevel + formOffset,
    MIN_OPPONENT_LEVEL,
    MAX_OPPONENT_LEVEL,
  );
  const aimSigma = levelToSigma(effectiveLevel);
  const levelT = effectiveLevel / 100;

  return {
    mode,
    tierLevel,
    effectiveLevel,
    label: levelLabel(tierLevel),
    formOffset,
    aimSigma,
    powerJitter: 0.11 - levelT * 0.08,
    choiceTemperature: mode === 'practice' ? 0.28 : 0.08,
    planner: {
      sigma: aimSigma,
      samples: mode === 'practice' ? 10 : 16,
      maxDepth: mode === 'practice' ? 1 : 2,
      simBudget: mode === 'practice' ? 1600 : 4200,
    },
  };
}

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

function parseProfile(value: unknown): PlayerSkillProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PlayerSkillProfile>;
  if (raw.version !== 1 || !Array.isArray(raw.difficultyBuckets)) return null;
  const fallback = createPlayerSkillProfile();
  const difficultyBuckets: [number, number, number] = [
    Math.max(0, finite(raw.difficultyBuckets[0], 0)),
    Math.max(0, finite(raw.difficultyBuckets[1], 0)),
    Math.max(0, finite(raw.difficultyBuckets[2], 0)),
  ];
  const executionLevel = clamp(finite(raw.executionLevel, fallback.executionLevel), 0, 100);
  return {
    version: 1,
    level: clamp(finite(raw.level, fallback.level), 0, 100),
    executionLevel,
    executionSigma: levelToSigma(executionLevel),
    confidence: clamp(finite(raw.confidence, 0), 0, 1),
    qualifiedShots: Math.max(0, finite(raw.qualifiedShots, 0)),
    difficultyBuckets,
    positionAttempts: Math.max(0, finite(raw.positionAttempts, 0)),
    positionSuccesses: Math.max(0, finite(raw.positionSuccesses, 0)),
    foulAttempts: Math.max(0, finite(raw.foulAttempts, 0)),
    fouls: Math.max(0, finite(raw.fouls, 0)),
  };
}

export function loadPlayerSkillProfile(storage?: StorageReader | null): PlayerSkillProfile {
  if (!storage) return createPlayerSkillProfile();
  try {
    const saved = storage.getItem(PLAYER_SKILL_STORAGE_KEY);
    return saved ? parseProfile(JSON.parse(saved)) ?? createPlayerSkillProfile() : createPlayerSkillProfile();
  } catch {
    return createPlayerSkillProfile();
  }
}

export function savePlayerSkillProfile(
  profile: PlayerSkillProfile,
  storage?: StorageWriter | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(PLAYER_SKILL_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 隐私模式/容量限制时保持内存画像，不影响对局。
  }
}
