/*
[INPUT]: vitest、physics 手工局面与 tactical-shot 纯策略
[OUTPUT]: 验证顾燃在硬预算内选出真实进球、避免洗袋并保持挑战模式确定选优
[POS]: 对手战术选杆回归测试，不启动 Worker/DOM
[PROTOCOL]: 预算或选杆语义变化时同步更新本文件与 tactical-shot.ts
*/
import { describe, expect, it } from 'vitest';
import {
  cloneWorld,
  createInitialWorld,
  isCueBallPocketed,
  pocketedThisShot,
  simulateUntilStop,
  strikeCueBall,
  type BilliardsWorld,
} from '../physics';
import { chooseTacticalShot } from './tactical-shot';

function placeWorld(placements: { number: number; x: number; z: number }[]): BilliardsWorld {
  const world = createInitialWorld();
  const placed = new Map(placements.map(item => [item.number, item]));
  for (const ball of world.balls) {
    const placement = placed.get(ball.number);
    ball.active = Boolean(placement);
    if (placement) {
      ball.x = placement.x;
      ball.z = placement.z;
    }
  }
  return world;
}

const challenge = {
  candidateLimit: 6,
  simulationLimit: 24,
  followUpWeight: 0.9,
  alternativeChance: 0,
};

describe('challenge tactical shot', () => {
  it('直球近袋会选中已验证的安全中杆，并以真实结果避免洗袋', () => {
    const world = placeWorld([
      { number: 0, x: 0.2, z: 0 },
      { number: 1, x: 0.5, z: 0 },
    ]);
    const result = chooseTacticalShot(world, [1], challenge, () => 0.5);
    expect(result.simulations).toBeLessThanOrEqual(challenge.simulationLimit);
    expect(result.shot).not.toBeNull();
    expect(result.shot?.spin.x).toBe(0);

    const replay = cloneWorld(world);
    strikeCueBall(replay, result.shot!.angle, result.shot!.power, result.shot!.spin);
    simulateUntilStop(replay);
    expect(replay.firstContact).toBe(1);
    expect(pocketedThisShot(replay)).toContain(1);
    expect(isCueBallPocketed(replay)).toBe(false);
  });

  it('无候选时零仿真返回 null', () => {
    const empty = placeWorld([{ number: 0, x: 0, z: 0 }]);
    expect(chooseTacticalShot(empty, [1], challenge)).toEqual({
      shot: null,
      simulations: 0,
    });
  });
});
