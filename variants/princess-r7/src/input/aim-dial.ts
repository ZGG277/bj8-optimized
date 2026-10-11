/*
[INPUT]: 指针轴向位移、用户显式选择的粗瞄/精瞄档与 Pointer 压力
[OUTPUT]: 对外提供无限拨轮的双档角度换算、压感紧度/视觉映射与手动精瞄状态
[POS]: 纯输入换算层；粗档保证 360° 持续旋转，精瞄只由用户启动且传动固定，不探测目标球或袋口
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

/** 约 900px 转完整一周；拨轮可反复抬手续拨，因此没有行程边界。 */
export const AIM_DIAL_COARSE_RAD_PER_PX = Math.PI * 2 / 900;
/** 手动精瞄固定为粗档的 1/8；不因扫过某个袋口而改变手感。 */
export const AIM_DIAL_FINE_RAD_PER_PX = AIM_DIAL_COARSE_RAD_PER_PX / 8;
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

export type AimDialMode = 'coarse' | 'fine';

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

export function aimDialMode(
  precisionActive: boolean,
): AimDialMode {
  return precisionActive ? 'fine' : 'coarse';
}

/**
 * 传动比只由用户显式档位决定。这样没有辅助线时，扫过袋口也不会自动收紧手感。
 */
export function aimDialRadiansPerPixel(precisionActive: boolean): number {
  return precisionActive
    ? AIM_DIAL_FINE_RAD_PER_PX
    : AIM_DIAL_COARSE_RAD_PER_PX;
}

export function aimDialAngleDelta(
  pixelDelta: number,
  precisionActive: boolean,
  pressureGain = 1,
): number {
  return pixelDelta * aimDialRadiansPerPixel(precisionActive) * pressureGain;
}
