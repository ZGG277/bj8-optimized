/*
[INPUT]: 可见状态、横/竖停靠方向、最近合法袋口解、Pointer 压力与相对像素拨动回调
[OUTPUT]: 对外提供纯视觉无边界拨轮；以颜色、刻度密度、紧度环和传动阻尼表达瞄准精度
[POS]: 控制组件层；采集相对位移/可靠压力并展示档位，不持有世界角或判断球路
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import {
  aimDialMode,
  aimDialPressureProfile,
  type AimDialPressureProfile,
} from '../input/aim-dial';

interface AimDialProps {
  visible: boolean;
  solution: PrecisionAimSolution | null;
  orientation: 'horizontal' | 'vertical';
  onAdjust: (pixelDelta: number, pressureGain?: number) => void;
}

export function AimDial({ visible, solution, orientation, onAdjust }: AimDialProps) {
  const lastCoordRef = useRef<number | null>(null);
  const pressureDetectedRef = useRef(false);
  const [tickOffset, setTickOffset] = useState(0);
  const [active, setActive] = useState(false);
  const [pressureFeedback, setPressureFeedback] = useState<AimDialPressureProfile>(
    () => aimDialPressureProfile('touch', 0.5),
  );
  if (!visible) return null;

  const mode = aimDialMode(solution);
  const nearby = mode !== 'coarse' && solution;
  const label = mode === 'fine'
    ? `精瞄 ${solution?.target ?? ''}号 → ${solution?.pocketName ?? ''}`
    : nearby
      ? `接近 ${solution.target}号 → ${solution.pocketName}`
      : '方向拨轮';

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    lastCoordRef.current = null;
    pressureDetectedRef.current = false;
    setActive(false);
    setPressureFeedback(aimDialPressureProfile('touch', 0.5));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`aim-dial ${mode} is-${orientation} ${active ? 'active' : ''}`}
      data-pressure-active={pressureFeedback.supported ? 'true' : 'false'}
      style={{
        '--aim-dial-tightness': pressureFeedback.visualTightness,
      } as CSSProperties}
      role="slider"
      tabIndex={0}
      aria-label="拨轮调整击球方向"
      aria-orientation={orientation}
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        lastCoordRef.current =
          orientation === 'vertical' ? event.clientY : event.clientX;
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
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
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
        onAdjust(delta, pressure.gain);
        setTickOffset((current) => (current + delta * pressure.gain) % 24);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const backward = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
        const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        if (event.key !== backward && event.key !== forward) return;
        event.preventDefault();
        const delta = event.key === backward ? -6 : 6;
        onAdjust(delta);
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
