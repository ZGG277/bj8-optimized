/*
[INPUT]: 依赖连续 viewLevel / match / 固定俯视观战、首局引导、整局训练总结与 pointer 事件处理器
[OUTPUT]: 渲染 3D 球桌、手动相机状态、首局语境观战提示及带下一局目标的结束遮罩
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import type { MatchState } from '../match/types';
import type { MatchTrainingSummary } from '../opponent/model';

interface TableStageProps {
  viewLevel: number;
  spectatorActive: boolean;
  manualCameraActive: boolean;
  firstMatchGuideActive: boolean;
  match: MatchState;
  trainingSummary: MatchTrainingSummary | null;
  containerRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onResetGame: () => void;
}

export function TableStage({
  viewLevel,
  spectatorActive,
  manualCameraActive,
  firstMatchGuideActive,
  match,
  trainingSummary,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onResetGame,
}: TableStageProps) {
  return (
    <section className="table-stage">
      <div
        ref={containerRef}
        className={`viewport ${viewLevel >= 0.995 ? 'overhead' : 'orbit'} ${spectatorActive ? 'spectator' : ''} ${manualCameraActive ? 'camera-manual' : ''} ${match.phase === 'placing' ? 'placing' : ''}`}
        data-view-level={viewLevel.toFixed(3)}
        data-camera-mode={spectatorActive ? 'locked' : manualCameraActive ? 'manual' : 'aim'}
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
                ? '顾燃正在击球 · 固定俯视全台'
                : match.phase === 'opponent'
                  ? '顾燃计算中 · 固定俯视全台'
                  : '顾燃击球中 · 固定俯视全台'}
            </strong>
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
            {trainingSummary && (
              <section className="training-summary" aria-label="顾燃训练总结">
                <small>{trainingSummary.headline}</small>
                <strong>本局重点 · {trainingSummary.focus}</strong>
                <p>{trainingSummary.detail}</p>
                <em>{trainingSummary.nextGoal}</em>
              </section>
            )}
            <button onClick={onResetGame}>再来一局</button>
          </div>
        )}
      </div>

    </section>
  );
}
