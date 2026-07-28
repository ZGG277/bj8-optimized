/*
[INPUT]: 当前击球点、禁用态与变更回调;指针事件经 clampSpin 纯函数换算
[OUTPUT]: 对外提供 SpinControl 击球点盘,支持拖拽、键盘方向调整与 0 键复位,带 aria 语义
[POS]: 控制组件层,只做事件到 CueSpin 的映射,几何事实计算委托 input/shot-input
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import React, { useEffect, useState } from 'react';
import type { CueSpin } from '../physics';
import { clampSpin } from '../input/shot-input';

type Props = {
  spin: CueSpin;
  disabled: boolean;
  onSpinChange: (spin: CueSpin) => void;
};

const KEY_STEP = 0.15;

function clampUnit(v: number) {
  return Math.min(1, Math.max(-1, v));
}

function spinLabel(spin: CueSpin): string {
  return spin.x > 0.25 ? '高杆' : spin.x < -0.25 ? '低杆' : spin.y > 0.25 ? '右塞' : spin.y < -0.25 ? '左塞' : '中杆';
}

/** 击球点盘:拖拽定位击球点;键盘 ↑↓←→ 微调,0/Backspace 回中杆 */
export function SpinControl({ spin, disabled, onSpinChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (disabled || (spin.x === 0 && spin.y === 0)) setExpanded(false);
  }, [disabled, spin.x, spin.y]);

  const applyPointer = (e: React.PointerEvent) => {
    if (disabled) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onSpinChange(clampSpin(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      { width: rect.width, height: rect.height },
    ));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const next = { ...spin };
    if (e.key === 'ArrowUp') next.x = clampUnit(next.x + KEY_STEP);
    else if (e.key === 'ArrowDown') next.x = clampUnit(next.x - KEY_STEP);
    else if (e.key === 'ArrowRight') next.y = clampUnit(next.y + KEY_STEP);
    else if (e.key === 'ArrowLeft') next.y = clampUnit(next.y - KEY_STEP);
    else if (e.key === '0' || e.key === 'Backspace') { next.x = 0; next.y = 0; }
    else return;
    e.preventDefault();
    onSpinChange(next);
  };

  const pad = (extraClass = '') => (
    <div
      className={`spin-pad ${extraClass}`}
      role="slider"
      aria-label="击球点(杆法)"
      aria-valuetext={spinLabel(spin)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (disabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        applyPointer(e);
      }}
      onPointerMove={(e) => {
        if (!disabled && e.buttons) applyPointer(e);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="spin-ball">
        <span className="spin-cross-h" />
        <span className="spin-cross-v" />
        <span
          className="spin-dot"
          style={{ left: `${50 + spin.y * 38}%`, top: `${50 - spin.x * 38}%` }}
        />
      </div>
      <small>{spinLabel(spin)}</small>
    </div>
  );

  return (
    <div className={`spin-control ${expanded ? 'expanded' : ''}`}>
      {pad('desktop-spin-pad')}
      <button
        type="button"
        className="spin-preview"
        aria-label={`调节母球击球点，当前${spinLabel(spin)}`}
        aria-expanded={expanded}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setExpanded(value => !value)}
      >
        <span className="spin-preview-ball">
          <i style={{ left: `${50 + spin.y * 28}%`, top: `${50 - spin.x * 28}%` }} />
        </span>
        <small>击球点</small>
      </button>
      {expanded && (
        <div className="spin-popover" role="dialog" aria-label="母球击球点调节">
          <div className="spin-popover-head">
            <strong>{spinLabel(spin)}</strong>
            <button type="button" aria-label="收起击球点调节" onClick={() => setExpanded(false)}>✕</button>
          </div>
          {pad('mobile-spin-pad')}
        </div>
      )}
    </div>
  );
}
