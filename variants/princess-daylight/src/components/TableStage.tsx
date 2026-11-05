/*
[INPUT]: 依赖 viewLevel / match / 固定俯视观战、首局引导、pointer 处理器与控件学习记录
[OUTPUT]: 渲染 3D 球桌、手动相机状态、首局语境观战提示及可触摸摆球光圈、角色短台词与真实亮点结算
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React, { useEffect, useRef, useState } from 'react';
import { markControlLearned } from '../control-onboarding';
import type { MatchState } from '../match/types';
import type { GameMode, MatchTrainingSummary } from '../opponent/model';
import { RoyalFinish } from './RoyalFinish';
import type { CompanionReward } from '../opponent/companion-collection';
import { CompanionMoment } from './CompanionMoment';
import type { MatchHighlights } from '../match/highlights';
import { foulSentence, finishReason } from '../match/presentation';
import type { ShotReward } from '../shot-reward';

interface TableStageProps {
  placementHalo?: { x: number; y: number; valid: boolean } | null;
  highlights?: MatchHighlights;
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
  placementHalo, highlights,
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
  const foul = foulSentence(match);
  const [foulNotice, setFoulNotice] = useState<string | null>(null);
  const foulTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (match.phase === 'finished' || match.breaking) { setFoulNotice(null); return; }
    if (!foul) return;
    if (foulTimer.current) clearTimeout(foulTimer.current);
    setFoulNotice(foul);
    foulTimer.current = setTimeout(() => setFoulNotice(null), 3500);
  }, [foul, match.phase === 'finished', match.breaking]);
  useEffect(() => () => { if (foulTimer.current) clearTimeout(foulTimer.current); }, []);
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
        {match.phase !== 'finished' && foulNotice && <div className="royal-foul-status" role="status">{foulNotice}</div>}
        {match.phase === 'placing' && placementHalo && <div className={`free-ball-halo ${placementHalo.valid ? '' : 'invalid'}`} style={{ left: placementHalo.x, top: placementHalo.y }} role="img" aria-label={placementHalo.valid ? '拖动光圈，松手放白球' : '此处不能放球，请拖回台面空位'}><i/><span>拖动 · 松手放球</span></div>}
        {shotReward && match.phase === 'aiming' && <CompanionMoment companionId={match.companionId} moment="pot" eventId={shotReward.shotId}/>}
        {match.actor === 'opponent' && (match.phase === 'opponent' || match.phase === 'rolling') && !foulNotice && match.messageKey !== 'foul' && <CompanionMoment companionId={match.companionId} moment="thinking" thinking={match.phase === 'opponent'}/>}
        {match.phase === 'placing' && match.messageKey.startsWith('place-') && <div className="royal-turn-status" role="status">{match.messageKey === 'place-occupied' ? '这里有球' : match.messageKey === 'place-near-pocket' ? '离袋口远一点' : '放在开球区'}</div>}

        {match.phase === 'finished' && <RoyalFinish foulExplanation={match.messageKey === 'lose-8-foul' ? foulSentence(match) : null} highlights={highlights} victoryPraise={victoryPraise} collectionSaveFailed={collectionSaveFailed} collectionReward={collectionReward} onCollection={onCollection} companionId={match.companionId} winner={match.winner} messageKey={match.messageKey} reason={match.messageKey === 'win-8' ? '' : finishReason(match)} gameMode={gameMode} onRestart={() => { onResetGame(); markControlLearned('new-match'); }} />}
      </div>

    </section>
  );
}
