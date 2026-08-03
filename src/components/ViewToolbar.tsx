/*
[INPUT]: 当前归一化视角高度、观战锁定、手动相机状态、停靠方向与调整回调
[OUTPUT]: 对外提供可在顾燃回合整体禁用的无文字手动相机入口，以及可横竖转向且可停任意高度的视角推杆
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
  manualCameraActive: boolean;
  disabled: boolean;
  orientation: 'horizontal' | 'vertical';
  onViewLevel: (level: number) => void;
  onToggleManualCamera: () => void;
};

/** 必须与 controls.css 轨道/填充上下 12px 的可见行程一致。 */
const TRACK_INSET_PX = 12;

/** 推杆跟随手指并持续提交高度；松手停在原位，不再吸附端点。 */
export function ViewToolbar({
  viewLevel,
  manualCameraActive,
  disabled,
  orientation,
  onViewLevel,
  onToggleManualCamera,
}: Props) {
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const levelRef = useRef(clampViewLevel(viewLevel));
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const level = dragLevel ?? clampViewLevel(viewLevel);
  if (pointerIdRef.current === null) levelRef.current = level;

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const travel = Math.max(
      1,
      (orientation === 'vertical' ? rect.height : rect.width) - TRACK_INSET_PX * 2,
    );
    const next = clampViewLevel(
      orientation === 'vertical'
        ? (rect.bottom - TRACK_INSET_PX - event.clientY) / travel
        : (event.clientX - rect.left - TRACK_INSET_PX) / travel,
    );
    levelRef.current = next;
    setDragLevel(next);
    onViewLevel(next);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    pointerIdRef.current = event.pointerId;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    const start = pointerStartRef.current;
    if (start && !start.moved) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 4) return;
      start.moved = true;
    }
    updateFromPointer(event);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!disabled && !pointerStartRef.current?.moved) updateFromPointer(event);
    pointerIdRef.current = null;
    pointerStartRef.current = null;
    setDragLevel(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      next = levelRef.current + 0.05;
    } else if (event.key === 'PageUp') {
      next = levelRef.current + 0.15;
    } else if (event.key === 'End') {
      next = OVERHEAD_VIEW;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
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
      className={`view-switcher is-${orientation} ${disabled ? 'disabled' : ''}`}
      aria-disabled={disabled}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="view-mode-cluster">
        <button
          type="button"
          className={`view-mode-button view-mode-overhead ${level >= 0.995 ? 'active' : ''}`}
          aria-pressed={level >= 0.995}
          aria-label="切换俯视视角"
          disabled={disabled}
          onClick={() => onViewLevel(OVERHEAD_VIEW)}
        >
          <span className="view-icon view-icon-overhead" aria-hidden="true"><i /></span>
        </button>
        <button
          type="button"
          className={`view-mode-button manual-camera-button ${manualCameraActive ? 'active' : ''}`}
          aria-pressed={manualCameraActive}
          aria-label={manualCameraActive ? '退出手动视角' : '开启手动视角'}
          disabled={disabled}
          onClick={onToggleManualCamera}
        >
          <span className="manual-camera-icon" aria-hidden="true"><i /></span>
        </button>
      </div>
      <div
        className="view-slider-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="视角推杆"
        aria-orientation={orientation}
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
        disabled={disabled}
        onClick={() => onViewLevel(FIRST_PERSON_VIEW)}
      >
        <span className="view-icon view-icon-eye" aria-hidden="true"><i /></span>
      </button>
    </div>
  );
}
