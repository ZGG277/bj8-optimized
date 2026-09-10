/*
[INPUT]: 依赖 viewLevel / match / gameMode / 固定俯视观战、首局引导、训练总结、pointer 处理器与控件学习记录
[OUTPUT]: 渲染 3D 球桌、手动相机状态、首局语境观战提示及带训练总结/可跳过留言的结束遮罩
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { markControlLearned } from '../control-onboarding';
import type { MatchState } from '../match/types';
import type { GameMode, MatchTrainingSummary } from '../opponent/model';
import { PostMatchFeedback } from './PostMatchFeedback';

interface TableStageProps {
  viewLevel: number;
  spectatorActive: boolean;
  manualCameraActive: boolean;
  firstMatchGuideActive: boolean;
  match: MatchState;
  trainingSummary: MatchTrainingSummary | null;
  gameMode: GameMode;
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
  gameMode,
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
        data-match-finished={match.phase === 'finished' ? 'true' : undefined}
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
          <div
            className={`finish-mask ${match.winner === 'player' ? 'won' : ''}`}
            onPointerDown={event => event.stopPropagation()}
            onPointerMove={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onPointerCancel={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
            onContextMenu={event => event.stopPropagation()}
          >
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
            <div className="finish-content">
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
              <PostMatchFeedback
                outcome={match.winner === 'player' ? 'win' : 'loss'}
                mode={gameMode}
                onContinue={() => {
                  onResetGame();
                  markControlLearned('new-match');
                }}
              />
            </div>
          </div>
        )}
      </div>

    </section>
  );
}
