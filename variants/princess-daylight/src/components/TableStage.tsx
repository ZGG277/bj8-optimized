/*
[INPUT]: 依赖 viewLevel / match / 固定俯视观战、首局引导、pointer 处理器与控件学习记录
[OUTPUT]: 渲染 3D 球桌、手动相机状态、首局语境观战提示及简洁珠宝风胜负结算
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { markControlLearned } from '../control-onboarding';
import type { MatchState } from '../match/types';
import type { GameMode, MatchTrainingSummary } from '../opponent/model';
import { RoyalFinish } from './RoyalFinish';
import type { CompanionReward } from '../opponent/companion-collection';
import { finishReason } from '../match/presentation';
import type { ShotReward } from '../shot-reward';

interface TableStageProps {
  victoryPraise?: string;
  shotReward?: ShotReward | null;
  collectionReward?: CompanionReward | null;
  collectionSaveFailed?: boolean;
  onCollection?: () => void;
  viewLevel: number;
  spectatorActive: boolean;
  manualCameraActive: boolean;
  firstMatchGuideActive: boolean;
  eightReady?: boolean;
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
  victoryPraise,
  shotReward,
  collectionReward, collectionSaveFailed, onCollection,
  viewLevel,
  spectatorActive,
  manualCameraActive,
  match,
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
        onLostPointerCapture={onPointerCancel}
      >
        {match.phase === 'placing' && match.messageKey.startsWith('place-') && <div className="royal-turn-status" role="status">{match.messageKey === 'place-occupied' ? '这里有球' : match.messageKey === 'place-near-pocket' ? '离袋口远一点' : '放在开球区'}</div>}
        {shotReward && match.phase !== 'finished' && <div key={shotReward.shotId} className="royal-turn-status royal-shot-reward" role="status">{shotReward.text}</div>}

        {match.phase === 'finished' && <RoyalFinish victoryPraise={victoryPraise} collectionSaveFailed={collectionSaveFailed} collectionReward={collectionReward} onCollection={onCollection} companionId={match.companionId} winner={match.winner} messageKey={match.messageKey} reason={match.messageKey === 'win-8' ? '' : finishReason(match)} gameMode={gameMode} onRestart={() => { onResetGame(); markControlLearned('new-match'); }} />}
      </div>

    </section>
  );
}
