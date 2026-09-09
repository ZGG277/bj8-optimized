/*
[INPUT]: 依赖 planner/evaluate 的 erf 进球概率模型；接收所有真实玩家出杆事实
[OUTPUT]: 玩家整局能力画像与训练总结、按等级跨越袋口容错的顾燃执行误差、分级战术/走位预算、等级/置信度展示与安全持久化
[POS]: 自适应对手纯领域层，不依赖 React/DOM/物理世界；对局中档案锁定，只在整局结束时统一评估
[PROTOCOL]: 模型字段、更新阈值或模式映射变化时，同步更新本注释、opponent/CLAUDE.md 与 model.test.ts
*/
import { erfProb, gaussian } from '../planner/evaluate';

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

export type MatchTrainingSummary = {
  shots: number;
  headline: string;
  focus: '准度' | '母球走位' | '犯规控制' | '稳定发挥';
  detail: string;
  nextGoal: string;
};

export type PlayerSkillProfile = {
  version: 3;
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
  /** 已完成对局中的所有真实玩家出杆。 */
  totalPlayerShots: number;
  matchesEvaluated: number;
  /** 最近一局结束时带来的可见分数变化。 */
  lastMatchDelta: number;
};

export type OpponentProfile = {
  mode: GameMode;
  /** 对外显示的 0–100 匹配档数字。 */
  tierLevel: number;
  /** 最新玩家画像对应的目标实力。 */
  targetLevel: number;
  /** 本局锁定的实际能力。 */
  effectiveLevel: number;
  label: string;
  aimSigma: number;
  powerJitter: number;
  aimWindowFraction: number;
  tactical: {
    /** 入门局不允许顾燃主动退回安全球，降低新手连续丢失球权的挫败感。 */
    allowSafety: boolean;
    candidateLimit: number;
    simulationLimit: number;
    followUpWeight: number;
    alternativeChance: number;
    deadlineMs: number;
  };
};

export const PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v3';
export const PREVIOUS_PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v2';
export const LEGACY_PLAYER_SKILL_STORAGE_KEY = 'guagua-billiards:player-skill:v1';

const MIN_SIGMA = 0.0025;
const MAX_SIGMA = 0.03;
const MIN_OPPONENT_LEVEL = 0;
const MAX_OPPONENT_LEVEL = 100;
const MAX_LEVEL_UP_PER_SHOT = 0.4;
const MAX_LEVEL_DOWN_PER_SHOT = 0.2;
const MAX_OPPONENT_STEP = 3;
export const BEGINNER_START_LEVEL = 25;
export const OPPONENT_SAFETY_UNLOCK_LEVEL = 50;
const POSITION_WEIGHT = 0.28;
const PRECISION_WEIGHT = 1 - POSITION_WEIGHT;
export const OPPONENT_AIM_WINDOW_FRACTION = 0.82;

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

/**
 * tanh 只截断高斯分布的无限长尾；档案可把低等级上限设到袋口容错之外，
 * 让已找到理想球路的入门顾燃仍会真实打偏，高等级才集中在袋口中心。
 */
export function sampleOpponentAimOffset(
  sigma: number,
  tolerance: number,
  rng: () => number = Math.random,
  windowFraction = OPPONENT_AIM_WINDOW_FRACTION,
): number {
  if (!Number.isFinite(sigma) || sigma <= 0) return 0;
  const raw = gaussian(rng) * sigma;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return raw;
  const limit = tolerance * clamp(windowFraction, 0.1, 2.5);
  return Math.tanh(raw / limit) * limit;
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
    version: 3,
    level: BEGINNER_START_LEVEL,
    executionLevel: BEGINNER_START_LEVEL,
    executionSigma: levelToSigma(BEGINNER_START_LEVEL),
    confidence: 0,
    qualifiedShots: 0,
    difficultyBuckets: [0, 0, 0],
    positionAttempts: 0,
    positionSuccesses: 0,
    foulAttempts: 0,
    fouls: 0,
    totalPlayerShots: 0,
    matchesEvaluated: 0,
    lastMatchDelta: 0,
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
 * 最终综合分只提交一次，因此整局进行中不会在 UI 上抖动。
 */
export function applyMatchObservations(
  profile: PlayerSkillProfile,
  observations: ShotSkillObservation[],
): PlayerSkillProfile {
  const batch = observations.map(normalizedObservation);
  if (batch.length === 0) return profile;
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

  // 技术分只由准度和走位组成；Beta(2,2) 先验避免一杆走位主导冷启动结果。
  const positionScore = ((positionSuccesses + 2) / (positionAttempts + 4)) * 100;
  const compositeTarget =
    executionLevel * PRECISION_WEIGHT + positionScore * POSITION_WEIGHT;
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
    version: 3,
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
    totalPlayerShots: profile.totalPlayerShots + batch.length,
    matchesEvaluated: profile.matchesEvaluated + 1,
    lastMatchDelta: level - profile.level,
  };
}

/**
 * 把本局真实出杆压缩成一个训练重点。优先处理犯规，其次准度与已有走位证据；
 * 一局只给一个目标，避免结算页同时罗列多项指标造成无从下手。
 */
export function buildMatchTrainingSummary(
  previous: PlayerSkillProfile,
  next: PlayerSkillProfile,
  observations: ShotSkillObservation[],
): MatchTrainingSummary | null {
  const batch = observations.map(normalizedObservation);
  if (batch.length === 0) return null;
  const shots = batch.length;
  const fouls = batch.filter(observation => observation.foul).length;
  const qualified = batch.filter(observation => observation.tolerance !== null);
  const pots = qualified.filter(observation => observation.pocketed && !observation.foul).length;
  const positioned = batch.filter(observation => observation.position !== 'unknown');
  const positionSuccesses = positioned.filter(observation => observation.position === 'success').length;
  const delta = next.level - previous.level;
  const deltaText = Math.abs(delta) < 0.05
    ? '水平保持稳定'
    : `水平 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;

  if (fouls > 0 && fouls / shots >= 0.2) {
    return {
      shots,
      headline: `本局记录 ${shots} 杆，${deltaText}`,
      focus: '犯规控制',
      detail: `${fouls} 杆犯规，先把合法首碰和白球安全放在得分前面。`,
      nextGoal: '下一局目标：每次出杆前确认首碰球，并让母球留在台面。',
    };
  }

  if (qualified.length >= 2 && pots / qualified.length < 0.55) {
    return {
      shots,
      headline: `本局记录 ${shots} 杆，${deltaText}`,
      focus: '准度',
      detail: `可评估的 ${qualified.length} 杆中打进 ${pots} 杆，主要损失来自进球线路。`,
      nextGoal: '下一局目标：先把容易球送进袋口中心，再增加杆法和力度。',
    };
  }

  if (positioned.length >= 2 && positionSuccesses / positioned.length < 0.6) {
    return {
      shots,
      headline: `本局记录 ${shots} 杆，${deltaText}`,
      focus: '母球走位',
      detail: `${positioned.length} 次可评估走位中有 ${positionSuccesses} 次到位，准度已够，下一步是控制白球。`,
      nextGoal: '下一局目标：每杆只选一个母球落点，少走一库也算进步。',
    };
  }

  return {
    shots,
    headline: `本局记录 ${shots} 杆，${deltaText}`,
    focus: '稳定发挥',
    detail: qualified.length > 0
      ? `可评估的 ${qualified.length} 杆中打进 ${pots} 杆，当前节奏值得保持。`
      : '本局以开球和防守事实为主，下一局继续积累可评估进攻杆。',
    nextGoal: '下一局目标：出杆前先确定目标袋和母球落点，再一次完成动作。',
  };
}

/** 兼容纯模型/单杆校准调用；生产对局使用 applyMatchObservations。 */
export function applyShotObservation(
  profile: PlayerSkillProfile,
  observation: ShotSkillObservation,
): PlayerSkillProfile {
  return applyMatchObservations(profile, [observation]);
}

/** 低置信度时向新手基线 25 收缩，避免冷启动直接生成碾压型对手。 */
export function confidenceAdjustedLevel(profile: PlayerSkillProfile): number {
  return BEGINNER_START_LEVEL +
    (profile.level - BEGINNER_START_LEVEL) * clamp(profile.confidence, 0, 1);
}

/** 模式档位不含 formOffset，可在开始页稳定展示。 */
export function opponentTierFor(profile: PlayerSkillProfile, mode: GameMode): number {
  const hasNoRecordedPlay =
    profile.totalPlayerShots === 0 &&
    profile.matchesEvaluated === 0 &&
    profile.qualifiedShots === 0 &&
    profile.positionAttempts === 0 &&
    profile.foulAttempts === 0;
  if (hasNoRecordedPlay) {
    return BEGINNER_START_LEVEL;
  }
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
  const levelT = clamp((safeEffective - 20) / 70, 0, 1);
  const candidateLimit = mode === 'practice'
    ? Math.round(1 + levelT * 4)
    : Math.round(2 + levelT * 4);

  return {
    mode,
    tierLevel: Math.round(safeTarget),
    targetLevel: safeTarget,
    effectiveLevel: safeEffective,
    label: levelLabel(safeTarget),
    aimSigma,
    powerJitter:
      mode === 'practice'
        ? 0.2 - levelT * 0.15
        : 0.14 - levelT * 0.105,
    aimWindowFraction: mode === 'practice'
      ? 1.8 - levelT * 1.15
      : 1.45 - levelT * 0.9,
    tactical: {
      allowSafety: safeEffective > OPPONENT_SAFETY_UNLOCK_LEVEL,
      candidateLimit,
      simulationLimit: candidateLimit * (mode === 'practice' ? 3 : 4),
      followUpWeight: Math.pow(levelT, 1.3) * (mode === 'practice' ? 0.75 : 1.1),
      alternativeChance: (1 - levelT) * (mode === 'practice' ? 0.5 : 0.3),
      deadlineMs: Math.round(
        (mode === 'practice' ? 350 : 500) + levelT * (mode === 'practice' ? 500 : 700),
      ),
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

/** 兼容外部渐进重定向；生产对局局内不调用。 */
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
  const raw = value as Partial<Omit<PlayerSkillProfile, 'version'>> & {
    version?: number;
    pendingObservations?: unknown[];
    lastBatchDelta?: number;
  };
  if ((raw.version !== 1 && raw.version !== 2 && raw.version !== 3) || !Array.isArray(raw.difficultyBuckets)) return null;
  const fallback = createPlayerSkillProfile();
  const difficultyBuckets: [number, number, number] = [
    Math.max(0, finite(raw.difficultyBuckets[0], 0)),
    Math.max(0, finite(raw.difficultyBuckets[1], 0)),
    Math.max(0, finite(raw.difficultyBuckets[2], 0)),
  ];
  const executionLevel = clamp(finite(raw.executionLevel, fallback.executionLevel), 0, 100);
  const pendingObservations =
    raw.version === 2 && Array.isArray(raw.pendingObservations)
      ? raw.pendingObservations.slice(0, 2).map(item =>
          normalizedObservation(item as ShotSkillObservation))
      : [];
  const parsed: PlayerSkillProfile = {
    version: 3,
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
    totalPlayerShots: Math.max(0, finite(raw.totalPlayerShots, 0) - pendingObservations.length),
    matchesEvaluated: Math.max(0, finite(raw.matchesEvaluated, 0)),
    lastMatchDelta: finite(raw.lastMatchDelta, finite(raw.lastBatchDelta, 0)),
  };
  return pendingObservations.length > 0
    ? applyMatchObservations(parsed, pendingObservations)
    : parsed;
}

export function loadPlayerSkillProfile(storage?: StorageReader | null): PlayerSkillProfile {
  if (!storage) return createPlayerSkillProfile();
  try {
    const saved = storage.getItem(PLAYER_SKILL_STORAGE_KEY);
    if (saved) return parseProfile(JSON.parse(saved)) ?? createPlayerSkillProfile();
    const previous = storage.getItem(PREVIOUS_PLAYER_SKILL_STORAGE_KEY);
    if (previous) return parseProfile(JSON.parse(previous)) ?? createPlayerSkillProfile();
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
