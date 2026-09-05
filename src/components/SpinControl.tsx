/*
[INPUT]: 当前击球点、禁用态、变更回调与逐控件学习记录;指针事件经 clampSpin 纯函数换算
[OUTPUT]: 对外提供 SpinControl 击球点盘,支持拖拽、键盘方向调整与 0 键复位,带 aria 语义
[POS]: 控制组件层,只做事件到 CueSpin 的映射,几何事实计算委托 input/shot-input
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import React, { useEffect, useRef, useState } from 'react';
import type { CueSpin } from '../physics';
import { clampSpin } from '../input/shot-input';
import { markControlLearned } from '../control-onboarding';

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
  const pointerStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
    changed: boolean;
  } | null>(null);

  useEffect(() => {
    if (disabled || (spin.x === 0 && spin.y === 0)) setExpanded(false);
  }, [disabled, spin.x, spin.y]);

  const changeSpin = (next: CueSpin) => {
    if (disabled || (Math.abs(next.x - spin.x) < 0.00001 && Math.abs(next.y - spin.y) < 0.00001)) return;
    onSpinChange(next);
    if (pointerStartRef.current) pointerStartRef.current.changed = true;
    else markControlLearned('spin');
  };

  const applyPointer = (e: React.PointerEvent) => {
    if (disabled) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    changeSpin(clampSpin(
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
    changeSpin(next);
  };

  const pad = (extraClass = '') => (
    <div
      className={`spin-pad ${extraClass}`}
      role="slider"
      aria-label="击球点(杆法)"
      data-control-tip="spin"
      aria-valuetext={spinLabel(spin)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (disabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pointerStartRef.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          moved: false,
          changed: false,
        };
      }}
      onPointerMove={(e) => {
        const start = pointerStartRef.current;
        if (disabled || !start || start.pointerId !== e.pointerId || !e.buttons) return;
        if (!start.moved) {
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 4) return;
          start.moved = true;
        }
        applyPointer(e);
      }}
      onPointerUp={(e) => {
        const start = pointerStartRef.current;
        if (!start || start.pointerId !== e.pointerId) return;
        if (!start.moved) applyPointer(e);
        if (!disabled && start.changed) markControlLearned('spin');
        pointerStartRef.current = null;
      }}
      onPointerCancel={(e) => {
        if (pointerStartRef.current?.pointerId === e.pointerId) {
          pointerStartRef.current = null;
        }
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
    </div>
  );

  return (
    <div className={`spin-control ${expanded ? 'expanded' : ''}`}>
      {pad('desktop-spin-pad')}
      <button
        type="button"
        className="spin-preview"
        aria-label={`调节母球击球点，当前${spinLabel(spin)}`}
        data-control-tip="spin-open"
        aria-expanded={expanded}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          setExpanded(value => !value);
          markControlLearned('spin-open');
        }}
      >
        <span className="spin-preview-ball">
          <i style={{ left: `${50 + spin.y * 28}%`, top: `${50 - spin.x * 28}%` }} />
        </span>
      </button>
      {expanded && (
        <div className="spin-popover" role="dialog" aria-label="母球击球点调节">
          <div className="spin-popover-head">
            <span className="spin-popover-ball" aria-hidden="true"><i /></span>
            <button type="button" data-control-tip="spin-close" aria-label="收起击球点调节" onClick={() => {
              setExpanded(false);
              markControlLearned('spin-close');
            }}>✕</button>
          </div>
          {pad('mobile-spin-pad')}
        </div>
      )}
    </div>
  );
}
