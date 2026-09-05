/*
[INPUT]: 禁用态、返回真实角度变化布尔值的瞄准微调回调与逐控件学习记录
[OUTPUT]: 对外提供球杆两侧的可选方向键微调大触控键；单击走固定精瞄步长，长按低速连续提交
[POS]: 控制组件层，只转发有符号的角度增量，不持有瞄准角状态
[PROTOCOL]: 变更时更新此头部，然后检查 components/CLAUDE.md
*/
import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { markControlLearned } from '../control-onboarding';

type AimControlsProps = {
  disabled: boolean;
  onAdjust: (angleDelta: number) => boolean;
};

/** 单击固定约 0.23°，与原触屏精瞄尺度一致，避免鼠标端一步过大。 */
export const AIM_BUTTON_FINE_STEP_RAD = 0.004;
/** 先让短按明确落成一步，再进入约 1.6°/s 的低速连续移动。 */
export const AIM_BUTTON_HOLD_DELAY_MS = 320;
export const AIM_BUTTON_HOLD_REPEAT_MS = 140;

export function AimControls({ disabled, onAdjust }: AimControlsProps) {
  const holdRef = useRef<{
    pointerId: number;
    delayTimer: number;
    repeatTimer: number | null;
    direction: -1 | 1;
    changed: boolean;
  } | null>(null);

  const stopHold = useCallback((pointerId?: number) => {
    const hold = holdRef.current;
    if (!hold || (pointerId !== undefined && hold.pointerId !== pointerId)) return;
    window.clearTimeout(hold.delayTimer);
    if (hold.repeatTimer !== null) window.clearInterval(hold.repeatTimer);
    holdRef.current = null;
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);
  useEffect(() => {
    if (disabled) stopHold();
  }, [disabled, stopHold]);

  const startHold = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    stopHold();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const delta = direction * AIM_BUTTON_FINE_STEP_RAD;
    const changed = onAdjust(delta);
    const pointerId = event.pointerId;
    const delayTimer = window.setTimeout(() => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== pointerId) return;
      hold.changed = onAdjust(delta) || hold.changed;
      hold.repeatTimer = window.setInterval(
        () => { hold.changed = onAdjust(delta) || hold.changed; },
        AIM_BUTTON_HOLD_REPEAT_MS,
      );
    }, AIM_BUTTON_HOLD_DELAY_MS);
    holdRef.current = { pointerId, delayTimer, repeatTimer: null, direction, changed };
  }, [disabled, onAdjust, stopHold]);

  const finishHold = (pointerId: number) => {
    const hold = holdRef.current;
    if (!disabled && hold?.pointerId === pointerId && hold.changed) {
      markControlLearned(hold.direction === -1 ? 'aim-left' : 'aim-right');
    }
    stopHold(pointerId);
  };

  const keyboardActivate = useCallback((direction: -1 | 1) => (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Pointer 激活已在 pointerdown 提交；detail=0 保留键盘/辅助技术 click。
    if (event.detail === 0 && !disabled) {
      if (onAdjust(direction * AIM_BUTTON_FINE_STEP_RAD)) {
        markControlLearned(direction === -1 ? 'aim-left' : 'aim-right');
      }
    }
  }, [disabled, onAdjust]);

  return (
    <div className="aim-controls" aria-label="球杆方向微调">
      <button
        type="button"
        aria-label="瞄准向左微调"
        data-control-tip="aim-left"
        data-control-content-hold="aim-button"
        onPointerDown={(event) => startHold(event, -1)}
        onPointerUp={(event) => finishHold(event.pointerId)}
        onPointerCancel={(event) => stopHold(event.pointerId)}
        onLostPointerCapture={(event) => stopHold(event.pointerId)}
        onClick={keyboardActivate(-1)}
        disabled={disabled}
      >
        <span aria-hidden="true">◀</span>
      </button>
      <i className="aim-controls-cue" aria-hidden="true" />
      <button
        type="button"
        aria-label="瞄准向右微调"
        data-control-tip="aim-right"
        data-control-content-hold="aim-button"
        onPointerDown={(event) => startHold(event, 1)}
        onPointerUp={(event) => finishHold(event.pointerId)}
        onPointerCancel={(event) => stopHold(event.pointerId)}
        onLostPointerCapture={(event) => stopHold(event.pointerId)}
        onClick={keyboardActivate(1)}
        disabled={disabled}
      >
        <span aria-hidden="true">▶</span>
      </button>
    </div>
  );
}
