/*
[INPUT]: 依赖连续 viewLevel / match / 观战状态 / 幽灵球拨轮与 pointer 事件处理器
[OUTPUT]: 渲染 3D 球桌、无限瞄准拨轮、可交互观战提示、全台回正与结束遮罩
[POS]: HUD 组件层，只组合并转发瞄准/观战事件；不持有对局或相机状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { AimDial } from './AimDial';
import type { MatchState } from '../match/types';
import type { PrecisionAimSolution } from '../aim/aim-solution';

interface TableStageProps {
  viewLevel: number;
  spectatorActive: boolean;
  match: MatchState;
  aimDialVisible: boolean;
  aimDialSolution: PrecisionAimSolution | null;
  containerRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onAimDialAdjust: (pixelDelta: number) => void;
  onCameraRecenter: () => void;
  onResetGame: () => void;
}

export function TableStage({
  viewLevel,
  spectatorActive,
  match,
  aimDialVisible,
  aimDialSolution,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onAimDialAdjust,
  onCameraRecenter,
  onResetGame,
}: TableStageProps) {
  return (
    <section className="table-stage">
      <div
        ref={containerRef}
        className={`viewport ${viewLevel >= 0.995 ? 'overhead' : 'orbit'} ${spectatorActive ? 'spectator' : ''} ${match.phase === 'placing' ? 'placing' : ''}`}
        data-view-level={viewLevel.toFixed(3)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <AimDial
          visible={aimDialVisible}
          solution={aimDialSolution}
          onAdjust={onAimDialAdjust}
        />

        {match.phase === 'opponent' && (
          <div className="turn-mask">
            <span className="thinking-dot" />
            <strong>顾燃计算中 · 左右滑动看全台</strong>
          </div>
        )}

        {spectatorActive && (
          <button
            type="button"
            className="camera-recenter"
            aria-label="回正并显示完整球台"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCameraRecenter();
            }}
          >
            全台
          </button>
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
