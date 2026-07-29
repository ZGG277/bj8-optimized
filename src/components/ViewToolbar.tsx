/*
[INPUT]: 当前归一化视角高度与连续调整回调
[OUTPUT]: 对外提供可停留任意高度的长行程竖向推杆，支持拖动、端点点击与渐进键盘操作
[POS]: 控制组件层，只转发 0..1 连续视角事实，不持有对局或相机状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  FIRST_PERSON_VIEW,
  OVERHEAD_VIEW,
  clampViewLevel,
  viewLevelLabel,
} from '../camera-view';

type Props = {
  viewLevel: number;
  onViewLevel: (level: number) => void;
};

/** 必须与 controls.css 轨道/填充上下 12px 的可见行程一致。 */
const TRACK_INSET_PX = 12;

/** 推杆跟随手指并持续提交高度；松手停在原位，不再吸附端点。 */
export function ViewToolbar({ viewLevel, onViewLevel }: Props) {
  const pointerIdRef = useRef<number | null>(null);
  const levelRef = useRef(clampViewLevel(viewLevel));
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const level = dragLevel ?? clampViewLevel(viewLevel);
  if (pointerIdRef.current === null) levelRef.current = level;

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const travel = Math.max(1, rect.height - TRACK_INSET_PX * 2);
    const next = clampViewLevel((rect.bottom - TRACK_INSET_PX - event.clientY) / travel);
    levelRef.current = next;
    setDragLevel(next);
    onViewLevel(next);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateFromPointer(event);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    pointerIdRef.current = null;
    setDragLevel(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowUp') {
      next = levelRef.current + 0.05;
    } else if (event.key === 'PageUp') {
      next = levelRef.current + 0.15;
    } else if (event.key === 'End') {
      next = OVERHEAD_VIEW;
    } else if (event.key === 'ArrowDown') {
      next = levelRef.current - 0.05;
    } else if (event.key === 'PageDown') {
      next = levelRef.current - 0.15;
    } else if (event.key === 'Home') {
      next = FIRST_PERSON_VIEW;
    }
    if (next !== null) {
      event.preventDefault();
      const clamped = clampViewLevel(next);
      levelRef.current = clamped;
      onViewLevel(clamped);
    }
  };

  return (
    <div
      className="view-switcher"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`view-mode-button view-mode-overhead ${level >= 0.995 ? 'active' : ''}`}
        aria-pressed={level >= 0.995}
        aria-label="切换俯视视角"
        onClick={() => onViewLevel(OVERHEAD_VIEW)}
      >
        俯视
      </button>
      <div
        className="view-slider-track"
        role="slider"
        tabIndex={0}
        aria-label="视角推杆"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-valuetext={viewLevelLabel(level)}
        style={{ '--view-level': level } as CSSProperties}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <span className="view-slider-fill" aria-hidden="true" />
        <span className="view-slider-thumb" aria-hidden="true">
          <i />
        </span>
      </div>
      <button
        type="button"
        className={`view-mode-button view-mode-first ${level <= 0.005 ? 'active' : ''}`}
        aria-pressed={level <= 0.005}
        aria-label="切换第一人称视角"
        onClick={() => onViewLevel(FIRST_PERSON_VIEW)}
      >
        第一人称
      </button>
    </div>
  );
}
