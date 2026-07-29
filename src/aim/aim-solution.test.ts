/*
[INPUT]: 依赖 vitest、aim-solution 纯几何与 physics 世界构造
[OUTPUT]: 精瞄进入、360° 首碰、袋口横向窗口、遮挡与迟滞的确定性回归断言
[POS]: aim 层可失败测试网，不挂载 React/Three.js
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { createInitialWorld, type BilliardsWorld } from '../physics';
import {
  aimAngleForPocketOffset,
  findPrecisionAim,
  firstObjectHit,
  PRECISION_ENTER_MULTIPLIER,
  precisionStillValid,
} from './aim-solution';

function placeWorld(placements: { n: number; x: number; z: number }[]): BilliardsWorld {
  const world = createInitialWorld();
  const map = new Map(placements.map((placement) => [placement.n, placement]));
  for (const ball of world.balls) {
    const placement = map.get(ball.number);
    ball.active = Boolean(placement);
    if (placement) {
      ball.x = placement.x;
      ball.z = placement.z;
      ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
    }
  }
  return world;
}

describe('精瞄纯几何', () => {
  const straight = () =>
    placeWorld([
      { n: 0, x: 0.2, z: 0 },
      { n: 1, x: 0.5, z: 0 },
    ]);

  it('360° 世界角首碰不依赖视角：向右为 1 号，反向无目标', () => {
    expect(firstObjectHit(straight(), Math.PI / 2)).toBe(1);
    expect(firstObjectHit(straight(), -Math.PI / 2)).toBeNull();
  });

  it('接近右中袋中心线时进入精瞄，并提供完整 -1..1 袋口窗口', () => {
    const world = straight();
    const center = aimAngleForPocketOffset(world, 1, 3, 0)!;
    const left = aimAngleForPocketOffset(world, 1, 3, -1)!;
    const right = aimAngleForPocketOffset(world, 1, 3, 1)!;
    const solution = findPrecisionAim(world, center, [1]);

    expect(solution?.target).toBe(1);
    expect(solution?.pocket).toBe(3);
    expect(solution?.pocketName).toBe('右中袋');
    expect(left).not.toBeCloseTo(right, 6);
    expect(center).toBeGreaterThan(Math.min(left, right));
    expect(center).toBeLessThan(Math.max(left, right));
    expect(precisionStillValid(world, center, [1], solution!)).toBe(true);
  });

  it('2.6× 近袋触发窗覆盖旧 1.6× 之外，并拒绝窗口外落点', () => {
    const world = straight();
    const center = aimAngleForPocketOffset(world, 1, 3, 0)!;
    const centered = findPrecisionAim(world, center, [1])!;
    const expandedAngle = center + centered.halfWidth * 2.1;
    const outsideAngle = center + centered.halfWidth * (PRECISION_ENTER_MULTIPLIER + 0.2);

    expect(findPrecisionAim(world, expandedAngle, [1])).not.toBeNull();
    expect(findPrecisionAim(world, expandedAngle, [1], 1.6)).toBeNull();
    expect(findPrecisionAim(world, outsideAngle, [1])).toBeNull();
  });

  it('首碰非法或目标球到袋口被挡时不进入精瞄', () => {
    const illegalWorld = straight();
    const center = aimAngleForPocketOffset(illegalWorld, 1, 3, 0)!;
    expect(findPrecisionAim(illegalWorld, center, [2])).toBeNull();

    const blocked = placeWorld([
      { n: 0, x: 0.2, z: 0 },
      { n: 1, x: 0.45, z: 0 },
      { n: 9, x: 0.55, z: 0 },
    ]);
    const blockedCenter = aimAngleForPocketOffset(blocked, 1, 3, 0)!;
    expect(findPrecisionAim(blocked, blockedCenter, [1])).toBeNull();
  });
});
