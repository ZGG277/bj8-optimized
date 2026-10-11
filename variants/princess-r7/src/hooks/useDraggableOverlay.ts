/*
[INPUT]: 浮层元素 ref 与拖拽手柄 Pointer 事件
[OUTPUT]: 受视口边界约束的浮层位移及 dragHandleProps
[POS]: HUD 交互 Hook；只处理拖拽几何，不知道规划或复盘业务
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type React from 'react';

type DragStart = {
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  rect: DOMRect;
};

export function useDraggableOverlay() {
  const elementRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      rect,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    event.preventDefault();
    const rawX = start.offsetX + event.clientX - start.pointerX;
    const rawY = start.offsetY + event.clientY - start.pointerY;
    const minX = start.offsetX - start.rect.left + 8;
    const maxX = start.offsetX + window.innerWidth - start.rect.right - 8;
    const minY = start.offsetY - start.rect.top + 8;
    const maxY = start.offsetY + window.innerHeight - start.rect.bottom - 8;
    setOffset({
      x: Math.min(maxX, Math.max(minX, rawX)),
      y: Math.min(maxY, Math.max(minY, rawY)),
    });
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStartRef.current) return;
    event.preventDefault();
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    elementRef,
    style: { marginLeft: offset.x, marginTop: offset.y },
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag,
    },
  };
}
