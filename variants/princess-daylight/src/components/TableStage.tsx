/*
[INPUT]: viewLevel / match、已选台词与展示回执、pointer处理器与控件学习记录
[OUTPUT]: 单一小头像通道按事实优先显示犯规/分组/教学/台词；渲染球桌、摆球光圈及真实亮点结算
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React from 'react';
import { markControlLearned } from '../control-onboarding';
import type { MatchState } from '../match/types';
import type { GameMode, MatchTrainingSummary } from '../opponent/model';
import { RoyalFinish } from './RoyalFinish';
import type { CompanionCollection, CompanionReward } from '../opponent/companion-collection';
import { CompanionMoment } from './CompanionMoment';
import type { MatchHighlights } from '../match/highlights';

import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { companionInstruction, terminalFoulInstruction } from '../opponent/companion-instructions';

interface TableStageProps {
  placementHalo?: { x: number; y: number; valid: boolean } | null;
  highlights?: MatchHighlights;
  victoryPraise?: string;
  dialogue?: CompanionDialogue | null;
  onDialogueShown?: (id: number) => void;
  guideText?: string | null;
  viewHintText?: string | null;
  speechEnabled?: boolean;
  collectionReward?: CompanionReward | null;
  collection?: CompanionCollection;
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
  placementHalo, highlights,
  victoryPraise,
  dialogue, onDialogueShown, guideText, viewHintText, speechEnabled = true, eightReady,
  collection, collectionReward, collectionSaveFailed, onCollection,
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
  const instruction = companionInstruction({
    match, prioritySpeech: dialogue?.kind ? dialogue : null,
    guide: guideText, view: viewHintText, eightReady,
  });
  const speech = instruction ?? dialogue;
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
        {match.phase === 'placing' && placementHalo && <div className={`free-ball-halo ${placementHalo.valid ? '' : 'invalid'}`} style={{ left: placementHalo.x, top: placementHalo.y }} role="img" aria-label={placementHalo.valid ? '拖动光圈，松手放白球' : '此处不能放球，请拖回台面空位'}><i/></div>}
        {speechEnabled && speech && match.phase !== 'finished' && <CompanionMoment key={`${speech.id}:${speech.sceneId}:${speech.text}`} dialogue={speech} onShown={speech.id >= 0 && speech.kind !== 'rule' ? onDialogueShown : undefined}/>}

        {match.phase === 'finished' && <RoyalFinish foulExplanation={terminalFoulInstruction(match)} highlights={highlights} victoryPraise={victoryPraise} collection={collection} collectionSaveFailed={collectionSaveFailed} collectionReward={collectionReward} onCollection={onCollection} companionId={match.companionId} winner={match.winner} messageKey={match.messageKey} gameMode={gameMode} onRestart={() => { onResetGame(); markControlLearned('new-match'); }} />}
      </div>

    </section>
  );
}
