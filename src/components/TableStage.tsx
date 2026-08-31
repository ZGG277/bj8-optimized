/*
[INPUT]: 依赖连续 viewLevel / match / 瞄准辅助开关 / 拨轮选择与 pointer 事件处理器
[OUTPUT]: 渲染精简球桌区域（3D 视口、默认球杆左右微调或用户开启的无限拨轮、回合/结束遮罩）
[POS]: HUD 组件层，组合瞄准输入外壳与 3D 视口；只透传辅助意图，不持有对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { AimDial } from './AimDial';
import { AimControls } from './AimControls';
import type { MatchState } from '../match/types';
import type { PrecisionAimSolution } from '../aim/aim-solution';
import type { AimDialGear } from '../input/aim-dial';

interface TableStageProps {
  viewLevel: number;
  match: MatchState;
  canAim: boolean;
  aimDialEnabled: boolean;
  aimDialVisible: boolean;
  aimAssistanceEnabled: boolean;
  aimDialSolution: PrecisionAimSolution | null;
  containerRef: React.Ref<HTMLDivElement>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onAimButtonAdjust: (angleDelta: number) => void;
  onAimDialAdjust: (pixelDelta: number, gear: AimDialGear) => void;
  onResetGame: () => void;
}

export function TableStage({
  viewLevel,
  match,
  canAim,
  aimDialEnabled,
  aimDialVisible,
  aimAssistanceEnabled,
  aimDialSolution,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onAimButtonAdjust,
  onAimDialAdjust,
  onResetGame,
}: TableStageProps) {
  return (
    <section className="table-stage">
      <div
        ref={containerRef}
        className={`viewport ${viewLevel >= 0.995 ? 'overhead' : 'orbit'} ${match.phase === 'placing' ? 'placing' : ''}`}
        data-view-level={viewLevel.toFixed(3)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {aimDialEnabled ? (
          <AimDial
            visible={aimDialVisible}
            assistanceEnabled={aimAssistanceEnabled}
            solution={aimDialSolution}
            onAdjust={onAimDialAdjust}
          />
        ) : canAim ? (
          <AimControls disabled={false} onAdjust={onAimButtonAdjust} />
        ) : null}

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
