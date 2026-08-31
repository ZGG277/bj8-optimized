/*
[INPUT]: 依赖 vitest 与 aim-dial 纯输入换算
[OUTPUT]: 固定普通/精调档、袋口提示与传动解耦、方向符号和无边界回归断言
[POS]: 无限拨轮输入层可失败测试网，不挂载 React/DOM
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import {
  AIM_DIAL_APPROACH_RATIO,
  AIM_DIAL_COARSE_RAD_PER_PX,
  AIM_DIAL_FINE_RAD_PER_PX,
  aimDialAngleDelta,
  aimDialRatio,
  aimDialRadiansPerPixel,
} from './aim-dial';

function solution(ratio: number, halfWidth = 0.018): PrecisionAimSolution {
  return {
    target: 1,
    pocket: 3,
    pocketName: '右中袋',
    centerAngle: 0,
    leftAngle: -halfWidth,
    rightAngle: halfWidth,
    halfWidth,
    offset: Math.min(1, ratio),
    error: halfWidth * ratio,
  };
}

describe('无限瞄准拨轮', () => {
  it('普通档始终保持可持续旋转的固定传动比', () => {
    expect(aimDialRadiansPerPixel('normal')).toBeCloseTo(AIM_DIAL_COARSE_RAD_PER_PX, 8);
    expect(aimDialAngleDelta(64, 'normal')).toBeCloseTo(64 * AIM_DIAL_COARSE_RAD_PER_PX, 8);
  });

  it('精调离合采用独立固定档且明显慢于普通档', () => {
    expect(aimDialRadiansPerPixel('fine')).toBeCloseTo(AIM_DIAL_FINE_RAD_PER_PX, 8);
    expect(aimDialRadiansPerPixel('fine')).toBeLessThan(aimDialRadiansPerPixel('normal') / 10);
  });

  it('袋口距离只生成提示比值，不参与双档传动', () => {
    const near = solution(0.4);
    const far = solution(AIM_DIAL_APPROACH_RATIO + 1);
    expect(aimDialRatio(near)).toBeCloseTo(0.4, 8);
    expect(aimDialRatio(far)).toBeGreaterThan(AIM_DIAL_APPROACH_RATIO);
    expect(aimDialAngleDelta(80, 'normal')).toBeCloseTo(80 * AIM_DIAL_COARSE_RAD_PER_PX, 8);
    expect(aimDialAngleDelta(80, 'fine')).toBeCloseTo(80 * AIM_DIAL_FINE_RAD_PER_PX, 8);
  });

  it('两档左右拨动都保持方向符号且没有行程边界', () => {
    expect(aimDialAngleDelta(64, 'normal')).toBeGreaterThan(0);
    expect(aimDialAngleDelta(-64, 'normal')).toBeLessThan(0);
    expect(aimDialAngleDelta(640, 'fine')).toBeCloseTo(640 * AIM_DIAL_FINE_RAD_PER_PX, 8);
  });
});
