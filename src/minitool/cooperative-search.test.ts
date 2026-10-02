import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../physics';
import { planPosition, planPositionSteps } from '../planner/search';
import { chooseTacticalShot, tacticalShotSteps } from '../opponent/tactical-shot';
import { runSearchSteps } from './cooperative-search';

describe('小工具分段计算', () => {
  it('取消后关闭生成器且不回传旧结果', async () => {
    let cancelled = false, closed = false;
    function* steps() { try { cancelled = true; yield; return 7; } finally { closed = true; } }
    expect(await runSearchSteps(steps(), () => cancelled)).toBeUndefined();
    expect(closed).toBe(true);
  });
  it('顾燃分段选杆与同步选杆严格一致', async () => {
    const world = createInitialWorld();
    for (const ball of world.balls) {
      ball.active = ball.number <= 1;
      if (ball.number === 0) { ball.x = .2; ball.z = 0; }
      if (ball.number === 1) { ball.x = .5; ball.z = 0; }
    }
    const config = { allowSafety: true, candidateLimit: 6, simulationLimit: 24, followUpWeight: .9, alternativeChance: 0 };
    expect(await runSearchSteps(tacticalShotSteps(world, [1], config, () => .5), () => false))
      .toEqual(chooseTacticalShot(world, [1], config, () => .5));
    const opts = { samples: 2, simBudget: 100, maxDepth: 1, rng: () => .5 };
    expect(await runSearchSteps(planPositionSteps(world, [1], opts), () => false))
      .toEqual(planPosition(world, [1], opts));
  });
});
