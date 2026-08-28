/*
[INPUT]: 当前归一化视角高度、显式相机模式、环绕状态、停靠方向与调整回调
[OUTPUT]: 对外提供一键全台/下杆、二级自由环绕，以及可横竖转向且可停任意高度的视角推杆
[POS]: 控制组件层，只转发模式与 0..1 连续构图事实，不持有对局或相机状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampViewLevel,
  viewLevelLabel,
} from '../camera-view';
import type { CameraMode } from '../camera-state';

type Props = {
  viewLevel: number;
  cameraMode: CameraMode;
  orbitActive: boolean;
  orientation: 'horizontal' | 'vertical';
  onViewLevel: (level: number) => void;
  onEnterTactical: () => void;
  onEnterShot: () => void;
  onToggleOrbit: () => void;
};

/** 必须与 controls.css 轨道/填充上下 12px 的可见行程一致。 */
const TRACK_INSET_PX = 12;

/** 推杆跟随手指并持续提交高度；松手停在原位，不再吸附端点。 */
export function ViewToolbar({
  viewLevel,
  cameraMode,
  orbitActive,
  orientation,
  onViewLevel,
  onEnterTactical,
  onEnterShot,
  onToggleOrbit,
}: Props) {
  const spectatorOrbit = cameraMode === 'spectator';
  const orbitEnabled = orbitActive || spectatorOrbit;
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
    pointerIdRef.current = event.pointerId;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
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
    if (!pointerStartRef.current?.moved) updateFromPointer(event);
    pointerIdRef.current = null;
    pointerStartRef.current = null;
    setDragLevel(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      next = levelRef.current + 0.05;
    } else if (event.key === 'PageUp') {
      next = levelRef.current + 0.15;
    } else if (event.key === 'End') {
      event.preventDefault();
      onEnterTactical();
      return;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      next = levelRef.current - 0.05;
    } else if (event.key === 'PageDown') {
      next = levelRef.current - 0.15;
    } else if (event.key === 'Home') {
      event.preventDefault();
      onEnterShot();
      return;
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
      className={`view-switcher is-${orientation}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="view-mode-cluster">
        <button
          type="button"
          className={`view-mode-button view-mode-overhead ${cameraMode !== 'shot' ? 'active' : ''}`}
          aria-pressed={cameraMode !== 'shot'}
          aria-label="进入全台观察"
          onClick={onEnterTactical}
        >
          <span className="view-icon view-icon-overhead" aria-hidden="true"><i /></span>
        </button>
        <button
          type="button"
          className={`view-mode-button manual-camera-button ${orbitEnabled ? 'active' : ''}`}
          aria-pressed={orbitEnabled}
          aria-label={spectatorOrbit
            ? '观战自由环绕已开启'
            : orbitActive ? '关闭自由环绕' : '开启自由环绕'}
          disabled={spectatorOrbit}
          onClick={onToggleOrbit}
        >
          <span className="manual-camera-icon" aria-hidden="true"><i /></span>
        </button>
      </div>
      <div
        className="view-slider-track"
        role="slider"
        tabIndex={0}
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
        className={`view-mode-button view-mode-first ${cameraMode === 'shot' ? 'active' : ''}`}
        aria-pressed={cameraMode === 'shot'}
        aria-label="进入击球视角"
        onClick={onEnterShot}
      >
        <span className="view-icon view-icon-eye" aria-hidden="true"><i /></span>
      </button>
    </div>
  );
}
