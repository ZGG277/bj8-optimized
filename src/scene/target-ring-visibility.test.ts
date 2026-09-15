import { describe, expect, it } from 'vitest';
import { nonOverlappingTargetNumbers } from './target-ring-visibility';

describe('合法目标高亮环可见性', () => {
  it('隐藏紧贴合法球的相交环，保留已经分开的单球提示', () => {
    const visible = nonOverlappingTargetNumbers([
      { number: 1, active: true, x: 0, z: 0 },
      { number: 2, active: true, x: .05715, z: 0 },
      { number: 3, active: true, x: .2, z: 0 },
    ], new Set([1, 2, 3]), .04);
    expect([...visible]).toEqual([3]);
  });

  it('非合法或已落袋邻球不压掉合法目标提示', () => {
    const visible = nonOverlappingTargetNumbers([
      { number: 1, active: true, x: 0, z: 0 },
      { number: 2, active: true, x: .05715, z: 0 },
      { number: 3, active: false, x: -.05715, z: 0 },
    ], new Set([1]), .04);
    expect([...visible]).toEqual([1]);
  });
});
