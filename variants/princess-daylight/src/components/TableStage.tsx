/*
[INPUT]: viewLevel / match、已选台词与展示回执、pointer处理器与控件学习记录
[OUTPUT]: 球桌气泡、特殊球和借库提示；已打开的输入框收起后再展示局后卡片
[POS]: HUD 组件层；瞄准拨轮已并入统一可停靠控制层，相机/对局状态由上层持有
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { markControlLearned } from '../control-onboarding';
import type { MatchState } from '../match/types';
import type { GameMode, MatchTrainingSummary } from '../opponent/model';
import { RoyalFinish } from './RoyalFinish';
import type { TableChatLine } from './TableChat';
import type { BilliardsWorld } from '../physics';
import { highlightText, type ShotHighlight } from '../match/shot-highlights';
import type { EscapeRoute } from '../planner/escape-route';

import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { companionInstruction, earlyEightAnnouncement, terminalEightInstruction } from '../opponent/companion-instructions';

const FINISH_ANNOUNCEMENT_MS = 3500;

interface TableStageProps {
  chatFloat?: React.ReactNode;
  chatInputOpen?: boolean;
  shotHighlight?: ShotHighlight | null;
  escapeGuide?: { open: boolean; route: EscapeRoute | null | undefined; toggle: () => void };
  chatLines?: readonly TableChatLine[];
  placementHalo?: { x: number; y: number; valid: boolean } | null;
  rackId: string;
  worldView: BilliardsWorld;
  dialogue?: CompanionDialogue | null;
  onSpeech?: (line: CompanionDialogue) => void;
  speechTurn?: number;
  rackSerial?: number;
  chatSpeaking?: boolean;
  onDialogueShown?: (id: number) => void;
  guideText?: string | null;
  viewHintText?: string | null;
  speechEnabled?: boolean;
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
  placementHalo, chatFloat, chatInputOpen, shotHighlight, escapeGuide, chatLines, rackId, worldView,
  dialogue, onDialogueShown, onSpeech, speechTurn, rackSerial = 0, chatSpeaking, guideText, viewHintText, speechEnabled = true, eightReady,
  onCollection,
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
  const resultScore = React.useMemo(() => ({
    group: match.playerGroup, active: worldView.balls.filter(ball => ball.active).map(ball => ball.number),
  }), [match.playerGroup, worldView]);
  const instruction = companionInstruction({
    match, prioritySpeech: dialogue?.kind ? dialogue : null,
    guide: guideText, view: viewHintText, eightReady,
  });
  const greeting = dialogue?.sceneId === 'OPEN_PLAYER' || dialogue?.sceneId === 'REMATCH';
  const speech = greeting ? dialogue : instruction ?? dialogue;
  const announcement = earlyEightAnnouncement(match) ??
    (match.phase === 'finished' && dialogue?.kind === 'highlight' ? dialogue : null);
  const [announcedMatch, setAnnouncedMatch] = useState<MatchState | null>(null);
  const waitingForAnnouncement = announcement !== null && announcedMatch !== match;

  const audible = waitingForAnnouncement ? announcement : match.phase !== 'finished' ? speech : null;
  const speechKey = audible && JSON.stringify([match.companionId, audible.id < 0 ? speechTurn : null, audible.id, audible.sceneId, audible.text]);
  const spoken = useRef({ rackSerial: -1, last: '', guides: new Set<string>(), eightReady: false });
  useEffect(() => {
    if (spoken.current.rackSerial !== rackSerial) {
      spoken.current = { rackSerial, last: '', guides: new Set(), eightReady: false };
    }
    const memory = spoken.current;
    if (!speechEnabled || !audible || !speechKey || memory.last === speechKey) return;
    if (chatSpeaking && !waitingForAnnouncement && audible.kind !== 'highlight') return;
    if (audible.sceneId === 'EIGHT_READY' && memory.eightReady) return;
    if (audible.sceneId === 'EIGHT_READY' || audible.sceneId === 'P_EIGHT_READY' ||
        (audible.sceneId === 'P_OPPONENT_POT_CONTINUE' && eightReady)) memory.eightReady = true;
    if (audible.sceneId === 'CONTROL_GUIDE' || audible.sceneId === 'VIEW_GUIDE') {
      const key = audible.text.includes('蓄力') ? 'power' : audible.text;
      if (memory.guides.has(key)) return;
      memory.guides.add(key);
    }
    memory.last = speechKey;
    onSpeech?.({ ...audible, companionId: match.companionId });
    if (audible.id >= 0) onDialogueShown?.(audible.id);
  }, [rackSerial, chatSpeaking, waitingForAnnouncement, speechEnabled, audible, speechKey, match.companionId, onSpeech, onDialogueShown, eightReady]);

  useEffect(() => {
    if (!waitingForAnnouncement || !speechEnabled) return;
    const timer = window.setTimeout(() => setAnnouncedMatch(match), FINISH_ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [match, speechEnabled, waitingForAnnouncement]);
  const tableVisible = match.phase !== 'finished' || waitingForAnnouncement || chatInputOpen;
  const result = !tableVisible && <RoyalFinish key={rackId} rackId={rackId} score={resultScore}
    chatLines={chatLines} resultExplanation={match.messageKey === 'win-8' ? undefined : terminalEightInstruction(match)}
    onCollection={onCollection} companionId={match.companionId} winner={match.winner} gameMode={gameMode}
    onRestart={() => { onResetGame(); markControlLearned('new-match'); }} />;
  const overlay = result && typeof document !== 'undefined' ? document.querySelector('.royal-game') : null;
  const showHighlight = tableVisible && shotHighlight &&
    !(escapeGuide && shotHighlight.kind === 'snooker' && shotHighlight.actor === 'opponent');
  const route = escapeGuide?.route;
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
        {tableVisible && <div className="table-feedback-stack">
          {chatFloat}
          {(showHighlight || escapeGuide) && <div className="table-shot-feedback">
            {showHighlight && <p className="shot-highlight" role="status" data-shot-highlight={shotHighlight.kind}>
              {highlightText(shotHighlight)}
            </p>}
            {escapeGuide && (escapeGuide.open ? (
              <div className="escape-guide" data-escape-guide={route === undefined ? 'searching' : route === null ? 'unavailable' : 'verified'}>
                <span role="status">{route === undefined ? '正在找借库路线…' : route === null ? '暂时没找到稳妥的单库路线' :
                  `先借${route.rail === 'left' || route.rail === 'right' ? '长库' : '短库'}，再碰 ${route.target} 号。中杆 · 力度 ${route.power}%`}</span>
                <button type="button" aria-label="收起解球提示"
                  onPointerDown={event => event.stopPropagation()} onClick={escapeGuide.toggle}>×</button>
              </div>
            ) : (
              <button type="button" className="escape-guide" data-escape-guide="closed"
                onPointerDown={event => event.stopPropagation()} onClick={escapeGuide.toggle}>直线被挡 · 看解球</button>
            ))}
          </div>}
        </div>}
        {match.phase === 'placing' && placementHalo && <div className={`free-ball-halo ${placementHalo.valid ? '' : 'invalid'}`} style={{ left: placementHalo.x, top: placementHalo.y }} role="img" aria-label={placementHalo.valid ? '拖动光圈，松手放白球' : '此处不能放球，请拖回台面空位'}><i/></div>}

        {overlay ? createPortal(result, overlay) : result}
      </div>
    </section>
  );
}
