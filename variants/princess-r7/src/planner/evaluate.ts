/*
[INPUT]: 依赖 ../physics 的世界克隆/击球/步进/仿真接口与 ./candidates 的 ShotCandidate
[OUTPUT]: erf 解析概率、蒙特卡洛扰动仿真评估（monteCarloShot）、无扰动展示轨迹仿真（simulateForDisplay）、几何瞄准的物理标定（refineAimForPocket）
[POS]: 走位规划层第二步——概率粗筛模型与 MC 精排评估引擎；所有扰动通过注入 rng 保证可测
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  TABLE,
  PHYSICS_DT,
  cloneWorld,
  getCueBall,
  isCueBallPocketed,
  pocketedThisShot,
  simulateUntilStop,
  stepWorld,
  strikeCueBall,
  type BilliardsWorld,
} from '../physics';
import type { ShotCandidate } from './candidates';

const R = TABLE.ballRadius;

// ---- 评估常量 ----
export const POWER_JITTER = 0.05;             // 力度均匀扰动幅度 ±5%
export const CUE_END_CELL = R * 2;            // 母球停位聚类网格边长 = 2R
export const DISPLAY_RECORD_INTERVAL = 4;     // 展示轨迹每 4 步记一个点
const MAX_DISPLAY_SECONDS = 30;

/** 误差函数 erf(x)，Abramowitz–Stegun 7.1.26 近似（|ε| ≤ 1.5e-7） */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** 解析进球概率：瞄准误差 ~ N(0, sigma)，容错半宽 tolerance 时 P = erf(Δ/(√2·σ)) */
export function erfProb(tolerance: number, sigma: number): number {
  if (sigma <= 0) return 1;
  return erf(tolerance / (Math.SQRT2 * sigma));
}

/** Box-Muller 高斯采样（rng 注入保证确定性可测） */
export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export type CueEndCluster = { x: number; z: number; weight: number };

export type ShotOutcome = {
  prob: number;                    // 蒙特卡洛进球率（含合法判定）
  foulRate: number;                // 洗袋/首碰非法比例
  cueEnds: CueEndCluster[];        // 成功样本的母球停位（网格聚类后，按 weight 降序）
};

/** 内部扩展结果：额外携带成功样本的原始停位点（供 search 生成走位区域凸包） */
export type DetailedOutcome = ShotOutcome & { rawEnds: { x: number; z: number }[] };

/**
 * 仿真预算：used 已消耗次数 / limit 上限 / onSimulate 每次预算内仿真回调。
 * 预算约束的是搜索展开（MC 采样与展示仿真计数）；预算耗尽后 MC 提前截断，
 * 保底展示仿真仍执行但不再计数（每条路线至多 3 次的固定开销）。
 */
export type SimBudget = { used: number; limit: number; onSimulate?: () => void };

/** 停位网格 cell 键（search 把原始点映射回所属聚类时用，必须与聚类同规则） */
export function cueEndCellKey(x: number, z: number): string {
  return `${Math.round(x / CUE_END_CELL)}:${Math.round(z / CUE_END_CELL)}`;
}

function clusterEnds(points: { x: number; z: number }[]): CueEndCluster[] {
  const cells = new Map<string, { sx: number; sz: number; n: number }>();
  for (const p of points) {
    const key = cueEndCellKey(p.x, p.z);
    const cell = cells.get(key) ?? { sx: 0, sz: 0, n: 0 };
    cell.sx += p.x;
    cell.sz += p.z;
    cell.n += 1;
    cells.set(key, cell);
  }
  return [...cells.values()]
    .map((c) => ({ x: c.sx / c.n, z: c.sz / c.n, weight: c.n / points.length }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * 蒙特卡洛评估一杆：角度加 N(0, sigma) 高斯扰动、力度加 ±5% 均匀扰动，
 * 每个样本 cloneWorld → strikeCueBall → simulateUntilStop（240Hz 精仿真）。
 * 成功 = 目标球落袋 且 母球未洗袋 且 首碰合法（firstContact ∈ legal）。
 * 传 budget 时按样本粒度检查预算，耗尽即提前截断（prob/foulRate 按已跑样本计）。
 */
export function monteCarloShotDetailed(
  world: BilliardsWorld,
  cand: ShotCandidate,
  samples: number,
  sigma: number,
  rng: () => number,
  legal: number[],
  budget?: SimBudget,
): DetailedOutcome {
  let success = 0;
  let foul = 0;
  let ran = 0;
  const rawEnds: { x: number; z: number }[] = [];

  for (let i = 0; i < samples; i += 1) {
    if (budget && budget.used >= budget.limit) break;

    const angle = cand.angle + gaussian(rng) * sigma;
    const power = cand.power * (1 + (rng() * 2 - 1) * POWER_JITTER);

    const sim = cloneWorld(world);
    strikeCueBall(sim, angle, power, cand.spin);
    if (budget) {
      budget.used += 1;
      budget.onSimulate?.();
    }
    simulateUntilStop(sim);
    ran += 1;

    const scratch = isCueBallPocketed(sim);
    const firstLegal = sim.firstContact !== null && legal.includes(sim.firstContact);
    const pocketed = pocketedThisShot(sim);

    if (scratch || !firstLegal) {
      foul += 1;
      continue;
    }
    if (!pocketed.includes(cand.target)) continue; // 未进：miss，不计犯规也不计成功

    success += 1;
    const cue = getCueBall(sim);
    if (cue && cue.active) rawEnds.push({ x: cue.x, z: cue.z });
  }

  return {
    prob: ran > 0 ? success / ran : 0,
    foulRate: ran > 0 ? foul / ran : 0,
    cueEnds: rawEnds.length > 0 ? clusterEnds(rawEnds) : [],
    rawEnds,
  };
}

/** 标准 MC 评估（无预算约束， legal 默认即候选目标球本身合法） */
export function monteCarloShot(
  world: BilliardsWorld,
  cand: ShotCandidate,
  samples: number,
  sigma: number,
  rng: () => number,
  legal: number[] = [cand.target],
): ShotOutcome {
  const { prob, foulRate, cueEnds } = monteCarloShotDetailed(world, cand, samples, sigma, rng, legal);
  return { prob, foulRate, cueEnds };
}

export type DisplaySim = {
  cuePath: { x: number; z: number }[];
  objectPath: { x: number; z: number }[];
  cueEnd: { x: number; z: number } | null; // 无扰动仿真的母球停位（洗袋为 null）
  cueCushions: number;                     // 母球碰库次数（供评分的最小化走位惩罚）
  endWorld: BilliardsWorld;                // 无扰动仿真的精确终态（含被带动他球，供链条滚动构造）
};

/**
 * 无扰动 240Hz 精仿真，逐步记录母球与目标球轨迹（供 UI 画轨迹线）。
 * 每 DISPLAY_RECORD_INTERVAL 步记一个点；本步发生碰库/首碰/落袋事件时加密记录。
 */
export function simulateForDisplay(world: BilliardsWorld, cand: ShotCandidate): DisplaySim {
  const sim = cloneWorld(world);
  const cue = getCueBall(sim);
  const target = sim.balls.find((b) => b.number === cand.target);

  const cuePath: { x: number; z: number }[] = cue ? [{ x: cue.x, z: cue.z }] : [];
  const objectPath: { x: number; z: number }[] =
    target && target.active ? [{ x: target.x, z: target.z }] : [];

  strikeCueBall(sim, cand.angle, cand.power, cand.spin);

  let cueCushions = 0;
  let step = 0;
  const maxSteps = Math.ceil(MAX_DISPLAY_SECONDS / PHYSICS_DT);

  while (sim.moving && step < maxSteps) {
    const eventsBefore = sim.events.length;
    stepWorld(sim, PHYSICS_DT);
    step += 1;

    const newEvents = sim.events.slice(eventsBefore);
    cueCushions += newEvents.filter((e) => e.type === 'cushion' && e.ball === 0).length;
    const densify = newEvents.length > 0;

    if (step % DISPLAY_RECORD_INTERVAL === 0 || densify || !sim.moving) {
      const cueNow = getCueBall(sim);
      if (cueNow && cueNow.active) cuePath.push({ x: cueNow.x, z: cueNow.z });
      const targetNow = sim.balls.find((b) => b.number === cand.target);
      if (targetNow && targetNow.active) objectPath.push({ x: targetNow.x, z: targetNow.z });
    }
  }

  const cueFinal = getCueBall(sim);
  return {
    cuePath,
    objectPath,
    cueEnd: cueFinal && cueFinal.active ? { x: cueFinal.x, z: cueFinal.z } : null,
    cueCushions,
    endWorld: sim,
  };
}

// ---- 瞄准标定（几何角 → 物理精确杆） ----
export const REFINE_ANGLE_RANGE = 0.04;    // 几何瞄准角双侧微调范围（rad）
export const REFINE_ANGLE_STEP = 0.002;    // 微调步长（rad）
export const REFINE_POWER_DELTAS = [4, 8, 12, 16, -4, -8]; // 力度补偿序列（公式力度系统性偏弱时补）

/**
 * 瞄准标定：ghost-ball 几何角是解析近似，未计入投掷效应/滚动损耗，
 * 直接精确仿真可能差之毫厘（实测中局 erf≥0.5 候选约 1/3 精确失败，全部可用
 * ±0.04rad 角度 / +16 力度内的小修正救回）。本函数以无扰动仿真为准做微调扫描，
 * 返回「精确进球且不洗袋」的标定候选与其展示仿真；扫描受预算严格门控，
 * 耗尽即放弃（调用方按无可行候选处理）。基准杆与 countedDisplay 同语义：
 * 总是仿真、仅在预算内计数。
 */
export function refineAimForPocket(
  world: BilliardsWorld,
  cand: ShotCandidate,
  budget?: SimBudget,
): { cand: ShotCandidate; display: DisplaySim } | null {
  const acceptable = (d: DisplaySim) =>
    d.cueEnd !== null && pocketedThisShot(d.endWorld).includes(cand.target);
  const count = () => {
    if (budget && budget.used < budget.limit) {
      budget.used += 1;
      budget.onSimulate?.();
    }
  };

  count();
  const base = simulateForDisplay(world, cand);
  if (acceptable(base)) return { cand, display: base };

  const budgetOut = () => budget !== undefined && budget.used >= budget.limit;
  const steps = Math.round(REFINE_ANGLE_RANGE / REFINE_ANGLE_STEP);
  for (const dp of [0, ...REFINE_POWER_DELTAS]) {
    const power = Math.min(100, Math.max(1, cand.power + dp));
    for (let k = 1; k <= steps; k += 1) {
      for (const sign of [1, -1] as const) {
        if (budgetOut()) return null;
        const refined: ShotCandidate = { ...cand, angle: cand.angle + sign * k * REFINE_ANGLE_STEP, power };
        count();
        const d = simulateForDisplay(world, refined);
        if (acceptable(d)) return { cand: refined, display: d };
      }
    }
  }
  return null;
}
