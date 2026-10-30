import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import type { CompanionReward } from '../opponent/companion-collection';
import { RoyalIcon } from './RoyalIcon';
import { PraiseCard } from './PraiseCard';
import type { GameMode } from '../opponent/model';
import { miniToolApi, postVictoryNote, shareFailure } from '../minitool/share-note';
import { renderMatchCard, bundledSceneImage } from '../minitool/match-card';
import castleDistance from '../assets/castle-share-distance.jpg';
import { VICTORY_PRAISES } from '../opponent/victory-praise';
import { startRoyalCelebration, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';
export { ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';

export function resultCardLine(winner: 'player' | 'opponent' | null, praise: string, messageKey = '') {
  if (winner === 'player') return Array.from(praise).length <= 10 && praise.trim() ? praise : VICTORY_PRAISES[0];
  if (messageKey.startsWith('lose-8')) return '没关系，我陪你';
  return winner === 'opponent' ? '下局再赢回来' : '歇一会再来一局';
}
/** All outcomes use one card; rule details remain in the match model, outside the card copy. */
export function RoyalFinish({ winner, onRestart, gameMode='practice', companionId, collectionSaveFailed = false, onCollection, victoryPraise = VICTORY_PRAISES[0], messageKey = '' }: {
  victoryPraise?: string; collectionSaveFailed?: boolean; collectionReward?: CompanionReward | null; onCollection?: () => void;
  companionId?: string; winner: 'player' | 'opponent' | null; onRestart: () => void; gameMode?: GameMode; reason?: string; messageKey?: string;
}) {
  const companion = companionFor(companionId), won = winner === 'player';
  const art = won ? COMPANION_CARD_ART[companion.id].src : companion.avatar;
  const line = resultCardLine(winner, victoryPraise, messageKey);
  const [cardImage, setCardImage] = useState('');
  useEffect(() => { setCardImage(''); }, [art, companion.name, line]);
  const [sharing, setSharing] = useState(false), [shareMessage, setShareMessage] = useState('');
  const sharingLock = useRef(false), mounted = useRef(true);
  const [celebrating, setCelebrating] = useState(false);
  const cancelCelebration = useRef<(() => void) | null>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const stopCelebration = () => { cancelCelebration.current?.(); setCelebrating(false); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setCelebrating(false);
    if (!won) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const run = startRoyalCelebration(() => setCelebrating(false), preference);
    setCelebrating(run.active); cancelCelebration.current = run.cancel;
    return () => { run.cancel(); cancelCelebration.current = null; };
  }, [won]);
  const share = async () => {
    if (sharingLock.current) return;
    stopCelebration(); sharingLock.current = true; setSharing(true); setShareMessage('');
    try {
      const image = cardImage || await renderMatchCard(art, companion.name, line);
      if (!mounted.current) return;
      setCardImage(image);
      const api = miniToolApi();
      if (api) {
        const scene = await bundledSceneImage(castleDistance);
        if (!mounted.current) return;
        await postVictoryNote(api, image, gameMode, companion.name, scene, won);
      } else if (import.meta.env.VITE_MINITOOL === '1') {
        throw new Error('分享能力暂未就绪，请稍后重试。');
      } else {
        const response = await fetch(image), file = new File([await response.blob()], '公主的赞美卡.jpg', { type: 'image/jpeg' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '公主请开球' });
        else { const link = document.createElement('a'); link.href = image; link.download = file.name; link.click(); }
      }
    } catch (error) { if (mounted.current) setShareMessage(shareFailure(error)); }
    finally { sharingLock.current = false; if (mounted.current) setSharing(false); }
  };
  return <div className={`finish-mask royal-finish ${won ? 'won' : 'comfort'}`} role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') stopCelebration(); e.stopPropagation(); }}>
    <h1 id="royal-result-title" className="royal-sr-only">{won ? '公主赢了' : '本局结束'}</h1>
    {celebrating && <div className="royal-petals" aria-hidden="true">{Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i} className="royal-flower" style={{ '--fall-x':`${(i*37+7)%100}%`, '--fall-delay':`${i%7*.08}s`, '--fall-spin':`${i%2?210:-160}deg`, '--petal-color':['#eab6c3','#fff3db','#cfabc9','#d4b469'][i%4] } as CSSProperties}>✧</i>)}</div>}
    {onCollection && <button className="royal-finish-book" aria-label="查看赞美卡册" onClick={() => { stopCelebration(); onCollection(); }}><RoyalIcon name="cards"/><span>赞美卡册</span></button>}
    <div className="finish-content royal-result-card unified-praise-card" data-companion-id={companion.id}>
      <PraiseCard art={art} name={companion.name} text={line} onImage={setCardImage}/>
      <div className="royal-card-actions finish-actions">
        <button type="button" className="royal-share" disabled={sharing} onClick={() => void share()}>{sharing ? '准备中…' : '分享'}</button>
        <button type="button" ref={restartButton} autoFocus data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button>
      </div>
    </div>
    {collectionSaveFailed && <p className="royal-card-status" role="status">卡片暂未保存，请保持页面打开。</p>}
    {shareMessage && <p className="royal-card-status" role="status">{shareMessage}</p>}
  </div>;
}
