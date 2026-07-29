/*
[INPUT]: 可见状态、最近合法袋口解与相对像素拨动回调
[OUTPUT]: 对外提供球桌内无边界横向密码轮；固定中心线、移动刻度、键盘与 Pointer 拨动
[POS]: 控制组件层；只采集相对位移与展示档位，不持有世界角或判断球路
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useState } from 'react';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import { aimDialMode } from '../input/aim-dial';

interface AimDialProps {
  visible: boolean;
  solution: PrecisionAimSolution | null;
  onAdjust: (pixelDelta: number) => void;
}

export function AimDial({ visible, solution, onAdjust }: AimDialProps) {
  const lastXRef = useRef<number | null>(null);
  const [tickOffset, setTickOffset] = useState(0);
  const [active, setActive] = useState(false);
  if (!visible) return null;

  const mode = aimDialMode(solution);
  const nearby = mode !== 'coarse' && solution;
  const label = mode === 'fine'
    ? `精瞄 ${solution?.target ?? ''}号 → ${solution?.pocketName ?? ''}`
    : nearby
      ? `接近 ${solution.target}号 → ${solution.pocketName}`
      : '方向拨轮';

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    lastXRef.current = null;
    setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={`aim-dial ${mode} ${active ? 'active' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="横向拨轮调整击球方向"
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        lastXRef.current = event.clientX;
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const lastX = lastXRef.current ?? event.clientX;
        const delta = event.clientX - lastX;
        lastXRef.current = event.clientX;
        if (delta === 0) return;
        onAdjust(delta);
        setTickOffset((current) => (current + delta) % 24);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onAdjust(event.key === 'ArrowLeft' ? -6 : 6);
        setTickOffset((current) => (current + (event.key === 'ArrowLeft' ? -6 : 6)) % 24);
      }}
    >
      <div className="aim-dial-label" aria-hidden="true">
        <strong>{mode === 'fine' ? '精瞄' : mode === 'approach' ? '接近' : '方向'}</strong>
        <small>
          {nearby ? `${solution.target}号 → ${solution.pocketName}` : '左右拨动'}
        </small>
      </div>
      <div className="aim-dial-window" aria-hidden="true">
        <i className="aim-dial-ticks" style={{ backgroundPositionX: `${tickOffset}px` }} />
        <b />
      </div>
    </div>
  );
}
