/*
[INPUT]: 依赖 viewMode / match / worldView / precisionAim 状态与 pointer 事件处理器
[OUTPUT]: 渲染球桌区域（3D 视口、视角工具条、桌内方向微调、精瞄袋口窗口与回合/结束遮罩）
[POS]: HUD 组件层，组合 ViewToolbar 与 3D 视口；不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { ViewToolbar } from './ViewToolbar';
import { TableAimNudges } from './TableAimNudges';
import type { BilliardsWorld } from '../physics';
import type { MatchState } from '../match/types';
import type { PrecisionAimSolution } from '../aim/aim-solution';

type ViewMode = 'first' | 'overhead';

interface TableStageProps {
  viewMode: ViewMode;
  match: MatchState;
  worldView: BilliardsWorld;
  canAim: boolean;
  precisionAim: (PrecisionAimSolution & { offset: number }) | null;
  containerRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onViewMode: (mode: ViewMode) => void;
  onRotate: (dir: number) => void;
  onElevate: (dir: number) => void;
  onAimAdjust: (delta: number) => void;
  onResetGame: () => void;
}

export function TableStage({
  viewMode,
  match,
  worldView,
  canAim,
  precisionAim,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  onViewMode,
  onRotate,
  onElevate,
  onAimAdjust,
  onResetGame,
}: TableStageProps) {
  return (
    <section className="table-stage">
      <div
        ref={containerRef}
        className={`viewport ${viewMode} ${match.phase === 'placing' ? 'placing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        <ViewToolbar
          viewMode={viewMode}
          onViewMode={onViewMode}
          onRotate={onRotate}
          onElevate={onElevate}
        />
        <TableAimNudges disabled={!canAim} onAdjust={onAimAdjust} />

        <div className="room-label">
          <span>PHYSICS WORLD</span>
          <small>{worldView.balls.filter(b => b.active).length} BALLS</small>
        </div>

        <div className="shot-target">
          <small>{match.breaking ? '第一杆' : '合法目标'}</small>
          <strong>{match.playerGroup === 'solid' ? '全色球' : match.playerGroup === 'stripe' ? '花色球' : '开放球局'}</strong>
        </div>

        <div className="view-hint">
          {worldView.moving ? '球在运动中...' : viewMode === 'overhead' ? '观察球形' : '拖拽调整方向'}
        </div>

        {precisionAim && (
          <div className="precision-aim" role="status" aria-live="polite">
            <div>
              <strong>精瞄 · {precisionAim.target} 号 → {precisionAim.pocketName}</strong>
              <span>横拖选择袋口落点，竖向移出可回到 360° 粗瞄</span>
            </div>
            <div className="precision-aim-track" aria-hidden="true">
              <i style={{ left: `${(precisionAim.offset + 1) * 50}%` }} />
            </div>
          </div>
        )}

        {match.phase === 'opponent' && (
          <div className="turn-mask">
            <span className="thinking-dot" />
            <strong>顾燃计算中...</strong>
          </div>
        )}

        {match.phase === 'finished' && (
          <div className={`finish-mask ${match.winner === 'player' ? 'won' : ''}`}>
            {match.winner === 'player' && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 28 }, (_, i) => (
                  <i key={i} style={{
                    left: `${(i * 37 + 13) % 100}%`,
                    background: `hsl(${(i * 47) % 360} 85% 62%)`,
                    width: 6 + (i % 3) * 3,
                    height: (6 + (i % 3) * 3) * 1.4,
                    animationDelay: `${(i % 9) * 0.14}s`,
                  }} />
                ))}
              </div>
            )}
            <span>GAME OVER</span>
            <h1>{match.winner === 'player' ? '你赢了！' : match.winner === 'opponent' ? '顾燃赢了' : '本局结束'}</h1>
            <button onClick={onResetGame}>再来一局</button>
          </div>
        )}
      </div>

    </section>
  );
}
