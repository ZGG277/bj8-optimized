/*
[INPUT]: 浏览器设备像素比、指针类型、当前时间与上一刷新时钟
[OUTPUT]: 对外提供渲染像素比策略、60 FPS 场景刷新与 30 FPS UI 快照节流常量/纯函数
[POS]: 表现层性能策略；不得改变 240 Hz 物理步进、规则状态或击球输入
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

export const SCENE_RENDER_FPS = 60;
export const WORLD_SCENE_SYNC_FPS = 60;
export const WORLD_UI_SYNC_FPS = 30;

const FRAME_TOLERANCE_MS = 0.5;

/** 触屏设备优先续航；桌面高分屏保留适度超采样，避免 Retina 直接按 2x 持续烧 GPU。 */
export function preferredPixelRatio(devicePixelRatio: number, coarsePointer: boolean): number {
  const cap = coarsePointer ? 1 : 1.5;
  return Math.max(1, Math.min(devicePixelRatio || 1, cap));
}

/**
 * 领取下一刷新时隙。返回 null 表示本帧跳过，否则返回校正后的时钟锚点。
 * 锚点按固定间隔推进而非直接写 now，使 120/144 Hz 屏幕都能稳定逼近目标帧率。
 */
export function claimFrameSlot(
  nowMs: number,
  previousSlotMs: number | null,
  fps: number,
): number | null {
  if (previousSlotMs === null) return nowMs;
  const interval = 1000 / fps;
  const elapsed = nowMs - previousSlotMs;
  if (elapsed < interval - FRAME_TOLERANCE_MS) return null;
  const elapsedSlots = Math.max(1, Math.floor((elapsed + FRAME_TOLERANCE_MS) / interval));
  return previousSlotMs + elapsedSlots * interval;
}
