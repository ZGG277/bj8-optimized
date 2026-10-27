import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import type { CompanionReward } from '../opponent/companion-collection';
import { RoyalIcon } from './RoyalIcon';
import type { GameMode } from '../opponent/model';
import { miniToolApi, renderVictoryCard, postVictoryNote, shareFailure } from '../minitool/share-note';

import { startRoyalCelebration, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';
export { ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';

/** One finite celebration, unmounted on restart. It deliberately adds no sound. */
export function RoyalFinish({ winner, onRestart, gameMode='practice', reason='', companionId, collectionReward, collectionSaveFailed = false, onCollection }: { collectionSaveFailed?: boolean; collectionReward?: CompanionReward | null; onCollection?: () => void; companionId?: string; winner: 'player' | 'opponent' | null; onRestart: () => void; gameMode?: GameMode; reason?: string }) {
  const companion = companionFor(companionId);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const mounted = useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const share = async () => {
    const api=miniToolApi();if(!api || sharing)return;setSharing(true);setShareMessage('');
    try { const image=await renderVictoryCard(gameMode, undefined, companion.name);if(!mounted.current)return;await postVictoryNote(api,image,gameMode,companion.name);if(mounted.current)setShareMessage('已返回战绩卡'); }
    catch(error){if(mounted.current)setShareMessage(shareFailure(error));}
    finally{if(mounted.current)setSharing(false);}
  };
  const [celebrating, setCelebrating] = useState(false);
  const cancelCelebration = useRef<(() => void) | null>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const endCelebration = () => {
    setCelebrating(false);
    if (document.activeElement?.classList.contains('royal-skip')) restartButton.current?.focus();
  };
  const stopCelebration = () => { cancelCelebration.current?.(); endCelebration(); restartButton.current?.focus(); };
  useEffect(() => {
    setCelebrating(false);
    if (winner !== 'player') return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const run = startRoyalCelebration(endCelebration, preference);
    setCelebrating(run.active); cancelCelebration.current = run.cancel;
    return () => { run.cancel(); cancelCelebration.current = null; };
  }, [winner]);
  const won = winner === 'player';
  const art = COMPANION_CARD_ART[companion.id];
  return <div className={`finish-mask royal-finish ${won ? 'won' : 'prince-finish'}`}
    role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}
    onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if(e.key==='Escape') stopCelebration(); e.stopPropagation(); }} onContextMenu={e => e.stopPropagation()}>
    {celebrating && <div className="royal-petals" aria-hidden="true">
      {Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i}
        className={i % 3 === 0 ? 'royal-ribbon' : 'royal-flower'}
        style={{ '--fall-x': `${(i * 37 + 7) % 100}%`, '--fall-delay': `${(i % 7) * .08}s`, '--fall-spin': `${i % 2 ? 210 : -160}deg`, '--petal-color': ['#eab6c3','#fff3db','#cfabc9','#d4b469'][i % 4] } as CSSProperties}>
        {i % 3 !== 0 && <svg viewBox="0 0 40 40"><g fill="currentColor"><ellipse cx="20" cy="12" rx="6" ry="10"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(72 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(144 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(216 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(288 20 20)"/></g><circle cx="20" cy="20" r="4" fill="#b98c39"/></svg>}
      </i>)}
    </div>}
    <div className="finish-content royal-result-card" data-companion-id={companion.id}>
      <img className="royal-companion-portrait" src={won ? art.src : companion.avatar} alt={won ? `${companion.name} · ${art.expression}` : companion.name} width="224" height="224"/>
      <p className="royal-companion-name">{companion.name}</p>
      <div className="royal-victory-emblem" aria-hidden="true"><RoyalIcon name={won ? 'crown' : 'restart'}/></div>
      <h1 id="royal-result-title">{won ? '公主赢了' : winner === 'opponent' ? '这一局惜败' : '本局结束'}</h1>
      <p className="royal-companion-greeting">{won ? companion.congratulations : winner === 'opponent' ? '差一点就赢了，公主。下一局，我继续陪你。' : '公主，下一局见。'}</p>
      {won && collectionReward && <p className="royal-card-reward" role="status">{collectionReward.isNew ? (collectionSaveFailed ? '新赞美卡 · 本次已解锁' : '新赞美卡 · 已收入卡册') : `再次赢下 · 第 ${collectionReward.wins} 次`}</p>}
      {won && collectionSaveFailed && <p className="companion-save-notice" role="status">卡片暂未保存，请保持页面打开。</p>}
      {reason && !won && <p className="royal-result-reason">{reason}</p>}
      <div className="finish-actions"><button type="button" ref={restartButton} autoFocus data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button></div>
      {won && onCollection && <button className="royal-open-cardbook" onClick={() => { stopCelebration(); onCollection(); }}><RoyalIcon name="cards"/>查看赞美卡册</button>}
      {won && miniToolApi() && <button className="royal-share" disabled={sharing || celebrating} onClick={()=>void share()}>{sharing?'准备战绩卡…':'分享这一局'}</button>}
      {shareMessage && <p role="status">{shareMessage}</p>}
      {celebrating && <button className="royal-skip" type="button" aria-label="跳过庆祝" onClick={stopCelebration}><RoyalIcon name="skip"/></button>}
    </div>
  </div>;
}
