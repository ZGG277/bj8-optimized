/*
[INPUT]: 依赖连续 viewLevel / match、显式相机模式/阶段/交互、首局引导及 pointer 事件处理器
[OUTPUT]: 渲染 3D 球桌、相机语义状态、首局语境观战提示、全台常驻回正与结束遮罩
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import type { MatchState } from '../match/types';
import type { CameraMode, CameraPhase } from '../camera-state';

interface TableStageProps {
  viewLevel: number;
  spectatorActive: boolean;
  cameraMode: CameraMode;
  cameraPhase: CameraPhase['kind'];
  cameraInteraction: 'aim' | 'orbit';
  firstMatchGuideActive: boolean;
  match: MatchState;
  containerRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onCameraRecenter: () => void;
  onResetGame: () => void;
}

export function TableStage({
  viewLevel,
  spectatorActive,
  cameraMode,
  cameraPhase,
  cameraInteraction,
  firstMatchGuideActive,
  match,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onCameraRecenter,
  onResetGame,
}: TableStageProps) {
  return (
    <section className="table-stage">
      <div
        ref={containerRef}
        className={`viewport ${viewLevel >= 0.995 ? 'overhead' : 'orbit'} ${spectatorActive ? 'spectator' : ''} ${cameraInteraction === 'orbit' ? 'camera-manual' : ''} ${match.phase === 'placing' ? 'placing' : ''}`}
        data-view-level={viewLevel.toFixed(3)}
        data-camera-mode={cameraMode}
        data-camera-phase={cameraPhase}
        data-camera-interaction={cameraInteraction}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {spectatorActive && (
          <div className="turn-mask">
            <span className="thinking-dot" />
            <strong>
              {firstMatchGuideActive
                ? '顾燃正在击球 · 左右滑动可看全台'
                : match.phase === 'opponent'
                  ? '顾燃计算中 · 左右滑动看全台'
                  : '顾燃击球中 · 左右滑动看全台'}
            </strong>
          </div>
        )}

        {cameraMode !== 'shot' && (
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
            <span className="camera-recenter-icon" aria-hidden="true"><i /></span>
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
