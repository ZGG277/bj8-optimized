/*
[INPUT]: 依赖 usePositionPlan 导出的 planFingerprint、physics 世界构造
[OUTPUT]: 回归预算指纹分组语义、按需触发门控与玩家走位预算/墙钟上限
[POS]: hooks 层纯函数测试，不挂载 React
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it, expect } from 'vitest';
import { createInitialWorld } from '../physics';
import type { MatchState } from '../match/types';
import {
  PLAYER_PLAN_DEADLINE_MS,
  PLAYER_PLAN_OPTIONS,
  planFingerprint,
  shouldComputePositionPlan,
} from './usePositionPlan';

describe('planFingerprint 分组语义', () => {
  it('同一球局、不同分组 → 指纹必须不同（分组竞态回归）', () => {
    const world = createInitialWorld();
    const open = planFingerprint(world, null);
    const solid = planFingerprint(world, 'solid');
    const stripe = planFingerprint(world, 'stripe');
    expect(open).not.toBe(solid);
    expect(open).not.toBe(stripe);
    expect(solid).not.toBe(stripe);
  });

  it('同一球局同一分组 → 指纹稳定；球位变化 → 指纹变化', () => {
    const world = createInitialWorld();
    expect(planFingerprint(world, 'solid')).toBe(planFingerprint(world, 'solid'));
    world.balls[1].x += 0.01;
    expect(planFingerprint(world, 'solid')).not.toBe(planFingerprint(createInitialWorld(), 'solid'));
  });
});

describe('走位计算节能门控', () => {
  const world = createInitialWorld();
  const aiming: MatchState = {
    phase: 'aiming',
    actor: 'player',
    breaking: false,
    playerGroup: null,
    winner: null,
    messageKey: 'placed',
    messageParams: {},
  };

  it('走位与击球复盘关闭时即使轮到玩家也不计算', () => {
    expect(shouldComputePositionPlan(false, world, aiming)).toBe(false);
  });

  it('仅开启走位与击球复盘且处于静止玩家瞄准态时计算', () => {
    expect(shouldComputePositionPlan(true, world, aiming)).toBe(true);
    expect(shouldComputePositionPlan(true, world, {
      ...aiming,
      phase: 'opponent',
      actor: 'opponent',
    })).toBe(false);
    expect(shouldComputePositionPlan(true, { ...world, moving: true }, aiming)).toBe(false);
  });

  it('使用两层小预算并在 2.5 秒内终止', () => {
    expect(PLAYER_PLAN_OPTIONS.samples).toBeLessThanOrEqual(8);
    expect(PLAYER_PLAN_OPTIONS.maxDepth).toBeLessThanOrEqual(2);
    expect(PLAYER_PLAN_OPTIONS.simBudget).toBeLessThanOrEqual(320);
    expect(PLAYER_PLAN_DEADLINE_MS).toBeLessThanOrEqual(2500);
  });
});
