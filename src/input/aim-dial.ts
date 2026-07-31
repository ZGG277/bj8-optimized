/*
[INPUT]: 指针轴向位移、Pointer 压力与当前最近合法袋口几何解
[OUTPUT]: 对外提供无限拨轮的连续变速角度换算、压感紧度/视觉映射与接近/精瞄状态
[POS]: 纯输入换算层；远袋保证可持续旋转，近袋按有效袋口窗口与可靠压力平滑降档，不依赖 React/DOM
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { PrecisionAimSolution } from '../aim/aim-solution';

/** 约 900px 转完整一周；拨轮可反复抬手续拨，因此没有行程边界。 */
export const AIM_DIAL_COARSE_RAD_PER_PX = Math.PI * 2 / 900;
/** 进入该倍数后开始平滑降档，比旧 2.6× 呼出窗更宽。 */
export const AIM_DIAL_APPROACH_RATIO = 3.8;
/** 退出锁定略宽，避免临界处在两个袋口间闪烁。 */
export const AIM_DIAL_UNLOCK_RATIO = 4.8;
/** 精瞄时约 180px 走完整个有效袋口左右边缘。 */
export const AIM_DIAL_FINE_TRAVEL_PX = 180;
/** 普通触摸/鼠标在不支持压感时通常固定报告 0.5。 */
export const AIM_DIAL_FALLBACK_PRESSURE = 0.5;
export const AIM_DIAL_PRESSURE_EPSILON = 0.04;

export type AimDialPressureProfile = {
  supported: boolean;
  pressure: number;
  /** 乘到原传动比上的增益；压力越大，单位位移对应角度越小。 */
  gain: number;
  /** 0..1，供控件环形收紧、亮度和压缩反馈使用。 */
  visualTightness: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function hasUsableAimDialPressure(
  pointerType: string,
  pressure: number,
): boolean {
  if (!Number.isFinite(pressure) || pressure <= 0) return false;
  if (pointerType === 'mouse') return false;
  if (pointerType === 'pen') return true;
  return pointerType === 'touch' &&
    Math.abs(pressure - AIM_DIAL_FALLBACK_PRESSURE) > AIM_DIAL_PRESSURE_EPSILON;
}

/**
 * 支持压感时，低压保持接近既有速度，高压把传动比收紧到约 32%。
 * pressureDetected 允许一次手势在确认设备有真实压感后平滑穿过 0.5；
 * 未确认的固定 0.5、鼠标和无效数值都严格回退为 gain=1。
 */
export function aimDialPressureProfile(
  pointerType: string,
  pressure: number,
  pressureDetected = false,
): AimDialPressureProfile {
  const supported = pointerType !== 'mouse' &&
    (pressureDetected || hasUsableAimDialPressure(pointerType, pressure));
  if (!supported) {
    return {
      supported: false,
      pressure: AIM_DIAL_FALLBACK_PRESSURE,
      gain: 1,
      visualTightness: 0,
    };
  }
  const normalized = clamp01(pressure);
  const tightness = smoothstep(normalized);
  return {
    supported: true,
    pressure: normalized,
    gain: 1.08 - tightness * 0.76,
    visualTightness: tightness,
  };
}

export function aimDialRatio(solution: PrecisionAimSolution | null): number | null {
  if (!solution) return null;
  return Math.abs(solution.error) / Math.max(0.0005, solution.halfWidth);
}

export function aimDialMode(
  solution: PrecisionAimSolution | null,
): 'coarse' | 'approach' | 'fine' {
  const ratio = aimDialRatio(solution);
  if (ratio === null || ratio >= AIM_DIAL_APPROACH_RATIO) return 'coarse';
  return ratio <= 1 ? 'fine' : 'approach';
}

/**
 * 传动比随袋口接近度连续变化：
 * ratio<=1 时 180px 横跨完整袋口；ratio>=3.8 时回到粗档，中间 smoothstep 插值。
 */
export function aimDialRadiansPerPixel(solution: PrecisionAimSolution | null): number {
  if (!solution) return AIM_DIAL_COARSE_RAD_PER_PX;
  const ratio = aimDialRatio(solution) ?? AIM_DIAL_APPROACH_RATIO;
  const fine = solution.halfWidth * 2 / AIM_DIAL_FINE_TRAVEL_PX;
  const blend = smoothstep((ratio - 1) / (AIM_DIAL_APPROACH_RATIO - 1));
  return fine + (AIM_DIAL_COARSE_RAD_PER_PX - fine) * blend;
}

export function aimDialAngleDelta(
  pixelDelta: number,
  solution: PrecisionAimSolution | null,
  pressureGain = 1,
): number {
  return pixelDelta * aimDialRadiansPerPixel(solution) * pressureGain;
}
