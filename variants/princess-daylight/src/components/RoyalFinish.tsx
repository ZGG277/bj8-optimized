/**
 * [INPUT]: 已结算比分、双方身份、本局对话与小红书分享接口。
 * [OUTPUT]: 可编辑的象牙金线回忆卡；收藏整份保留的对话，分享当前三比四卡面。
 * [POS]: 局后呈现和主动分享入口，只消费胜负事实。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { PostMatchFeedback } from './PostMatchFeedback';
import { feedbackParentOrigin } from '../post-match-feedback';
import { companionFor } from '../opponent/companions';
import { RoyalIcon } from './RoyalIcon';
import { FollowAuthor } from './FollowAuthor';
import type { GameMode } from '../opponent/model';
import { DEFAULT_PRINCESS, portraitFor } from '../opponent/player-portraits';
import { pickMemoryFrame, type CardScore, type MatchMemoryCard, type MemoryLine } from '../match/memory-card';
import { loadMemoryCards, saveMemoryCard } from '../minitool/memory-card-storage';
import { renderMemoryCard } from '../minitool/render-memory-card';
import { miniToolApi, postMemoryNote, shareFailure } from '../minitool/share-note';
import { MemoryCardFace, useMemoryPages } from './MemoryCard';
import { startRoyalCelebration, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';
export { ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';

const NO_LINES: readonly MemoryLine[] = [];
const NO_SCORE: CardScore = { group: null, active: [] };

export function RoyalFinish({ winner, onRestart, gameMode = 'practice', companionId, onCollection, resultExplanation,
  chatLines = NO_LINES, rackId, score = NO_SCORE }: {
  resultExplanation?: string | null;
  chatLines?: readonly MemoryLine[];
  rackId?: string;
  score?: CardScore;
  onCollection?: () => void;
  companionId?: string;
  winner: 'player' | 'opponent' | null;
  onRestart: () => void;
  gameMode?: GameMode;
}) {
  const feedbackAvailable = typeof window !== 'undefined' && window.parent !== window && Boolean(feedbackParentOrigin(window.location.search, document.referrer));
  const companion = companionFor(companionId);
  const player = portraitFor('player');
  const portraits = { opponent: companion.avatar, player: player.avatar || DEFAULT_PRINCESS };
  const won = winner === 'player';
  const [identity] = useState(() => {
    let stored: MatchMemoryCard | undefined;
    try { if (rackId) stored = loadMemoryCards().find(card => card.id === rackId); } catch { /* Preserve unreadable cards. */ }
    return { frame: stored?.frame ?? pickMemoryFrame(), finishedAt: stored?.finishedAt ?? Date.now() };
  });
  const [removed, setRemoved] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [image, setImage] = useState('');
  const [notice, setNotice] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const shareLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const visible = useMemo(() => chatLines.filter(line => !removed.includes(line.id)).map(({ id, side, text }) => ({ id, side, text })), [chatLines, removed]);
  const card = useMemo<MatchMemoryCard>(() => ({
    ...identity, id: rackId ?? '', winner, opponentId: companion.id, opponentName: companion.name, playerName: player.name || '你',
    score, reason: resultExplanation || undefined, lines: visible,
  }), [identity, rackId, winner, companion.id, companion.name, player.name, score, resultExplanation, visible]);
  const pages = useMemoryPages(visible);
  const selectedPage = Math.min(page, pages.length - 1);
  useEffect(() => {
    if (!rackId) return;
    let current = true;
    void saveMemoryCard(card).then(() => { if (current) setSaveNotice(''); }, (error: unknown) => {
      if (current) setSaveNotice(error instanceof Error ? error.message : '回忆卡暂未保存。');
    });
    return () => { current = false; };
  }, [card, rackId]);
  useEffect(() => { setImage(''); }, [card, selectedPage]);

  const [celebrating, setCelebrating] = useState(false);
  const cancelCelebration = useRef<(() => void) | null>(null);
  const stopCelebration = () => { cancelCelebration.current?.(); setCelebrating(false); };
  useEffect(() => {
    setCelebrating(false);
    if (!won) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const run = startRoyalCelebration(() => setCelebrating(false), preference);
    setCelebrating(run.active); cancelCelebration.current = run.cancel;
    return () => { run.cancel(); cancelCelebration.current = null; };
  }, [won]);

  const remove = (id: number) => {
    if (shareLock.current) return;
    setRemoved(previous => previous.includes(id) ? previous : [...previous, id]);
  };

  const share = async () => {
    if (shareLock.current) return;
    shareLock.current = true;
    stopCelebration();
    setBusy(true);
    setNotice('');
    try {
      const exported = await renderMemoryCard(card, pages, selectedPage, portraits);
      if (!alive.current) return;
      const api = miniToolApi();
      if (api) {
        const result = await postMemoryNote(api, exported, card.opponentName);
        if (result.errMsg !== 'postNote:ok') throw result;
        if (alive.current) setNotice('回忆卡已交给小红书。');
      } else if (import.meta.env.VITE_MINITOOL !== '1') {
        setImage(exported);
      } else {
        setNotice('请在小红书 App 中打开分享。');
      }
    } catch (error) {
      if (alive.current) setNotice(shareFailure(error).replace('战绩卡', '回忆卡'));
    } finally {
      shareLock.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return <div className={`finish-mask royal-finish royal-memory-finish ${won ? 'won' : 'comfort'}`} role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') stopCelebration(); e.stopPropagation(); }}>
    <h1 id="royal-result-title" className="royal-sr-only">本局回忆卡</h1>
    {celebrating && <div className="royal-petals" aria-hidden="true">{Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i} className="royal-flower" style={{ '--fall-x':`${(i*37+7)%100}%`, '--fall-delay':`${i%7*.08}s`, '--fall-spin':`${i%2?210:-160}deg`, '--petal-color':['#eab6c3','#fff3db','#cfabc9','#d4b469'][i%4] } as CSSProperties}><RoyalIcon name="sparkle"/></i>)}</div>}
    <div className="royal-result-scroll">
      <MemoryCardFace card={card} portraits={portraits} pages={pages} page={selectedPage} onPage={setPage} onRemove={remove}/>
      {chatLines.length > 0 && <div className="memory-edit-help">
        <span>长按气泡左右滑动可删除</span>
        {removed.length > 0 && <button type="button" disabled={busy} onClick={() => setRemoved(previous => previous.slice(0, -1))}>撤销删除</button>}
      </div>}
      <div className="royal-card-actions">
        <button type="button" className="royal-share" disabled={busy} onClick={() => void share()}>{busy ? '生成中…' : '分享'}</button>
        <FollowAuthor />
        <button type="button" data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button>
      </div>
      {onCollection && <button type="button" className="memory-open-book" onClick={() => { stopCelebration(); onCollection(); }}>
        <RoyalIcon name="cards"/>回忆卡册
      </button>}
      {resultExplanation && visible.length > 0 && <p className="royal-card-status" role="status">{resultExplanation}</p>}
      {saveNotice && <p className="royal-card-status" role="status">{saveNotice}</p>}
      {notice && <p className="royal-card-status" role="status">{notice}</p>}
      {image && <div className="memory-export">
        <img className="memory-export-image" src={image} width="1080" height="1440" alt="回忆卡分享图"/>
        <a className="memory-export-download" href={image} download="公主请开球-回忆卡.jpg">下载回忆卡</a>
      </div>}
      {feedbackAvailable && <PostMatchFeedback outcome={won ? 'win' : 'loss'} mode={gameMode} compact onContinue={onRestart}/>}
    </div>
  </div>;
}
