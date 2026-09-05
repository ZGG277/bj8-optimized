/*
[INPUT]: 可见状态、横/竖停靠方向、用户精瞄档、Pointer 压力、返回真实变化事实的拨动/切档回调与逐控件学习记录
[OUTPUT]: 对外提供轻点切换粗/精档的纯视觉无边界拨轮，以刻度、中心标记和紧度环表达当前手感
[POS]: 控制组件层；采集显式切档、相对位移与可靠压力，不持有世界角且不探测目标球或袋口
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { markControlLearned } from '../control-onboarding';
import {
  aimDialMode,
  aimDialPressureProfile,
  type AimDialPressureProfile,
} from '../input/aim-dial';

interface AimDialProps {
  visible: boolean;
  precisionActive: boolean;
  orientation: 'horizontal' | 'vertical';
  onAdjust: (pixelDelta: number, pressureGain?: number) => boolean;
  onTogglePrecision: () => boolean;
}

export function AimDial({
  visible,
  precisionActive,
  orientation,
  onAdjust,
  onTogglePrecision,
}: AimDialProps) {
  const lastCoordRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ pointerId: number; x: number; y: number; changed: boolean } | null>(null);
  const pressureDetectedRef = useRef(false);
  const [tickOffset, setTickOffset] = useState(0);
  const [active, setActive] = useState(false);
  const [pressureFeedback, setPressureFeedback] = useState<AimDialPressureProfile>(
    () => aimDialPressureProfile('touch', 0.5),
  );
  if (!visible) return null;

  const mode = aimDialMode(precisionActive);
  const label = precisionActive
    ? '精瞄已启用，轻点退出，拨动微调方向'
    : '粗瞄，轻点启用精瞄，拨动调整方向';

  const finish = (
    event: React.PointerEvent<HTMLDivElement>,
    allowToggle: boolean,
  ) => {
    const start = gestureStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    lastCoordRef.current = null;
    gestureStartRef.current = null;
    pressureDetectedRef.current = false;
    setActive(false);
    setPressureFeedback(aimDialPressureProfile('touch', 0.5));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!allowToggle) return;
    const toggled = travel < 6 && onTogglePrecision();
    if (toggled || start.changed) markControlLearned('aim-dial');
  };

  return (
    <div
      className={`aim-dial ${mode} is-${orientation} ${active ? 'active' : ''}`}
      data-pressure-active={pressureFeedback.supported ? 'true' : 'false'}
      data-precision-active={precisionActive ? 'true' : 'false'}
      style={{
        '--aim-dial-tightness': pressureFeedback.visualTightness,
      } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="方向拨轮，轻点切换精瞄"
      data-control-tip="aim-dial"
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={precisionActive ? 1 : 0}
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        lastCoordRef.current =
          orientation === 'vertical' ? event.clientY : event.clientX;
        gestureStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, changed: false };
        pressureDetectedRef.current = false;
        const pressure = aimDialPressureProfile(
          event.pointerType,
          event.pressure,
        );
        pressureDetectedRef.current = pressure.supported;
        setPressureFeedback(pressure);
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const gesture = gestureStartRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const coordinate = orientation === 'vertical' ? event.clientY : event.clientX;
        const last = lastCoordRef.current ?? coordinate;
        const delta = coordinate - last;
        lastCoordRef.current = coordinate;
        if (delta === 0) return;
        const pressure = aimDialPressureProfile(
          event.pointerType,
          event.pressure,
          pressureDetectedRef.current,
        );
        pressureDetectedRef.current ||= pressure.supported;
        setPressureFeedback(pressure);
        gesture.changed = onAdjust(delta, pressure.gain) || gesture.changed;
        setTickOffset((current) => (current + delta * pressure.gain) % 24);
      }}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const backward = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
        const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (onTogglePrecision()) markControlLearned('aim-dial');
          return;
        }
        if (event.key !== backward && event.key !== forward) return;
        event.preventDefault();
        const delta = event.key === backward ? -6 : 6;
        if (onAdjust(delta)) markControlLearned('aim-dial');
        setTickOffset((current) => (current + delta) % 24);
      }}
    >
      <div className="aim-dial-window" aria-hidden="true">
        <span className="aim-dial-pressure-ring" />
        <i
          className="aim-dial-ticks"
          style={orientation === 'vertical'
            ? { backgroundPositionY: `${tickOffset}px` }
            : { backgroundPositionX: `${tickOffset}px` }}
        />
        <b />
      </div>
    </div>
  );
}
