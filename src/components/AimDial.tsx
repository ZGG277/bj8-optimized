/*
[INPUT]: 可见状态、辅助开关、最近合法袋口解与带用户选定档位的相对像素拨动回调
[OUTPUT]: 对外提供球桌内无边界横向密码轮；普通区域固定方向档，按住中央白线进入固定精调离合
[POS]: 控制组件层；袋口接近度只在辅助开启时提示，不得改变传动比或替用户选择档位
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useRef, useState } from 'react';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import {
  AIM_DIAL_APPROACH_RATIO,
  aimDialRatio,
  type AimDialGear,
} from '../input/aim-dial';

interface AimDialProps {
  visible: boolean;
  assistanceEnabled: boolean;
  solution: PrecisionAimSolution | null;
  onAdjust: (pixelDelta: number, gear: AimDialGear) => void;
}

export function AimDial({
  visible,
  assistanceEnabled,
  solution,
  onAdjust,
}: AimDialProps) {
  const lastXRef = useRef<number | null>(null);
  const gestureGearRef = useRef<AimDialGear>('normal');
  const [tickOffset, setTickOffset] = useState(0);
  const [active, setActive] = useState(false);
  const [fineActive, setFineActive] = useState(false);

  useEffect(() => {
    if (visible) return;
    lastXRef.current = null;
    gestureGearRef.current = 'normal';
    setActive(false);
    setFineActive(false);
  }, [visible]);

  if (!visible) return null;

  const fineReady = assistanceEnabled
    && solution !== null
    && (aimDialRatio(solution) ?? Infinity) <= AIM_DIAL_APPROACH_RATIO;
  const label = fineActive
    ? '精调离合已按住'
    : fineReady
      ? `接近 ${solution.target}号 → ${solution.pocketName}，可按中线精调`
      : '方向拨轮，按中线精调';

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    lastXRef.current = null;
    gestureGearRef.current = 'normal';
    setActive(false);
    setFineActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`aim-dial ${fineReady ? 'fine-ready' : ''} ${fineActive ? 'fine-active' : ''} ${active ? 'active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="横向拨轮调整击球方向"
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        const target = event.target as HTMLElement;
        const gear: AimDialGear = target.closest('[data-aim-fine-clutch]') ? 'fine' : 'normal';
        lastXRef.current = event.clientX;
        gestureGearRef.current = gear;
        setActive(true);
        setFineActive(gear === 'fine');
        if (gear === 'fine') navigator.vibrate?.(10);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const lastX = lastXRef.current ?? event.clientX;
        const delta = event.clientX - lastX;
        lastXRef.current = event.clientX;
        if (delta === 0) return;
        onAdjust(delta, gestureGearRef.current);
        setTickOffset((current) => (current + delta) % 24);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onAdjust(event.key === 'ArrowLeft' ? -6 : 6, event.shiftKey ? 'fine' : 'normal');
        setTickOffset((current) => (current + (event.key === 'ArrowLeft' ? -6 : 6)) % 24);
      }}
    >
      <div className="aim-dial-label" aria-hidden="true">
        <strong>{fineActive ? '精调' : fineReady ? '可精调' : '方向'}</strong>
        <small>
          {fineReady ? `${solution.target}号 → ${solution.pocketName}` : '按中线精调'}
        </small>
      </div>
      <div className="aim-dial-window" aria-hidden="true">
        <i className="aim-dial-ticks" style={{ backgroundPositionX: `${tickOffset}px` }} />
        <b className="aim-dial-fine-clutch" data-aim-fine-clutch>
          <span>精</span>
        </b>
      </div>
    </div>
  );
}
