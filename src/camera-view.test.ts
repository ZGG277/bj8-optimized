/*
[INPUT]: camera-view 连续视角纯几何
[OUTPUT]: 锁定端点兼容、任意高度停留、单调抬升与全高度环绕不变量
[POS]: 连续视角相机回归测试
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_VIEW,
  OVERHEAD_VIEW,
  cameraPoseAt,
  clampViewLevel,
  viewLevelLabel,
} from './camera-view';

describe('continuous camera view', () => {
  it('钳制任意输入并保留端点语义', () => {
    expect(clampViewLevel(-1)).toBe(FIRST_PERSON_VIEW);
    expect(clampViewLevel(0.43)).toBe(0.43);
    expect(clampViewLevel(2)).toBe(OVERHEAD_VIEW);
    expect(clampViewLevel(Number.NaN)).toBe(FIRST_PERSON_VIEW);
    expect(viewLevelLabel(0)).toBe('第一人称');
    expect(viewLevelLabel(0.43)).toBe('视角高度 43%');
    expect(viewLevelLabel(1)).toBe('俯视');
  });

  it('高度随推杆位置单调抬升且中间值不会吸附端点', () => {
    const heights = [0, 0.2, 0.43, 0.75, 1].map(
      level => cameraPoseAt(0.18, 0.62, 0.3, 0, level).position.y,
    );
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights[2]).toBeGreaterThan(heights[1]);
    expect(heights[2]).toBeLessThan(heights[3]);
  });

  it.each([0, 0.25, 0.6, 1])('在高度 %s 转向 180° 会环绕到球台另一侧', (level) => {
    const forward = cameraPoseAt(0, 0, 0, 0, level);
    const reverse = cameraPoseAt(0, 0, Math.PI, 0, level);
    expect(forward.position.z * reverse.position.z).toBeLessThan(0);
    expect(Math.abs(forward.position.y - reverse.position.y)).toBeLessThan(1e-10);
  });

  it('俯视端沿世界杆向绕球台中心旋转而不是锁死方向', () => {
    const north = cameraPoseAt(0.3, 0.8, 0, 0, 1);
    const east = cameraPoseAt(0.3, 0.8, Math.PI / 2, 0, 1);
    expect(north.position.x).toBeCloseTo(0, 10);
    expect(north.position.z).toBeCloseTo(0.85, 10);
    expect(east.position.x).toBeCloseTo(-0.85, 10);
    expect(east.position.z).toBeCloseTo(0, 10);
  });
});
