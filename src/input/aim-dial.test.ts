/*
[INPUT]: 依赖 vitest 与 aim-dial 纯输入换算
[OUTPUT]: 用户显式粗/精双档、固定精瞄传动、压感增益/视觉与回退断言
[POS]: 无限拨轮输入层可失败测试网，不挂载 React/DOM
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  AIM_DIAL_COARSE_RAD_PER_PX,
  AIM_DIAL_FINE_RAD_PER_PX,
  aimDialAngleDelta,
  aimDialMode,
  aimDialPressureProfile,
  aimDialRadiansPerPixel,
  hasUsableAimDialPressure,
} from './aim-dial';

describe('无限瞄准拨轮', () => {
  it('默认粗档保持可持续 360° 旋转', () => {
    expect(aimDialMode(false)).toBe('coarse');
    expect(aimDialRadiansPerPixel(false)).toBeCloseTo(AIM_DIAL_COARSE_RAD_PER_PX, 8);
  });

  it('只有用户显式切档才进入固定精瞄传动', () => {
    expect(aimDialMode(true)).toBe('fine');
    expect(aimDialRadiansPerPixel(true)).toBeCloseTo(AIM_DIAL_FINE_RAD_PER_PX, 8);
    expect(aimDialRadiansPerPixel(false) / aimDialRadiansPerPixel(true)).toBeCloseTo(8, 8);
  });

  it('相同手势在精瞄档严格缩小为八分之一，不依赖袋口解', () => {
    expect(aimDialAngleDelta(180, true)).toBeCloseTo(
      aimDialAngleDelta(180, false) / 8,
      8,
    );
  });

  it('左右拨动保持方向符号且无固定行程边界', () => {
    expect(aimDialAngleDelta(64, true)).toBeGreaterThan(0);
    expect(aimDialAngleDelta(-64, true)).toBeLessThan(0);
    expect(aimDialAngleDelta(640, false)).toBeCloseTo(640 * AIM_DIAL_COARSE_RAD_PER_PX, 8);
  });

  it('真实压力越大，传动增益越低且紧度视觉越强', () => {
    const low = aimDialPressureProfile('touch', 0.18);
    const high = aimDialPressureProfile('touch', 0.82);
    expect(low.supported).toBe(true);
    expect(high.supported).toBe(true);
    expect(low.gain).toBeGreaterThan(high.gain);
    expect(low.visualTightness).toBeLessThan(high.visualTightness);
    expect(aimDialAngleDelta(40, false, high.gain))
      .toBeLessThan(aimDialAngleDelta(40, false, low.gain));
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
