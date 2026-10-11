/*
[INPUT]: 依赖 vitest、../physics 世界构造、./search 的 planPosition、./review 的 buildShotReview
[OUTPUT]: 对外提供计划对比、自主意图复盘、犯规优先与开球建议的单元回归
[POS]: 复盘层的可失败断言网；场景用种子化 planPosition 的真实首步，力度偏小用例只抬高计划参考力以隔离诊断分支
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it, expect } from 'vitest';
import { createInitialWorld, type BilliardsWorld } from '../physics';
import { planPosition } from './search';
import type { PlannedStep } from './search';
import { buildShotReview, type ShotCapture } from './review';

/** 种子化伪随机数（确定性测试用，与 planner.test.ts 同款） */
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

/** 真实规划场景：3 球局面，seed=42 的规划首步（低杆回拉叫位杆，碰库前后行程对力度敏感） */
function setup(): { world: BilliardsWorld; step: PlannedStep } {
  const world = placeWorld([
    { n: 0, x: 0.3, z: 0.4 },
    { n: 1, x: 0.35, z: -0.5 },
    { n: 2, x: -0.3, z: -0.2 },
    { n: 3, x: 0.0, z: 0.8 },
  ]);
  const plans = planPosition(world, [1, 2, 3], { rng: mulberry32(42) });
  if (plans.length === 0) throw new Error('基准局面无规划结果，场景构造失败');
  return { world, step: plans[0].steps[0] };
}

function makeCapture(
  world: BilliardsWorld,
  step: PlannedStep,
  overrides: { angle?: number; power?: number } = {},
): ShotCapture {
  return {
    worldBefore: world,
    angle: overrides.angle ?? step.candidate.angle,
    power: overrides.power ?? step.candidate.power,
    spin: step.candidate.spin,
    planned: step,
    intent: {
      target: step.candidate.target,
      pocket: step.candidate.pocket,
      centerAngle: step.candidate.angle,
      halfWidth: step.candidate.tolerance,
    },
    breaking: false,
  };
}

describe('buildShotReview 复盘判定', () => {
  it('参数照抄计划 → perfect', () => {
    const { world, step } = setup();
    const review = buildShotReview(makeCapture(world, step));
    expect(review).not.toBeNull();
    expect(review!.actual.pocketedTarget).toBe(true);
    expect(review!.verdict).toBe('perfect');
    expect(review!.message).toContain('完美复现');
  });

  it('实际沿真实可进球轨迹，但比计划参考力度低 13 → position-miss / 力度偏小', () => {
    const { world, step } = setup();
    const strongerPlan: PlannedStep = {
      ...step,
      candidate: {
        ...step.candidate,
        power: step.candidate.power + 13,
      },
    };
    const review = buildShotReview(makeCapture(world, strongerPlan, {
      power: step.candidate.power,
    }));
    expect(review).not.toBeNull();
    expect(review!.actual.pocketedTarget).toBe(true);
    expect(review!.verdict).toBe('position-miss');
    expect(review!.message).toContain('力度偏小');
  });

  it('力度 +20 → position-miss / 力度偏大', () => {
    const { world, step } = setup();
    const review = buildShotReview(makeCapture(world, step, { power: step.candidate.power + 20 }));
    expect(review).not.toBeNull();
    expect(review!.actual.pocketedTarget).toBe(true);
    expect(review!.verdict).toBe('position-miss');
    expect(review!.message).toContain('力度偏大');
  });

  it('瞄准角加偏 → pot-miss / 厚薄与偏袋口文案', () => {
    const { world, step } = setup();
    // 两个方向各试一次：至少一个方向应打出 pot-miss 且文案几何自洽
    const outcomes = [0.02, -0.02].map((delta) =>
      buildShotReview(makeCapture(world, step, { angle: step.candidate.angle + delta })),
    );
    const miss = outcomes.find((r) => r && r.verdict === 'pot-miss');
    expect(miss).toBeTruthy();
    expect(miss!.actual.pocketedTarget).toBe(false);
    expect(miss!.message).toMatch(/偏袋口[左右]侧/);
    expect(miss!.message).toMatch(/打[厚薄]了/);
  });

  it('无计划 → null（静默跳过）', () => {
    const { world } = setup();
    const review = buildShotReview({
      worldBefore: world,
      angle: 0,
      power: 50,
      spin: { x: 0, y: 0 },
      planned: null,
      intent: null,
      breaking: false,
    });
    expect(review).toBeNull();
  });

  it('未查看计划但能推断目标球/袋口 → 生成自主复盘且不暴露计划轨迹', () => {
    const { world, step } = setup();
    const capture = makeCapture(world, step);
    capture.planned = null;
    const review = buildShotReview(capture);
    expect(review).not.toBeNull();
    expect(review!.planned).toBeNull();
    expect(review!.actual.pocketedTarget).toBe(true);
    expect(review!.message).toContain('下一杆');
  });

  it('规则判定犯规时只给一个最高优先级纠正', () => {
    const { world, step } = setup();
    const review = buildShotReview(makeCapture(world, step), {
      pocketed: [],
      firstContact: null,
      foulReason: 'no-contact',
    });
    expect(review?.verdict).toBe('foul');
    expect(review?.message).toContain('没有碰到目标球');
  });

  it('开球没有明确目标袋时也会生成赛后建议', () => {
    const { world } = setup();
    const review = buildShotReview({
      worldBefore: world,
      angle: 0,
      power: 75,
      spin: { x: 0, y: 0 },
      planned: null,
      intent: null,
      breaking: true,
    }, {
      pocketed: [],
      firstContact: 1,
      foulReason: null,
    });
    expect(review?.planned).toBeNull();
    expect(review?.message).toContain('开球');
  });

  it('普通杆没有明确目标袋时不会误报为开球', () => {
    const { world } = setup();
    const review = buildShotReview({
      worldBefore: world,
      angle: 0,
      power: 45,
      spin: { x: 0, y: 0 },
      planned: null,
      intent: null,
      breaking: false,
    }, {
      pocketed: [],
      firstContact: 1,
      foulReason: null,
    });
    expect(review?.message).toContain('定球、定袋');
    expect(review?.message).not.toContain('开球');
  });
});
