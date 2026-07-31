/*
[INPUT]: 依赖 vitest、../physics 世界构造与 ./candidates、./evaluate、./search 的公开接口
[OUTPUT]: 对外提供走位规划层单元测试（无导出）：杆向容错、几何候选、概率单调性、遮挡过滤、整链结构、清组转 8 号、预算截断
[POS]: 规划层的可失败断言网；全部用种子化 mulberry32 保证确定性
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it, expect } from 'vitest';
import {
  createInitialWorld,
  cloneWorld,
  strikeCueBall,
  simulateUntilStop,
  pocketedThisShot,
  isCueBallPocketed,
  getPocketAimWindow,
  TABLE,
  type BilliardsWorld,
} from '../physics';
import { generateCandidates, POCKETS } from './candidates';
import { erfProb, monteCarloShot } from './evaluate';
import { nextLegalNumbers, planPosition, type PositionPlan } from './search';

/** 种子化伪随机数（确定性测试用） */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 手工摆球：只保留 placements 里的球并放到指定坐标，其余球移出台面 */
function placeWorld(placements: { n: number; x: number; z: number }[]): BilliardsWorld {
  const world = createInitialWorld();
  const map = new Map(placements.map((p) => [p.n, p]));
  for (const ball of world.balls) {
    const p = map.get(ball.number);
    if (p) {
      ball.active = true;
      ball.x = p.x;
      ball.z = p.z;
    } else {
      ball.active = false;
    }
  }
  return world;
}

/**
 * 构造指定切球角的局面：目标球在 (targetX, targetZ)，瞄 pocketIdx 袋，
 * 母球放在「来向与进球方向夹 cutDeg」、距 ghost 点 cueDist 处。
 */
function cutShotPlacements(
  targetX: number,
  targetZ: number,
  pocketIdx: number,
  cutDeg: number,
  cueDist: number,
): { n: number; x: number; z: number }[] {
  const pocket = POCKETS[pocketIdx];
  const window = getPocketAimWindow(pocket);
  const dx = window.center.x - targetX;
  const dz = window.center.z - targetZ;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const ghostX = targetX - ux * TABLE.ballRadius * 2;
  const ghostZ = targetZ - uz * TABLE.ballRadius * 2;
  const theta = (cutDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const vx = ux * cos - uz * sin;
  const vz = ux * sin + uz * cos;
  return [
    { n: 0, x: ghostX - vx * cueDist, z: ghostZ - vz * cueDist },
    { n: 1, x: targetX, z: targetZ },
  ];
}

// 直球近袋基准局面：母球 (0.2,0) → 1 号 (0.5,0) → 右中袋 (w/2, 0)，完全共线
const STRAIGHT = [
  { n: 0, x: 0.2, z: 0 },
  { n: 1, x: 0.5, z: 0 },
];

describe('generateCandidates 几何候选', () => {
  it('直球近袋：应产出 1 号→右中袋(3) 候选，低杆变体 MC 进球率 ≥ 0.9', () => {
    const world = placeWorld(STRAIGHT);
    const candidates = generateCandidates(world, [1]);
    const cand = candidates.find((c) => c.target === 1 && c.pocket === 3);
    expect(cand).toBeDefined();
    expect(cand!.cutAngle).toBeLessThan(0.01);

    // 物理事实：中心杆/高杆直球是跟进球，母球会跟随目标球洗袋（foulRate>0.9），
    // 直球近袋的正确打法是低杆回拉——与 search.ts 的 SPIN_VARIANTS 低杆变体一致
    const draw = { ...cand!, spin: { x: -0.35, y: 0 }, power: cand!.power + 6 };
    const outcome = monteCarloShot(world, draw, 48, 0.006, mulberry32(42));
    expect(outcome.prob).toBeGreaterThanOrEqual(0.9);
    expect(outcome.foulRate).toBe(0);
    expect(outcome.cueEnds.length).toBeGreaterThan(0);
  });

  it('概率单调性：直球近台的进球率必须高于大切角远台', () => {
    const nearWorld = placeWorld(STRAIGHT);
    const nearBase = generateCandidates(nearWorld, [1]).find((c) => c.target === 1 && c.pocket === 3)!;
    const nearDraw = { ...nearBase, spin: { x: -0.35, y: 0 }, power: nearBase.power + 6 };
    const nearProb = monteCarloShot(nearWorld, nearDraw, 48, 0.006, mulberry32(7)).prob;

    // 1 号在台面中部，切 60° 长距离叫左上底袋
    const farWorld = placeWorld(cutShotPlacements(0.3, 0.3, 0, 60, 1.0));
    const farCand = generateCandidates(farWorld, [1]).find((c) => c.target === 1 && c.pocket === 0)!;
    expect(farCand).toBeDefined();
    expect(farCand.cutAngle).toBeGreaterThan(0.8);
    const farProb = monteCarloShot(farWorld, farCand, 48, 0.006, mulberry32(7)).prob;

    expect(nearProb).toBeGreaterThan(farProb);
  });

  it('容错使用母球杆向量纲：同一目标袋，母球越远角度窗口越窄', () => {
    const near = generateCandidates(placeWorld(STRAIGHT), [1])
      .find((candidate) => candidate.target === 1 && candidate.pocket === 3)!;
    const far = generateCandidates(placeWorld([
      { n: 0, x: -0.3, z: 0 },
      { n: 1, x: 0.5, z: 0 },
    ]), [1]).find((candidate) => candidate.target === 1 && candidate.pocket === 3)!;

    expect(near.tolerance).toBeGreaterThan(far.tolerance);
    expect(far.tolerance).toBeGreaterThan(0);
  });

  it('直球安全窗口两侧的顾燃执行杆仍能真实进目标球', () => {
    const world = placeWorld(STRAIGHT);
    const base = generateCandidates(world, [1])
      .find((candidate) => candidate.target === 1 && candidate.pocket === 3)!;
    for (const sign of [-1, 1]) {
      const sim = cloneWorld(world);
      strikeCueBall(
        sim,
        base.angle + sign * base.tolerance * 0.82,
        base.power + 6,
        { x: -0.35, y: 0 },
      );
      simulateUntilStop(sim);
      expect(pocketedThisShot(sim)).toContain(1);
    }
  });

  it('遮挡局面：非合法球挡住母球路径时该候选不出现', () => {
    const world = placeWorld([...STRAIGHT, { n: 9, x: 0.32, z: 0 }]);
    const candidates = generateCandidates(world, [1]);
    expect(candidates.find((c) => c.target === 1 && c.pocket === 3)).toBeUndefined();
  });

  it('erfProb：随容错增大单调不减，且值域在 [0,1]', () => {
    const p1 = erfProb(0.005, 0.006);
    const p2 = erfProb(0.02, 0.006);
    const p3 = erfProb(0.2, 0.006);
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
    expect(p3).toBeLessThanOrEqual(1);
  });
});

describe('planPosition 整链搜索', () => {
  // 三颗合法球各带明确下球：1 号→右中袋、2 号→左中袋、3 号→右下底袋
  const world3 = () =>
    placeWorld([
      { n: 0, x: 0, z: 0.55 },
      { n: 1, x: 0.5, z: 0 },
      { n: 2, x: -0.5, z: 0 },
      { n: 3, x: 0.45, z: 1.05 },
    ]);

  it('返回结构完整：steps 1–3、chainProb 连乘、zone ≥ 3 顶点、note 非空', () => {
    const plans = planPosition(world3(), [1, 2, 3], { rng: mulberry32(123) });
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans.length).toBeLessThanOrEqual(3);

    const plan = plans[0];
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    expect(plan.steps.length).toBeLessThanOrEqual(3);

    const product = plan.steps.reduce((acc, s) => acc * s.prob, 1);
    expect(plan.chainProb).toBeCloseTo(product, 10);

    for (const step of plan.steps) {
      expect(step.prob).toBeGreaterThanOrEqual(0);
      expect(step.prob).toBeLessThanOrEqual(1);
      expect(step.zone.length).toBeGreaterThanOrEqual(3);
      expect(step.note.length).toBeGreaterThan(0);
      expect(step.display.cuePath.length).toBeGreaterThanOrEqual(2);
    }

    // 整链成功率降序（第一推荐 = 成功概率最高）
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i - 1].chainProb).toBeGreaterThanOrEqual(plans[i].chainProb);
    }
  });

  it('分组语义：legal 只传本组球时，链条任何一步不得出现别组球（含深层滚动）', () => {
    // 全色玩家：legal 只含 1/2/3；台面上另有花色 9/10/11 可下，用于诱捕深层候选串组
    const world = placeWorld([
      { n: 0, x: 0, z: 0.55 },
      { n: 1, x: 0.5, z: 0 },
      { n: 2, x: -0.5, z: 0 },
      { n: 3, x: 0.45, z: 1.05 },
      { n: 9, x: 0, z: -0.5 },
      { n: 10, x: -0.45, z: 1.05 },
      { n: 11, x: 0.2, z: -1.0 },
    ]);
    const plans = planPosition(world, [1, 2, 3], { rng: mulberry32(123) });
    expect(plans.length).toBeGreaterThanOrEqual(1);
    for (const plan of plans) {
      for (const step of plan.steps) {
        expect([1, 2, 3]).toContain(step.candidate.target);
      }
    }
  });

  it('仿真预算不被击穿：simBudget=500/200 严格封顶且仍有结果', () => {
    let count500 = 0;
    const plans500 = planPosition(world3(), [1, 2, 3], {
      rng: mulberry32(123),
      simBudget: 500,
      onSimulate: () => { count500 += 1; },
    });
    expect(count500).toBeLessThanOrEqual(500);
    expect(plans500.length).toBeGreaterThanOrEqual(1);

    // 需求必然超过 200（至少 3 个 erf 候选 × 3 变体 × 24 采样 = 216），
    // 所以预算 200 时计数应恰好顶到上限——同时验证「提前停止」真实生效
    let count200 = 0;
    const plans200 = planPosition(world3(), [1, 2, 3], {
      rng: mulberry32(123),
      simBudget: 200,
      onSimulate: () => { count200 += 1; },
    });
    expect(count200).toBe(200);
    expect(plans200.length).toBeGreaterThanOrEqual(1);
  });

  it('无可下球局面：候选为空时返回空数组', () => {
    // 唯一合法球被两颗球完全夹死，所有路径均被遮挡
    const world = placeWorld([
      { n: 0, x: 0, z: 0.5 },
      { n: 1, x: 0, z: -1.2 },
      { n: 9, x: 0, z: 0 },
      { n: 10, x: 0.05, z: -0.6 },
      { n: 11, x: -0.05, z: -0.6 },
    ]);
    expect(planPosition(world, [1], { rng: mulberry32(1) })).toEqual([]);
  });
});

describe('planPosition 链条自洽性', () => {
  /**
   * 链条重放：从真实世界出发，对每个 step 依次 strike + simulateUntilStop
   * （与 display 仿真同为确定性 240Hz），断言该步目标球真实落袋且母球未洗袋。
   * 这是「精确终态滚动构造」的核心回归：第 2/3 杆展示必须从上一杆精确终态算出。
   */
  function replayChain(world: BilliardsWorld, plan: PositionPlan) {
    let current = cloneWorld(world);
    const replay: { pocketed: number[]; scratch: boolean }[] = [];
    for (const step of plan.steps) {
      const sim = cloneWorld(current);
      strikeCueBall(sim, step.candidate.angle, step.candidate.power, step.candidate.spin);
      simulateUntilStop(sim);
      replay.push({ pocketed: pocketedThisShot(sim), scratch: isCueBallPocketed(sim) });
      current = sim;
    }
    return replay;
  }

  const CHAIN_SCENARIOS: { name: string; placements: { n: number; x: number; z: number }[]; legal: number[] }[] = [
    {
      name: '三球残局',
      placements: [
        { n: 0, x: 0, z: 0.55 },
        { n: 1, x: 0.5, z: 0 },
        { n: 2, x: -0.5, z: 0 },
        { n: 3, x: 0.45, z: 1.05 },
      ],
      legal: [1, 2, 3],
    },
    {
      name: '两球残局',
      placements: [
        { n: 0, x: 0.2, z: 0 },
        { n: 1, x: 0.5, z: 0 },
        { n: 2, x: -0.3, z: -0.8 },
      ],
      legal: [1, 2],
    },
  ];

  for (const scenario of CHAIN_SCENARIOS) {
    it(`${scenario.name}：每条 plan 每步重放都真实进球`, () => {
      const plans = planPosition(placeWorld(scenario.placements), scenario.legal, { rng: mulberry32(99) });
      expect(plans.length).toBeGreaterThanOrEqual(1);
      for (const plan of plans) {
        const replay = replayChain(placeWorld(scenario.placements), plan);
        replay.forEach((result, i) => {
          const step = plan.steps[i];
          expect(result.scratch).toBe(false);
          expect(result.pocketed).toContain(step.candidate.target);
        });
      }
    });
  }

  it('链条截断：第 2 杆无可行候选时 steps 缩短且不抛异常', () => {
    // 1 号可直球下右中袋；2 号被 z=-0.9 一排阻挡球封死（任意母球停位到其
    // ghost 点的路径都穿过阻挡排 2R 走廊），精确终态下第 2 层候选必为空
    const world = placeWorld([
      { n: 0, x: 0.2, z: 0 },
      { n: 1, x: 0.5, z: 0 },
      { n: 2, x: 0, z: -1.2 },
      { n: 9, x: -0.11, z: -0.9 },
      { n: 10, x: -0.037, z: -0.9 },
      { n: 11, x: 0.037, z: -0.9 },
      { n: 12, x: 0.11, z: -0.9 },
      { n: 13, x: 0.185, z: -0.9 },
    ]);
    const plans = planPosition(world, [1, 2], { rng: mulberry32(55) });
    expect(plans.length).toBeGreaterThanOrEqual(1);
    for (const plan of plans) {
      expect(plan.steps.length).toBe(1);
      expect(plan.chainProb).toBeCloseTo(plan.steps[0].prob, 10);
    }
  });

  it('清完本组后下一杆合法目标自动切到 8 号，并能形成收尾链', () => {
    const world = placeWorld([
      { n: 0, x: 0.2, z: 0 },
      { n: 1, x: 0.5, z: 0 },
      { n: 8, x: -0.3, z: -0.8 },
    ]);
    const afterOne = cloneWorld(world);
    afterOne.balls.find((ball) => ball.number === 1)!.active = false;
    expect(nextLegalNumbers(world, afterOne, [1])).toEqual([8]);

    const plans = planPosition(world, [1], {
      rng: mulberry32(99),
      maxDepth: 2,
      simBudget: 8000,
    });
    expect(plans.some((plan) =>
      plan.steps.length === 2 &&
      plan.steps[0].candidate.target === 1 &&
      plan.steps[1].candidate.target === 8
    )).toBe(true);
  });

  it('中局分组语义：球多但几何角差之毫厘时经标定仍给出 ≥2 步', () => {
    // 回归：实战中分组后（legal=本组 5 颗）中局曾稳定只有第 1 杆——几何候选角
    // 未计入投掷/滚动损耗，无扰动精确仿真差之毫厘被拒；首杆 12 号→p1 需 +4 力度
    // 标定才精确进球（修复前此杆被整条丢弃）。摆位来自开球后自对弈 2 杆的真实中局。
    const world = placeWorld([
      { n: 0, x: 0.0, z: 0.8 },
      { n: 1, x: 0.448, z: -0.0968 },
      { n: 9, x: -0.0774, z: -0.6695 },
      { n: 2, x: 0.54, z: -0.3493 },
      { n: 10, x: -0.0843, z: -0.73 },
      { n: 8, x: 0.0057, z: -0.7437 },
      { n: 3, x: 0.5683, z: -0.4171 },
      { n: 4, x: -0.1425, z: -0.8812 },
      { n: 11, x: -0.0223, z: -0.8123 },
      { n: 5, x: 0.0387, z: -0.7911 },
      { n: 12, x: 0.4496, z: -0.9359 },
      { n: 6, x: -0.5684, z: -0.8518 },
      { n: 14, x: -0.3563, z: -1.0698 },
      { n: 7, x: -0.1895, z: -1.2137 },
    ]);
    const plans = planPosition(world, [9, 10, 11, 12, 14], { rng: mulberry32(42) });
    expect(plans.length).toBeGreaterThanOrEqual(1);
    // 排序改为整链成功率降序后，plans[0] 可能是截断的 1 步路线（P1 单价最高）；
    // 本用例的回归点是「标定救回后存在 ≥2 步的可打链条」，取最长链验证
    const best = plans.reduce((a, b) => (b.steps.length > a.steps.length ? b : a));
    expect(best.steps.length).toBeGreaterThanOrEqual(2);
    // 展示杆重放依旧自洽（标定参数真实进球）
    const replay = replayChain(placeWorld([
      { n: 0, x: 0.0, z: 0.8 },
      { n: 1, x: 0.448, z: -0.0968 },
      { n: 9, x: -0.0774, z: -0.6695 },
      { n: 2, x: 0.54, z: -0.3493 },
      { n: 10, x: -0.0843, z: -0.73 },
      { n: 8, x: 0.0057, z: -0.7437 },
      { n: 3, x: 0.5683, z: -0.4171 },
      { n: 4, x: -0.1425, z: -0.8812 },
      { n: 11, x: -0.0223, z: -0.8123 },
      { n: 5, x: 0.0387, z: -0.7911 },
      { n: 12, x: 0.4496, z: -0.9359 },
      { n: 6, x: -0.5684, z: -0.8518 },
      { n: 14, x: -0.3563, z: -1.0698 },
      { n: 7, x: -0.1895, z: -1.2137 },
    ]), best);
    replay.forEach((result, i) => {
      expect(result.scratch).toBe(false);
      expect(result.pocketed).toContain(best.steps[i].candidate.target);
    });
  });
});
