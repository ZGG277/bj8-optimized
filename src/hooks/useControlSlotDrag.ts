/*
[INPUT]: 控件槽位 ref、右侧黑色控制轨 ref、布局编辑态与持久化键
[OUTPUT]: 编辑态下即时纵向拖动、黑条内部边界约束、持久化位移与 Pointer 捕获属性
[POS]: HUD 交互 Hook；只处理单个控件在控制轨内的排布，不负责进入/退出编辑模式
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

type DragStart = {
  pointerId: number;
  pointerY: number;
  offsetY: number;
  rect: DOMRect;
  railRect: DOMRect;
};

const RAIL_GUTTER = 4;
const STORAGE_PREFIX = 'bj8-control-y:v2:';

function readStoredOffset(storageKey: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function useControlSlotDrag(
  storageKey: string,
  enabled: boolean,
  railRef: React.RefObject<HTMLDivElement | null>,
) {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const [offsetY, setOffsetY] = useState(() => readStoredOffset(storageKey));
  const [dragging, setDragging] = useState(false);

  const clampCurrentOffset = useCallback((current: number) => {
    const element = elementRef.current;
    const rail = railRef.current;
    if (!element || !rail) return current;
    const rect = element.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const baseTop = rect.top - current;
    const baseBottom = rect.bottom - current;
    const min = railRect.top + RAIL_GUTTER - baseTop;
    const max = railRect.bottom - RAIL_GUTTER - baseBottom;
    return min > max ? min : Math.min(max, Math.max(min, current));
  }, [railRef]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(offsetY));
    } catch {
      // 隐私/受限存储环境下仍保留当前会话内的排布。
    }
  }, [offsetY, storageKey]);

  useEffect(() => {
    const clampToRail = () => setOffsetY(current => clampCurrentOffset(current));
    const frame = window.requestAnimationFrame(clampToRail);
    window.addEventListener('resize', clampToRail);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', clampToRail);
    };
  }, [clampCurrentOffset]);

  useEffect(() => {
    if (enabled) return;
    dragStartRef.current = null;
    setDragging(false);
  }, [enabled]);

  const onPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = elementRef.current?.getBoundingClientRect();
    const railRect = railRef.current?.getBoundingClientRect();
    if (!rect || !railRect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      pointerY: event.clientY,
      offsetY,
      rect,
      railRect,
    };
    setDragging(true);
  };

  const onPointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!enabled || !start || start.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = start.offsetY + event.clientY - start.pointerY;
    const min = start.offsetY + start.railRect.top + RAIL_GUTTER - start.rect.top;
    const max = start.offsetY + start.railRect.bottom - RAIL_GUTTER - start.rect.bottom;
    setOffsetY(min > max ? min : Math.min(max, Math.max(min, raw)));
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragStartRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    elementRef,
    style: { transform: `translate3d(0, ${offsetY}px, 0)` },
    dragging,
    slotDragProps: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture: stopDrag,
      onPointerCancelCapture: stopDrag,
    },
  };
}
