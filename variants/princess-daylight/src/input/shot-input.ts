/*
[INPUT]: 指针拖拽距离、按压时长、击球点指针偏移与可用行程等原始输入量
[OUTPUT]: 对外提供确定性输入换算:powerFromDrag / powerFromHold / clampSpin / buildShotIntent 与 ShotIntent 类型
[POS]: 实验场的输入纯换算层,不依赖 React、DOM 或物理;任何计时与几何事实必须作为参数传入
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import type { CueSpin } from '../physics';

/** 轻触保底力度:任何有效出杆不低于此值 */
export const MIN_POWER = 6;
/** 按住蓄力满力时长(ms) */
export const HOLD_FULL_MS = 1667;
/** 拖拽可用行程归一化窗口(px):低于下限按下限、高于上限按上限 */
export const TRAVEL_MIN_PX = 72;
export const TRAVEL_MAX_PX = 180;

export type DragSession = {
  kind: 'drag';
  startY: number;
  currentY: number;
  availableTravel: number;
};

export type HoldSession = {
  kind: 'hold';
  startTime: number;
};

export type ChargeSession = DragSession | HoldSession;

/** 一次出杆的最终意图:力度与击球点,由纯输入事实一次性算出 */
export type ShotIntent = {
  power: number;
  spin: CueSpin;
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** 可用行程归一化:保证横屏小行程也能满力、大屏行程不会过于迟钝 */
export function normalizeTravel(availableTravel: number): number {
  if (!Number.isFinite(availableTravel)) return TRAVEL_MAX_PX;
  return clamp(availableTravel, TRAVEL_MIN_PX, TRAVEL_MAX_PX);
}

/** 拖拽蓄力:按下起点到下拉终点的距离占可用行程比例映射 0-100,无位移给保底力度 */
export function powerFromDrag(startY: number, currentY: number, availableTravel: number): number {
  const travel = normalizeTravel(availableTravel);
  const drag = currentY - startY;
  if (drag <= 0) return MIN_POWER;
  return clamp(Math.round((drag / travel) * 100), MIN_POWER, 100);
}

/** 按住蓄力:真实墙钟时长线性映射 0-100,1667ms 满力;最终值必须在松开时刻重算 */
export function powerFromHold(startTime: number, releasedAt: number): number {
  const elapsed = releasedAt - startTime;
  if (elapsed <= 0) return MIN_POWER;
  return clamp(Math.round((elapsed / HOLD_FULL_MS) * 100), MIN_POWER, 100);
}

/**
 * 击球点指针换算:指针相对控件左上角的像素偏移 → 单位圆内的 CueSpin。
 * x 为高低杆(上为正),y 为左右塞(右为正);超出单位圆按方向等比收回。
 */
export function clampSpin(
  pointer: { x: number; y: number },
  bounds: { width: number; height: number },
): CueSpin {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  const dx = (pointer.x / bounds.width - 0.5) * 2;
  const dy = (pointer.y / bounds.height - 0.5) * 2;
  const len = Math.hypot(dx, dy);
  const scale = len > 1 ? 1 / len : 1;
  return {
    // +0 归一化 -0,避免下游相等性判断出现意外
    x: clamp(-dy * scale, -1, 1) + 0,
    y: clamp(dx * scale, -1, 1) + 0,
  };
}

/** 汇总一次蓄力会话与击球点,产出唯一 ShotIntent;每次用户动作只允许调用一次 */
export function buildShotIntent(session: ChargeSession, spin: CueSpin, releasedAt?: number): ShotIntent {
  const power = session.kind === 'drag'
    ? powerFromDrag(session.startY, session.currentY, session.availableTravel)
    : powerFromHold(session.startTime, releasedAt ?? session.startTime);
  return {
    power,
    spin: { x: clamp(spin.x, -1, 1), y: clamp(spin.y, -1, 1) },
  };
}
