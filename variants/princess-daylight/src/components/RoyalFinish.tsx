/**
 * [INPUT]: 真实胜负、本局头像和原句。
 * [OUTPUT]: 统一局后卡与可下载的近景整图。
 * [POS]: 局后呈现与图片保存入口，不制造胜局或改写对局规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { containRoyalDialogTab } from './royal-dialog-focus';
import type { MatchHighlights } from '../match/highlights';
import { companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { type CompanionCollection, type CompanionReward } from '../opponent/companion-collection';
import { RoyalIcon } from './RoyalIcon';
import { PraiseCard } from './PraiseCard';
import type { GameMode } from '../opponent/model';
import { renderMatchCard } from '../minitool/match-card';
import { renderShareCover } from '../minitool/share-cover';
import { VICTORY_PRAISES } from '../opponent/victory-praise';
import { startRoyalCelebration, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';
export { ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';

export function resultCardLine(winner: 'player' | 'opponent' | null, praise: string, messageKey = '') {
  if (winner === 'player') return Array.from(praise).length <= 10 && praise.trim() ? praise : VICTORY_PRAISES[0];
  if (messageKey.startsWith('lose-8')) return '没关系，我陪你';
  return winner === 'opponent' ? '下局再赢回来' : '歇一会再来一局';
}
/** All outcomes use one card; rule details remain in the match model, outside the card copy. */
export function RoyalFinish({ winner, onRestart, companionId, collectionSaveFailed = false, onCollection, victoryPraise = VICTORY_PRAISES[0], messageKey = '', highlights, foulExplanation }: {
  foulExplanation?: string | null;
  highlights?: MatchHighlights;
  collection?: CompanionCollection;
  victoryPraise?: string; collectionSaveFailed?: boolean; collectionReward?: CompanionReward | null; onCollection?: () => void;
  companionId?: string; winner: 'player' | 'opponent' | null; onRestart: () => void; gameMode?: GameMode; reason?: string; messageKey?: string;
}) {
  const companion = companionFor(companionId), won = winner === 'player';
  const art = won ? COMPANION_CARD_ART[companion.id].src : companion.avatar;
  const line = resultCardLine(winner, victoryPraise, messageKey);
  const [cardImage, setCardImage] = useState('');
  const [shareImage, setShareImage] = useState('');
  useEffect(() => { setCardImage(''); setShareImage(''); }, [art, companion.name, line]);
  const [sharing, setSharing] = useState(false), [shareMessage, setShareMessage] = useState('');
  const [sharePreview, setSharePreview] = useState(false);
  const previewClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sharePreview) return;
    const previous = document.activeElement as HTMLElement | null;
    previewClose.current?.focus();
    return () => previous?.focus();
  }, [sharePreview]);
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
      const cover = won ? shareImage || await renderShareCover(art, companion.name, line) : image;
      if (!mounted.current) return;
      setShareImage(cover);
      setSharePreview(true);
    } catch {
      if (mounted.current) setShareMessage('图片暂时无法生成，请重试。');
    }
    finally { sharingLock.current = false; if (mounted.current) setSharing(false); }
  };
  return <div className={`finish-mask royal-finish ${won ? 'won' : 'comfort'}`} role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') stopCelebration(); e.stopPropagation(); }}>
    <h1 id="royal-result-title" className="royal-sr-only">{won ? '公主赢了' : '本局结束'}</h1>
    {celebrating && <div className="royal-petals" aria-hidden="true">{Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i} className="royal-flower" style={{ '--fall-x':`${(i*37+7)%100}%`, '--fall-delay':`${i%7*.08}s`, '--fall-spin':`${i%2?210:-160}deg`, '--petal-color':['#eab6c3','#fff3db','#cfabc9','#d4b469'][i%4] } as CSSProperties}><RoyalIcon name="sparkle"/></i>)}</div>}
    {onCollection && <button className="royal-finish-book" aria-label="查看赞美卡册" onClick={() => { stopCelebration(); onCollection(); }}><RoyalIcon name="cards"/><span>赞美卡册</span></button>}
    <div className="royal-result-scroll">
    <div className="finish-content royal-result-card unified-praise-card" data-companion-id={companion.id}>
      <PraiseCard art={art} name={companion.name} text={line} onImage={setCardImage}/>
      <div className="royal-card-actions finish-actions">
        <button type="button" className="royal-share" disabled={sharing} onClick={() => void share()}>{sharing ? '准备中…' : '保存图片'}</button>
        <button type="button" ref={restartButton} autoFocus data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button>
      </div>
    </div>
    {foulExplanation && <p className="royal-card-status" role="status">{foulExplanation}</p>}
    {highlights && highlights.shots > 0 && <section className="royal-match-highlights" aria-label="本局亮点">
      <h2>本局亮点</h2><dl>
        <div><dt>合法进球</dt><dd>{highlights.legalPots}<small> 球</small></dd></div>
        <div><dt>最高连进</dt><dd>{highlights.bestRun}<small> 球</small></dd></div>
        <div><dt>本局出杆</dt><dd>{highlights.shots}<small> 杆</small></dd></div>
      </dl>
    </section>}
    {collectionSaveFailed && <p className="royal-card-status" role="status">卡片暂未保存，请保持页面打开。</p>}
    {shareMessage && <p className="royal-card-status" role="status">{shareMessage}</p>}
    </div>
    {sharePreview && createPortal(<div className="royal-share-preview" role="dialog" aria-modal="true" aria-labelledby="share-preview-title"
      onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') setSharePreview(false); e.stopPropagation(); }}>
      <section><header><h2 id="share-preview-title">{won ? '这一局公主又赢了' : '公主的赞美卡'}</h2><button ref={previewClose} aria-label="关闭图片预览" onClick={() => setSharePreview(false)}><RoyalIcon name="close"/></button></header>
        <img src={shareImage} alt={`${companion.name} · ${line}`} className="share-preview-image"/>
        <a className="share-preview-download" href={shareImage} download="princess-billiards.jpg">下载图片</a>
        <p className="share-preview-hint">手机上也可以试试长按图片保存。</p>
        <button className="share-preview-return" onClick={() => setSharePreview(false)}>返回赞美卡</button>
      </section>
    </div>, document.body)}
  </div>;
}
