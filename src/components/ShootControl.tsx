/*
[INPUT]: 禁用/蓄力态、横竖停靠方向、预览力度与 begin/update/release/cancel/tap 回调
[OUTPUT]: 对外提供无文字的球杆回缩/能量填充出杆控件，移出有效走廊松手取消，保留 meter 与键盘语义
[POS]: 控制组件层,只负责手势出口与语义;力度事实由 input 层计算,物理击球由 Game 提交
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/

import { useRef } from 'react';

export const CHARGE_ESCAPE_PADDING_PX = 24;

type ChargeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  rect: { left: number; right: number; top: number; bottom: number };
  cancelled: boolean;
};

/**
 * 出杆方向上不设上限（允许拉到屏幕边缘满力）；横向离开或向反方向退出
 * 带 24px 手指容错的走廊则视为明确取消意图。
 */
export function isChargePointerInCommitCorridor(
  gesture: Pick<ChargeGesture, 'startX' | 'startY' | 'rect'>,
  orientation: 'horizontal' | 'vertical',
  clientX: number,
  clientY: number,
): boolean {
  const { rect, startX, startY } = gesture;
  if (orientation === 'vertical') {
    return clientX >= rect.left - CHARGE_ESCAPE_PADDING_PX
      && clientX <= rect.right + CHARGE_ESCAPE_PADDING_PX
      && clientY >= startY - CHARGE_ESCAPE_PADDING_PX;
  }
  return clientY >= rect.top - CHARGE_ESCAPE_PADDING_PX
    && clientY <= rect.bottom + CHARGE_ESCAPE_PADDING_PX
    && clientX >= startX - CHARGE_ESCAPE_PADDING_PX;
}

type Props = {
  disabled: boolean;
  charging: boolean;
  power: number;
  breaking: boolean;
  orientation: 'horizontal' | 'vertical';
  onBegin: (clientY: number, availableTravel: number) => void;
  onUpdate: (clientY: number) => void;
  onRelease: () => void;
  onCancel: () => void;
  /** 键盘轻杆:Enter 直接以保底力度出杆;空格按住蓄力由全局键盘通道处理 */
  onTap: () => void;
};

export function ShootControl({
  disabled,
  charging,
  power,
  breaking,
  orientation,
  onBegin,
  onUpdate,
  onRelease,
  onCancel,
  onTap,
}: Props) {
  const gestureRef = useRef<ChargeGesture | null>(null);
  const rounded = Math.round(power);
  const coordinate = (event: React.PointerEvent) =>
    orientation === 'vertical' ? event.clientY : event.clientX;
  return (
    <div className={`shoot-zone is-${orientation}`} onPointerDown={(e) => e.stopPropagation()}>
      <div
        className={`shoot-pad is-${orientation} ${charging ? 'charging' : ''} ${disabled ? 'disabled' : ''}`}
        role="button"
        aria-label={breaking ? '开球:下拉蓄力松开出杆,回车轻杆' : '出杆:下拉蓄力松开出杆,回车轻杆'}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const rect = e.currentTarget.getBoundingClientRect();
          gestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            rect: {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            },
            cancelled: false,
          };
          const start = coordinate(e);
          const remaining = orientation === 'vertical'
            ? rect.bottom - e.clientY
            : rect.right - e.clientX;
          onBegin(start, Math.min(220, Math.max(72, remaining)));
        }}
        onPointerMove={(e) => {
          e.preventDefault();
          const gesture = gestureRef.current;
          if (disabled || !gesture || gesture.pointerId !== e.pointerId || gesture.cancelled) return;
          if (!isChargePointerInCommitCorridor(gesture, orientation, e.clientX, e.clientY)) {
            gesture.cancelled = true;
            onCancel();
            return;
          }
          onUpdate(coordinate(e));
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          const gesture = gestureRef.current;
          gestureRef.current = null;
          if (!gesture || gesture.pointerId !== e.pointerId) return;
          const escaped = gesture.cancelled || !isChargePointerInCommitCorridor(
            gesture,
            orientation,
            e.clientX,
            e.clientY,
          );
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          if (disabled || escaped) {
            if (!gesture.cancelled) onCancel();
            return;
          }
          onRelease();
        }}
        onPointerCancel={(e) => {
          const gesture = gestureRef.current;
          if (gesture?.pointerId !== e.pointerId) return;
          gestureRef.current = null;
          onCancel();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            onTap();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span
          className={`shoot-power-fill ${power > 85 ? 'hot' : ''}`}
          style={orientation === 'vertical'
            ? { height: `${power}%` }
            : { width: `${power}%` }}
          role="meter"
          aria-label="出杆力度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
        />
        <span
          className="shoot-cue-visual"
          style={{ '--power': rounded } as React.CSSProperties}
          aria-hidden="true"
        >
          <i />
          <b />
        </span>
        <span className="shoot-energy-ticks" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
        </span>
      </div>
    </div>
  );
}
