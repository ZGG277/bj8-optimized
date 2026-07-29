/*
[INPUT]: 当前视角模式与切换回调
[OUTPUT]: 对外提供顶端俯视/底端第一人称的长行程竖向推杆，支持拖动、端点点击与键盘操作
[POS]: 控制组件层，只把连续指针行程归约为两种视角，不持有对局或相机状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

type ViewMode = 'first' | 'overhead';

type Props = {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
};

const modeForLevel = (level: number): ViewMode => level >= 0.5 ? 'overhead' : 'first';

/** 推杆跟随手指，越过中点切换视角，松手吸附到对应端点。 */
export function ViewToolbar({ viewMode, onViewMode }: Props) {
  const pointerIdRef = useRef<number | null>(null);
  const levelRef = useRef(viewMode === 'overhead' ? 1 : 0);
  const [dragLevel, setDragLevel] = useState<number | null>(null);
  const level = dragLevel ?? (viewMode === 'overhead' ? 1 : 0);

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = Math.min(1, Math.max(0, (rect.bottom - event.clientY) / rect.height));
    levelRef.current = next;
    setDragLevel(next);
    const nextMode = modeForLevel(next);
    if (nextMode !== viewMode) onViewMode(nextMode);
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
    onViewMode(modeForLevel(levelRef.current));
    pointerIdRef.current = null;
    setDragLevel(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'End') {
      event.preventDefault();
      onViewMode('overhead');
    } else if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'Home') {
      event.preventDefault();
      onViewMode('first');
    }
  };

  return (
    <div
      className="view-switcher"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`view-mode-button view-mode-overhead ${viewMode === 'overhead' ? 'active' : ''}`}
        aria-pressed={viewMode === 'overhead'}
        aria-label="切换俯视视角"
        onClick={() => onViewMode('overhead')}
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
        aria-valuetext={viewMode === 'overhead' ? '俯视' : '第一人称'}
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
        className={`view-mode-button view-mode-first ${viewMode === 'first' ? 'active' : ''}`}
        aria-pressed={viewMode === 'first'}
        aria-label="切换第一人称视角"
        onClick={() => onViewMode('first')}
      >
        第一人称
      </button>
    </div>
  );
}
