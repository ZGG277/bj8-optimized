/*
[INPUT]: 依赖 usePositionPlan 导出的 planFingerprint、physics 世界构造
[OUTPUT]: 回归：预算指纹必须含分组——worldView 与 match 分帧到达时不复用旧分组结果
[POS]: hooks 层纯函数测试，不挂载 React
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it, expect } from 'vitest';
import { createInitialWorld } from '../physics';
import { planFingerprint } from './usePositionPlan';

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
