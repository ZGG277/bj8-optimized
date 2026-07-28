/*
[INPUT]: 依赖 ./candidates 几何候选、./evaluate 概率模型与 MC/展示仿真、../physics 世界接口
[OUTPUT]: planPosition 3 层前瞻走位搜索，输出 top 1–3 条 PositionPlan（含展示轨迹、走位区域与教学注解）
[POS]: 走位规划层顶层编排——几何候选 → erf 粗筛 → MC 精排 → 精确终态滚动前瞻；标定后重算展示概率，清完本组后可继续规划 8 号
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { getCueBall, type BilliardsWorld } from '../physics';
import { generateCandidates, pocketName, type ShotCandidate } from './candidates';
import {
  erfProb,
  monteCarloShotDetailed,
  refineAimForPocket,
  type DetailedOutcome,
  type DisplaySim,
  type SimBudget,
} from './evaluate';

// ---- 搜索与评分常量（调参集中在此） ----
export const DEFAULT_SIGMA = 0.006;        // 瞄准误差标准差（rad），约对应中高手水平
export const DEFAULT_SAMPLES = 24;         // 第 1 层 MC 采样数
export const LAYER2_SAMPLES = 16;          // 第 2 层 MC 采样数（从第 1 杆精确终态起算）
export const LAYER3_SAMPLES = 12;          // 第 3 层 MC 采样数（从第 2 杆精确终态起算）
export const DEFAULT_SIM_BUDGET = 8000;    // 仿真总预算（约 1 秒量级）
export const ERF_TOP_K = 10;               // erf 粗筛保留候选数
export const LAYER1_EXPAND = 6;            // 第 1 层 MC 后滚动构造的路线数
export const LAYER2_TOP_CANDIDATES = 3;    // 深层每步 erf 粗筛后 MC 精评的候选数（精确校验失败时顺次递补）
export const MAX_PLANS = 3;                // 返回路线数上限

export const SCORE_P2_WEIGHT = 0.8;        // 评分：第 2 杆概率权重
export const SCORE_P3_WEIGHT = 0.5;        // 评分：第 3 杆概率权重
export const FOUL_PENALTY = 1.5;           // 评分：犯规率惩罚
export const ZONE_BONUS_WEIGHT = 0.2;      // 评分：走位区域奖励（简化为 P2 的线性项）
export const SIDE_BONUS_MAX = 0.12;        // 评分：留角度奖励峰值（30° 时取到）
export const SIDE_WINDOW_MIN = 0.26;       // 留角窗口下限 ≈ 15°
export const SIDE_WINDOW_MAX = 0.79;       // 留角窗口上限 ≈ 45°
export const SIDE_OPTIMAL = (30 * Math.PI) / 180; // 最优留角 30°
export const CUSHION_PENALTY = 0.05;       // 评分：母球每碰库一次的惩罚（最小化母球运动）
export const ZONE_FALLBACK_RADIUS = 0.15;  // 点集不足时退化八边形半径（m）

/**
 * 力度/杆法变体：只在 erf top-K 上展开（候选生成的取舍见 candidates.ts 文档）。
 * 低杆需要略补力度（缩杆损耗），高杆略增跟进距离。
 */
const SPIN_VARIANTS: { spin: { x: number; y: number }; powerDelta: number }[] = [
  { spin: { x: 0, y: 0 }, powerDelta: 0 },
  { spin: { x: 0.35, y: 0 }, powerDelta: 4 },
  { spin: { x: -0.35, y: 0 }, powerDelta: 6 },
];

export type PlannedStep = {
  candidate: ShotCandidate;
  prob: number;                    // 本杆成功率（MC；第 3 步为 erf 估算）
  display: { cuePath: { x: number; z: number }[]; objectPath: { x: number; z: number }[] };
  cueEnd: { x: number; z: number };// 展示用母球停位（无扰动仿真结果）
  zone: { x: number; z: number }[];// 下一杆的走位区域（凸包多边形）
  note: string;                    // 教学注解（规则模板生成）
  endWorld: BilliardsWorld;        // 本杆无扰动仿真的精确终态（整链播放时摆放下一步球位用）
};

export type PositionPlan = {
  steps: PlannedStep[];            // 1–3 步（球不够时短于 3）
  chainProb: number;               // 整链成功率 = steps[i].prob 连乘
  score: number;                   // 内部评分
};

export type PlannerOptions = {
  sigma?: number;
  samples?: number;
  maxDepth?: number;
  simBudget?: number;
  rng?: () => number;
  /** 每次预算内仿真回调（进度展示/测试观测用） */
  onSimulate?: () => void;
};

type Point = { x: number; z: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Andrew monotone chain 凸包（输入点可含重复/共线） */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** 走位区域：点集 ≥3 求凸包，否则退化为以 center 为圆心 0.15m 的八边形 */
function zoneFromPoints(points: Point[], center: Point): Point[] {
  const hull = convexHull(points);
  if (hull.length >= 3) return hull;
  const octagon: Point[] = [];
  for (let i = 0; i < 8; i += 1) {
    const theta = (i / 8) * Math.PI * 2;
    octagon.push({
      x: center.x + Math.cos(theta) * ZONE_FALLBACK_RADIUS,
      z: center.z + Math.sin(theta) * ZONE_FALLBACK_RADIUS,
    });
  }
  return octagon;
}

function toStepDisplay(d: DisplaySim): PlannedStep['display'] {
  return { cuePath: d.cuePath, objectPath: d.objectPath };
}

/** 留角度奖励：第 2 杆切角在 15°–45° 窗口内加分，30° 取峰值（留角度不留直球） */
function sideBonusFor(cutAngle: number): number {
  if (cutAngle < SIDE_WINDOW_MIN || cutAngle > SIDE_WINDOW_MAX) return 0;
  return SIDE_BONUS_MAX * (1 - Math.abs(cutAngle - SIDE_OPTIMAL) / SIDE_OPTIMAL);
}

/** 教学注解：按杆法/力度/袋口/下一杆留角模板生成一句中文 */
function buildNote(cand: ShotCandidate, next: ShotCandidate | null): string {
  const spinText = cand.spin.x <= -0.2 ? '低杆回拉' : cand.spin.x >= 0.2 ? '高杆跟进' : '中杆';
  const powerText = cand.power < 45 ? '小力' : cand.power > 65 ? '发力' : '中力';
  const parts = [`${spinText}${powerText}`, `${pocketName(cand.pocket)}打进 ${cand.target} 号`];
  if (!next) {
    parts.push('本杆收尾');
  } else if (next.cutAngle >= SIDE_WINDOW_MIN && next.cutAngle <= SIDE_WINDOW_MAX) {
    parts.push(`留 ${Math.round((next.cutAngle * 180) / Math.PI)}° 自然角叫 ${next.target} 号`);
  } else if (next.cutAngle < SIDE_WINDOW_MIN) {
    parts.push(`注意：留直球走位受限（叫 ${next.target} 号）`);
  } else {
    parts.push(`留大角度叫 ${next.target} 号，需杆法补偿`);
  }
  return parts.join('，');
}

type Layer1Result = { cand: ShotCandidate; outcome: DetailedOutcome };

type SearchCtx = {
  legal: number[];
  sigma: number;
  firstSamples: number;
  maxDepth: number;
  rng: () => number;
  budget: SimBudget;
};

function erfScreen(world: BilliardsWorld, legal: number[], sigma: number, topK: number): ShotCandidate[] {
  return generateCandidates(world, legal)
    .map((c) => ({
      c,
      est: erfProb(c.tolerance, sigma),
      heuristic: c.cueDistance + c.pocketDistance + c.cutAngle * 1.4,
    }))
    .sort((a, b) => b.est - a.est || a.heuristic - b.heuristic)
    .slice(0, topK)
    .map((e) => e.c);
}

/** 第 1 层：对每个 erf 候选展开力度/杆法变体，各跑 MC，保留最优变体 */
function evalLayer1(world: BilliardsWorld, screened: ShotCandidate[], samples: number, ctx: SearchCtx): Layer1Result[] {
  const results: Layer1Result[] = [];
  for (const base of screened) {
    let best: Layer1Result | null = null;
    for (const variant of SPIN_VARIANTS) {
      const cand: ShotCandidate = {
        ...base,
        spin: { ...variant.spin },
        power: clamp(base.power + variant.powerDelta, 1, 100),
      };
      const outcome = monteCarloShotDetailed(world, cand, samples, ctx.sigma, ctx.rng, ctx.legal, ctx.budget);
      if (!best || outcome.prob - outcome.foulRate > best.outcome.prob - best.outcome.foulRate) {
        best = { cand, outcome };
      }
      if (ctx.budget.used >= ctx.budget.limit) break;
    }
    if (best) results.push(best);
    if (ctx.budget.used >= ctx.budget.limit) break;
  }
  return results.sort((a, b) => b.outcome.prob - a.outcome.prob);
}

/** 深层单步候选排序：从精确起始局面 erf 粗筛 topK，各跑少量 MC，按 (prob − foulRate) 降序 */
function rankByMc(
  world: BilliardsWorld,
  legal: number[],
  topK: number,
  samples: number,
  ctx: SearchCtx,
): Layer1Result[] {
  const ranked: Layer1Result[] = [];
  for (const cand of erfScreen(world, legal, ctx.sigma, topK)) {
    const outcome = monteCarloShotDetailed(world, cand, samples, ctx.sigma, ctx.rng, legal, ctx.budget);
    ranked.push({ cand, outcome });
    if (ctx.budget.used >= ctx.budget.limit) break;
  }
  return ranked.sort(
    (a, b) => b.outcome.prob - b.outcome.foulRate - (a.outcome.prob - a.outcome.foulRate),
  );
}

/**
 * 按 MC 排名逐个做精确校验，取第一个可标定到「精确进球且不洗袋」的候选。
 * MC 概率高不代表无扰动杆必进（扰动样本可能救回瞄偏的杆），
 * 展示杆必须真实可打，否则规划视图当场穿帮；几何角差之毫厘的杆
 * 经 refineAimForPocket 微调角度/力度标定后采用标定参数展示。
 */
function pickDisplayVerified(
  world: BilliardsWorld,
  ranked: Layer1Result[],
  legal: number[],
  samples: number,
  ctx: SearchCtx,
): { pick: Layer1Result; display: DisplaySim } | null {
  for (const pick of ranked) {
    const refined = refineAimForPocket(world, pick.cand, ctx.budget);
    if (refined) {
      const changed =
        refined.cand.angle !== pick.cand.angle ||
        refined.cand.power !== pick.cand.power ||
        refined.cand.spin.x !== pick.cand.spin.x ||
        refined.cand.spin.y !== pick.cand.spin.y;
      const outcome = changed
        ? monteCarloShotDetailed(
            world,
            refined.cand,
            samples,
            ctx.sigma,
            ctx.rng,
            legal,
            ctx.budget,
          )
        : pick.outcome;
      return { pick: { cand: refined.cand, outcome }, display: refined.display };
    }
  }
  return null;
}

function groupedLegal(world: BilliardsWorld, legal: number[]): 'solid' | 'stripe' | null {
  const groups = new Set(
    legal
      .map((number) => world.balls.find((ball) => ball.number === number)?.group)
      .filter((group): group is 'solid' | 'stripe' => group === 'solid' || group === 'stripe'),
  );
  return groups.size === 1 ? [...groups][0] : null;
}

/** 滚动终态的下一杆合法球：本组尚有球继续本组，清组后 8 号自动进入。 */
export function nextLegalNumbers(
  initialWorld: BilliardsWorld,
  endWorld: BilliardsWorld,
  initialLegal: number[],
): number[] {
  const remaining = initialLegal.filter(
    (number) => endWorld.balls.find((ball) => ball.number === number)?.active,
  );
  if (remaining.length > 0) return remaining;
  const group = groupedLegal(initialWorld, initialLegal);
  const eight = endWorld.balls.find((ball) => ball.number === 8);
  return group && eight?.active ? [8] : [];
}

function canProgressToEight(world: BilliardsWorld, legal: number[]): boolean {
  return !legal.includes(8) && groupedLegal(world, legal) !== null &&
    Boolean(world.balls.find((ball) => ball.number === 8)?.active);
}

/**
 * 围绕一条第 1 层路线做「精确终态滚动构造」并组装 PositionPlan：
 * 每步的候选与展示仿真都来自上一步无扰动仿真的真实终态（含被带动的他球），
 * MC 只用于概率估算、不再决定展示局面来源——因此按展示杆法重放必然自洽进球
 * （回归：planner.test.ts「链条自洽性」）。某步精确局面下无可行候选时链条在该步截断。
 */
function buildPlan(world: BilliardsWorld, l1: Layer1Result, ctx: SearchCtx): PositionPlan | null {
  // 首杆精确校验（几何角差之毫厘的杆先标定）：精确不进球或洗袋 = 展示即穿帮/必犯规，
  // 整条路线不可推荐，直接丢弃
  const verified1 = pickDisplayVerified(world, [l1], ctx.legal, ctx.firstSamples, ctx);
  if (!verified1) return null;
  const best1 = verified1.pick;
  const cand1 = best1.cand;
  const display1 = verified1.display;
  const cueEnd1 = display1.cueEnd!;

  const legal2 = nextLegalNumbers(world, display1.endWorld, ctx.legal);

  // ---- 第 2 步：从第 1 杆精确终态重新生成候选（母球在真实停位、他球在真实终位） ----
  let best2: Layer1Result | null = null;
  let display2: DisplaySim | null = null;
  if (ctx.maxDepth >= 2 && legal2.length > 0) {
    const ranked2 = rankByMc(display1.endWorld, legal2, LAYER2_TOP_CANDIDATES, LAYER2_SAMPLES, ctx);
    const verified2 = pickDisplayVerified(
      display1.endWorld,
      ranked2,
      legal2,
      LAYER2_SAMPLES,
      ctx,
    );
    if (verified2) {
      best2 = verified2.pick;
      display2 = verified2.display;
    }
    // 全部候选精确校验失败 → 链条在此截断
  }
  const p2 = best2?.outcome.prob ?? 0;
  const cueEnd2 = display2?.cueEnd ?? cueEnd1;

  // ---- 第 3 步：从第 2 杆精确终态同理滚动 ----
  let best3: Layer1Result | null = null;
  let display3: DisplaySim | null = null;
  if (ctx.maxDepth >= 3 && best2 && display2) {
    const legal3 = nextLegalNumbers(world, display2.endWorld, ctx.legal);
    if (legal3.length > 0) {
      const ranked3 = rankByMc(display2.endWorld, legal3, LAYER2_TOP_CANDIDATES, LAYER3_SAMPLES, ctx);
      const verified3 = pickDisplayVerified(
        display2.endWorld,
        ranked3,
        legal3,
        LAYER3_SAMPLES,
        ctx,
      );
      if (verified3) {
        best3 = verified3.pick;
        display3 = verified3.display;
      }
    }
  }
  const p3 = best3?.outcome.prob ?? 0;
  const cueEnd3 = display3?.cueEnd ?? cueEnd2;

  // ---- 组装 steps ----
  const steps: PlannedStep[] = [];

  // 走位区域：本步 MC 成功样本的母球停位凸包（样本来自精确局面）；
  // 链条在此截断（无下一步）时退化为 cueEnd 八边形
  steps.push({
    candidate: cand1,
    prob: best1.outcome.prob,
    display: toStepDisplay(display1),
    cueEnd: cueEnd1,
    zone: zoneFromPoints(best2 ? best1.outcome.rawEnds : [], cueEnd1),
    note: buildNote(cand1, best2?.cand ?? null),
    endWorld: display1.endWorld,
  });

  if (best2 && display2) {
    steps.push({
      candidate: best2.cand,
      prob: p2,
      display: toStepDisplay(display2),
      cueEnd: cueEnd2,
      zone: zoneFromPoints(best3 ? best2.outcome.rawEnds : [], cueEnd2),
      note: buildNote(best2.cand, best3?.cand ?? null),
      endWorld: display2.endWorld,
    });
  }

  if (best3 && display3) {
    steps.push({
      candidate: best3.cand,
      prob: p3,
      display: toStepDisplay(display3),
      cueEnd: cueEnd3,
      zone: zoneFromPoints([], cueEnd3), // 末杆无下一杆，退化八边形
      note: buildNote(best3.cand, null),
      endWorld: display3.endWorld,
    });
  }

  // ---- 评分：score = P1·(1 + 0.8·P2 + 0.5·P3) − 1.5·foul + zone + side − cushion ----
  const score =
    best1.outcome.prob * (1 + SCORE_P2_WEIGHT * p2 + SCORE_P3_WEIGHT * p3) -
    FOUL_PENALTY * best1.outcome.foulRate +
    ZONE_BONUS_WEIGHT * p2 +
    (best2 ? sideBonusFor(best2.cand.cutAngle) : 0) -
    display1.cueCushions * CUSHION_PENALTY;

  return {
    steps,
    chainProb: steps.reduce((acc, s) => acc * s.prob, 1),
    score,
  };
}

/**
 * 走位规划主入口：搜索当前局面最优的连续 1–3 杆击球方案。
 * 流程：generateCandidates → erf 粗筛 top-10 → 变体 MC 精排 → 精确终态滚动前瞻
 * （第 2/3 步各从上一步无扰动展示仿真的 endWorld 重新生成候选并 MC 精评；
 * 无扰动仿真洗袋的杆直接剔除/令链条截断）；simBudget 耗尽即停止展开更深层，
 * 返回当前最好结果，最坏情况有界。返回 top 1–3 条路线，按整链成功率降序。
 */
export function planPosition(world: BilliardsWorld, legal: number[], opts: PlannerOptions = {}): PositionPlan[] {
  const cue = getCueBall(world);
  if (!cue || !cue.active || legal.length === 0) return [];

  const samples = opts.samples ?? DEFAULT_SAMPLES;
  const ctx: SearchCtx = {
    legal,
    sigma: opts.sigma ?? DEFAULT_SIGMA,
    firstSamples: samples,
    maxDepth: Math.max(
      1,
      Math.min(opts.maxDepth ?? 3, legal.length + (canProgressToEight(world, legal) ? 1 : 0)),
    ),
    rng: opts.rng ?? Math.random,
    budget: { used: 0, limit: opts.simBudget ?? DEFAULT_SIM_BUDGET, onSimulate: opts.onSimulate },
  };

  const screened = erfScreen(world, legal, ctx.sigma, ERF_TOP_K);
  if (screened.length === 0) return [];

  const layer1 = evalLayer1(world, screened, samples, ctx);

  // 首杆精确校验不通过的路线会被 buildPlan 丢弃，向后递补直到凑够
  // MAX_PLANS 条有效路线；至少尝试 LAYER1_EXPAND 条以保持择优空间
  const plans: PositionPlan[] = [];
  let attempted = 0;
  for (const l1 of layer1) {
    if (plans.length >= MAX_PLANS && attempted >= LAYER1_EXPAND) break;
    attempted += 1;
    const plan = buildPlan(world, l1, ctx);
    if (plan) plans.push(plan);
  }
  // 最终排序：整链成功率（连贯概率）降序——第一推荐必须是成功概率最高的路线；
  // 概率相同杆数多者优先（看得更远），再退化为内部评分
  return plans
    .sort((a, b) => b.chainProb - a.chainProb || b.steps.length - a.steps.length || b.score - a.score)
    .slice(0, MAX_PLANS);
}
