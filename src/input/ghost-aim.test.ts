/*
[INPUT]: 依赖 vitest 与 ghost-aim 纯几何稳定器
[OUTPUT]: 幽灵球最小球心距离、低采样跨心、迟滞释放与角度奇点回归断言
[POS]: 幽灵球拖拽的纯输入防线，不挂载 React、DOM 或 Three.js
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  GHOST_RELEASE_HYSTERESIS_RATIO,
  resolveGhostAim,
} from './ghost-aim';

const MIN_DISTANCE = 0.05715;

describe('幽灵球近母球稳定区', () => {
  it('进入两球直径内时保留上一杆向并钳到安全圆周', () => {
    const result = resolveGhostAim({
      dx: 0.001,
      dz: -0.001,
      previousAngle: 0.42,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });

    expect(result).toEqual({
      angle: 0.42,
      distance: MIN_DISTANCE,
      nearCue: true,
    });
  });

  it('已进入稳定区时保持迟滞，不在边界噪声中反复切换', () => {
    const insideReleaseBand = MIN_DISTANCE * (1 + GHOST_RELEASE_HYSTERESIS_RATIO / 2);
    const result = resolveGhostAim({
      dx: insideReleaseBand,
      dz: 0,
      previousAngle: -0.7,
      nearCue: true,
      minDistance: MIN_DISTANCE,
    });

    expect(result.nearCue).toBe(true);
    expect(result.angle).toBeCloseTo(-0.7, 10);
    expect(result.distance).toBe(MIN_DISTANCE);
  });

  it('进入与释放边界都归入稳定侧，避免等号处来回抖动', () => {
    const entering = resolveGhostAim({
      dx: MIN_DISTANCE,
      dz: 0,
      previousAngle: 0.3,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });
    const releaseBoundary = resolveGhostAim({
      dx: MIN_DISTANCE * (1 + GHOST_RELEASE_HYSTERESIS_RATIO),
      dz: 0,
      previousAngle: 0.3,
      nearCue: true,
      minDistance: MIN_DISTANCE,
    });

    expect(entering.nearCue).toBe(true);
    expect(releaseBoundary.nearCue).toBe(true);
  });

  it('单帧从母球一侧快速穿到另一侧时仍先锁住上一稳定杆向', () => {
    const result = resolveGhostAim({
      dx: -MIN_DISTANCE * 3,
      dz: 0,
      previousDx: MIN_DISTANCE * 3,
      previousDz: 0,
      previousAngle: Math.PI / 2,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });

    expect(result).toEqual({
      angle: Math.PI / 2,
      distance: MIN_DISTANCE,
      nearCue: true,
    });
  });

  it('远离母球的快速反向移动不被误判为穿心', () => {
    const result = resolveGhostAim({
      dx: -MIN_DISTANCE * 3,
      dz: MIN_DISTANCE * 3,
      previousDx: MIN_DISTANCE * 3,
      previousDz: MIN_DISTANCE * 3,
      previousAngle: 0,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });

    expect(result.nearCue).toBe(false);
    expect(result.distance).toBeGreaterThan(MIN_DISTANCE);
    expect(result.angle).toBeCloseTo(-Math.PI * 3 / 4, 10);
  });

  it('跨过迟滞带后恢复绝对落点杆向', () => {
    const distance = MIN_DISTANCE * (1 + GHOST_RELEASE_HYSTERESIS_RATIO + 0.02);
    const result = resolveGhostAim({
      dx: distance,
      dz: 0,
      previousAngle: -0.7,
      nearCue: true,
      minDistance: MIN_DISTANCE,
    });

    expect(result.nearCue).toBe(false);
    expect(result.distance).toBeCloseTo(distance, 10);
    expect(result.angle).toBeCloseTo(Math.PI / 2, 10);
  });

  it('落点与母球中心完全重合时也不产生 NaN 或翻向', () => {
    const result = resolveGhostAim({
      dx: 0,
      dz: 0,
      previousAngle: Math.PI - 0.1,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });

    expect(Number.isFinite(result.angle)).toBe(true);
    expect(result.angle).toBeCloseTo(Math.PI - 0.1, 10);
    expect(result.distance).toBe(MIN_DISTANCE);
  });

  it('异常旧角度也会回退为有限安全角，不把 NaN 传播给相机', () => {
    const result = resolveGhostAim({
      dx: Number.NaN,
      dz: 0,
      previousAngle: Number.NaN,
      nearCue: false,
      minDistance: MIN_DISTANCE,
    });

    expect(result).toEqual({
      angle: 0,
      distance: MIN_DISTANCE,
      nearCue: true,
    });
  });
});
