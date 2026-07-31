/*
[INPUT]: 依赖 vitest 与 aim-dial 纯输入换算
[OUTPUT]: 粗档、接近区连续降速、精瞄袋口全行程、压感增益/视觉与回退断言
[POS]: 无限拨轮输入层可失败测试网，不挂载 React/DOM
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import {
  AIM_DIAL_COARSE_RAD_PER_PX,
  AIM_DIAL_FINE_TRAVEL_PX,
  aimDialAngleDelta,
  aimDialMode,
  aimDialPressureProfile,
  aimDialRadiansPerPixel,
  hasUsableAimDialPressure,
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
  it('无袋口候选时保持可持续旋转的粗档', () => {
    expect(aimDialMode(null)).toBe('coarse');
    expect(aimDialRadiansPerPixel(null)).toBeCloseTo(AIM_DIAL_COARSE_RAD_PER_PX, 8);
  });

  it('接近袋口时连续降档，不发生二元跳变', () => {
    const far = aimDialRadiansPerPixel(solution(3.7));
    const middle = aimDialRadiansPerPixel(solution(2.2));
    const fine = aimDialRadiansPerPixel(solution(1));
    expect(far).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(fine);
    expect(aimDialMode(solution(2.2))).toBe('approach');
  });

  it('精瞄档 180px 恰好覆盖有效袋口左右边缘', () => {
    const active = solution(0);
    expect(aimDialAngleDelta(AIM_DIAL_FINE_TRAVEL_PX, active)).toBeCloseTo(active.halfWidth * 2, 8);
    expect(aimDialMode(active)).toBe('fine');
  });

  it('左右拨动保持方向符号且无固定行程边界', () => {
    const active = solution(0.4);
    expect(aimDialAngleDelta(64, active)).toBeGreaterThan(0);
    expect(aimDialAngleDelta(-64, active)).toBeLessThan(0);
    expect(aimDialAngleDelta(640, null)).toBeCloseTo(640 * AIM_DIAL_COARSE_RAD_PER_PX, 8);
  });

  it('真实压力越大，传动增益越低且紧度视觉越强', () => {
    const low = aimDialPressureProfile('touch', 0.18);
    const high = aimDialPressureProfile('touch', 0.82);
    expect(low.supported).toBe(true);
    expect(high.supported).toBe(true);
    expect(low.gain).toBeGreaterThan(high.gain);
    expect(low.visualTightness).toBeLessThan(high.visualTightness);
    expect(aimDialAngleDelta(40, null, high.gain))
      .toBeLessThan(aimDialAngleDelta(40, null, low.gain));
  });

  it('固定 0.5 普通触摸、鼠标与无效 pressure 均回退原传动', () => {
    for (const [pointerType, pressure] of [
      ['touch', 0.5],
      ['mouse', 0.9],
      ['touch', 0],
    ] as const) {
      expect(hasUsableAimDialPressure(pointerType, pressure)).toBe(false);
      expect(aimDialPressureProfile(pointerType, pressure)).toEqual({
        supported: false,
        pressure: 0.5,
        gain: 1,
        visualTightness: 0,
      });
    }
  });

  it('手势确认压感后经过 0.5 仍连续，不跳回普通触摸档', () => {
    const middle = aimDialPressureProfile('touch', 0.5, true);
    expect(middle.supported).toBe(true);
    expect(middle.gain).toBeCloseTo(0.7, 8);
    expect(middle.visualTightness).toBeCloseTo(0.5, 8);
  });
});
