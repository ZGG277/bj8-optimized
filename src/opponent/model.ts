/*
[INPUT]: 依赖 planner/evaluate 的 erf 进球概率模型；接收所有真实玩家出杆事实
[OUTPUT]: 玩家三杆批量能力画像、适量搜索预算的陪练/挑战动态对手档案、等级/置信度展示与安全持久化
[POS]: 自适应对手纯领域层，不依赖 React/DOM/物理世界；局内档案按三杆批次限速重定向
[PROTOCOL]: 模型字段、更新阈值或模式映射变化时，同步更新本注释、opponent/CLAUDE.md 与 model.test.ts
*/
import { erfProb } from '../planner/evaluate';

export type GameMode = 'practice' | 'challenge';
export type PositionOutcome = 'success' | 'miss' | 'unknown';

export type ShotSkillObservation = {
  /** 当前目标球→袋口线路可进球的瞄准容错半宽（rad） */
  tolerance: number | null;
  pocketed: boolean;
  foul: boolean;
  position: PositionOutcome;
  /** 本回合是否查看过系统规划；查看过则降低样本权重，但不丢弃 */
  assisted: boolean;
};

export type PlayerSkillProfile = {
  version: 2;
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
  /** 所有真实玩家出杆；用于稳定的三杆更新节奏。 */
  totalPlayerShots: number;
  /** 跨局、跨刷新保留，始终只有 0–2 条。 */
  pendingObservations: ShotSkillObservation[];
  /** 最近一次三杆批次带来的可见分数变化。 */
  lastBatchDelta: number;
};

export type OpponentProfile = {
  mode: GameMode;
  /** 对外显示的 0–100 匹配档数字。 */
  tierLevel: number;
  /** 最新玩家画像对应的目标实力。 */
  targetLevel: number;
  /** 下一回合实际采用的能力，局内每批最多移动 3 分。 */
  effectiveLevel: number;
  label: string;
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

export const PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v2';
export const LEGACY_PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v1';

const MIN_SIGMA = 0.0025;
const MAX_SIGMA = 0.03;
const MIN_OPPONENT_LEVEL = 0;
const MAX_OPPONENT_LEVEL = 100;
const MAX_LEVEL_UP_PER_SHOT = 0.4;
const MAX_LEVEL_DOWN_PER_SHOT = 0.2;
const SHOTS_PER_BATCH = 3;
const MAX_OPPONENT_STEP = 3;

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
    version: 2,
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
    totalPlayerShots: 0,
    pendingObservations: [],
    lastBatchDelta: 0,
  };
}

function difficultyBucket(probability: number): 0 | 1 | 2 {
  if (probability >= 0.72) return 0;
  if (probability >= 0.38) return 1;
  return 2;
}

function normalizedObservation(observation: ShotSkillObservation): ShotSkillObservation {
  return {
    tolerance:
      typeof observation.tolerance === 'number' &&
      Number.isFinite(observation.tolerance) &&
      observation.tolerance > 0
        ? observation.tolerance
        : null,
    pocketed: Boolean(observation.pocketed),
    foul: Boolean(observation.foul),
    position:
      observation.position === 'success' || observation.position === 'miss'
        ? observation.position
        : 'unknown',
    assisted: Boolean(observation.assisted),
  };
}

/**
 * 把一批样本一次性折算为可见分数。执行维度仍逐杆消费“实际-预期”证据，
 * 最终综合分只提交一次，因此三杆之间不会在 UI 上抖动。
 */
export function applyShotBatch(
  profile: PlayerSkillProfile,
  observations: ShotSkillObservation[],
): PlayerSkillProfile {
  const batch = observations.slice(0, SHOTS_PER_BATCH);
  let executionLevel = profile.executionLevel;
  const buckets: [number, number, number] = [...profile.difficultyBuckets];
  let qualifiedShots = profile.qualifiedShots;
  let positionAttempts = profile.positionAttempts;
  let positionSuccesses = profile.positionSuccesses;
  let foulAttempts = profile.foulAttempts;
  let fouls = profile.fouls;

  for (const raw of batch) {
    const observation = normalizedObservation(raw);
    const evidenceWeight = observation.assisted ? 0.55 : 1;
    foulAttempts += evidenceWeight;
    if (observation.foul) fouls += evidenceWeight;
    if (observation.position !== 'unknown') {
      positionAttempts += evidenceWeight;
      if (observation.position === 'success') positionSuccesses += evidenceWeight;
    }
    if (observation.tolerance === null) continue;

    const expected = clamp(
      erfProb(observation.tolerance, levelToSigma(executionLevel)),
      0.02,
      0.98,
    );
    const result = observation.pocketed && !observation.foul ? 1 : 0;
    const rawExecutionDelta = (result - expected) * 0.65 * evidenceWeight;
    executionLevel = clamp(
      executionLevel + clamp(
        rawExecutionDelta,
        -MAX_LEVEL_DOWN_PER_SHOT,
        MAX_LEVEL_UP_PER_SHOT,
      ),
      0,
      100,
    );
    buckets[difficultyBucket(expected)] += evidenceWeight;
    qualifiedShots += evidenceWeight;
  }

  // Beta(2,2) 先验让两个次要维度在冷启动时保持中性，不会凭一杆主导总等级。
  const positionScore = ((positionSuccesses + 2) / (positionAttempts + 4)) * 100;
  const disciplineScore = (1 - (fouls + 2) / (foulAttempts + 4)) * 100;
  const compositeTarget = executionLevel * 0.8 + positionScore * 0.12 + disciplineScore * 0.08;
  const compositeDelta = clamp(
    compositeTarget - profile.level,
    -MAX_LEVEL_DOWN_PER_SHOT * batch.length,
    MAX_LEVEL_UP_PER_SHOT * batch.length,
  );
  const level = clamp(profile.level + compositeDelta, 0, 100);

  const coveredBuckets = buckets.filter((count) => count >= 2).length;
  const confidence =
    Math.min(1, qualifiedShots / 30) * (0.6 + (coveredBuckets / buckets.length) * 0.4);

  return {
    ...profile,
    version: 2,
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
    lastBatchDelta: level - profile.level,
  };
}

/** 兼容纯模型调用：立即应用单杆，但不参与生产环境的三杆队列。 */
export function applyShotObservation(
  profile: PlayerSkillProfile,
  observation: ShotSkillObservation,
): PlayerSkillProfile {
  return applyShotBatch(profile, [observation]);
}

export type QueuedShotResult = {
  profile: PlayerSkillProfile;
  batchCompleted: boolean;
};

/** 每三次真实出杆才提交能力变化；未满三杆只持久化队列。 */
export function queueShotObservation(
  profile: PlayerSkillProfile,
  observation: ShotSkillObservation,
): QueuedShotResult {
  const pending = [...profile.pendingObservations, normalizedObservation(observation)];
  const totalPlayerShots = profile.totalPlayerShots + 1;
  if (pending.length < SHOTS_PER_BATCH) {
    return {
      batchCompleted: false,
      profile: {
        ...profile,
        totalPlayerShots,
        pendingObservations: pending,
        lastBatchDelta: 0,
      },
    };
  }
  const evaluated = applyShotBatch(profile, pending.slice(0, SHOTS_PER_BATCH));
  return {
    batchCompleted: true,
    profile: {
      ...evaluated,
      totalPlayerShots,
      pendingObservations: [],
    },
  };
}

/** 低置信度时向中性 50 收缩，避免冷启动误判直接生成碾压型对手。 */
export function confidenceAdjustedLevel(profile: PlayerSkillProfile): number {
  return 50 + (profile.level - 50) * clamp(profile.confidence, 0, 1);
}

/** 模式档位不含 formOffset，可在开始页稳定展示。 */
export function opponentTierFor(profile: PlayerSkillProfile, mode: GameMode): number {
  const adjusted = confidenceAdjustedLevel(profile);
  return Math.round(clamp(
    adjusted + (mode === 'practice' ? 3 : 10),
    MIN_OPPONENT_LEVEL,
    MAX_OPPONENT_LEVEL,
  ));
}

function profileForLevel(
  mode: GameMode,
  targetLevel: number,
  effectiveLevel: number,
): OpponentProfile {
  const safeTarget = clamp(targetLevel, MIN_OPPONENT_LEVEL, MAX_OPPONENT_LEVEL);
  const safeEffective = clamp(effectiveLevel, MIN_OPPONENT_LEVEL, MAX_OPPONENT_LEVEL);
  const aimSigma = levelToSigma(safeEffective);
  const levelT = safeEffective / 100;

  return {
    mode,
    tierLevel: Math.round(safeTarget),
    targetLevel: safeTarget,
    effectiveLevel: safeEffective,
    label: levelLabel(safeTarget),
    aimSigma,
    powerJitter: 0.11 - levelT * 0.08,
    choiceTemperature:
      mode === 'practice'
        ? 0.42 - levelT * 0.24
        : 0.2 - levelT * 0.14,
    planner: {
      sigma: aimSigma,
      samples:
        mode === 'practice'
          ? 8 + Math.round(levelT * 8)
          : 12 + Math.round(levelT * 12),
      maxDepth: mode === 'practice' ? 1 : 2,
      simBudget: mode === 'practice' ? 240 : 640,
    },
  };
}

export function createOpponentProfile(
  player: PlayerSkillProfile,
  mode: GameMode,
): OpponentProfile {
  const targetLevel = opponentTierFor(player, mode);
  return profileForLevel(mode, targetLevel, targetLevel);
}

/** 玩家批次更新后重定向；下一次 AI 调度读取的新档案最多移动 3 分。 */
export function retargetOpponentProfile(
  current: OpponentProfile,
  player: PlayerSkillProfile,
  mode: GameMode = current.mode,
  maxStep = MAX_OPPONENT_STEP,
): OpponentProfile {
  const targetLevel = opponentTierFor(player, mode);
  const delta = clamp(targetLevel - current.effectiveLevel, -Math.abs(maxStep), Math.abs(maxStep));
  return profileForLevel(mode, targetLevel, current.effectiveLevel + delta);
}

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

function parseProfile(value: unknown): PlayerSkillProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Omit<PlayerSkillProfile, 'version'>> & { version?: number };
  if ((raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.difficultyBuckets)) return null;
  const fallback = createPlayerSkillProfile();
  const difficultyBuckets: [number, number, number] = [
    Math.max(0, finite(raw.difficultyBuckets[0], 0)),
    Math.max(0, finite(raw.difficultyBuckets[1], 0)),
    Math.max(0, finite(raw.difficultyBuckets[2], 0)),
  ];
  const executionLevel = clamp(finite(raw.executionLevel, fallback.executionLevel), 0, 100);
  const pendingObservations =
    raw.version === 2 && Array.isArray(raw.pendingObservations)
      ? raw.pendingObservations.slice(0, SHOTS_PER_BATCH - 1).map(item =>
          normalizedObservation(item as ShotSkillObservation))
      : [];
  return {
    version: 2,
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
    totalPlayerShots: Math.max(0, finite(raw.totalPlayerShots, 0)),
    pendingObservations,
    lastBatchDelta: finite(raw.lastBatchDelta, 0),
  };
}

export function loadPlayerSkillProfile(storage?: StorageReader | null): PlayerSkillProfile {
  if (!storage) return createPlayerSkillProfile();
  try {
    const saved = storage.getItem(PLAYER_SKILL_STORAGE_KEY);
    if (saved) return parseProfile(JSON.parse(saved)) ?? createPlayerSkillProfile();
    const legacy = storage.getItem(LEGACY_PLAYER_SKILL_STORAGE_KEY);
    return legacy ? parseProfile(JSON.parse(legacy)) ?? createPlayerSkillProfile() : createPlayerSkillProfile();
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
