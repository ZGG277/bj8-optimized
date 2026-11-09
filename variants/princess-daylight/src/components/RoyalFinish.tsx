/**
 * [INPUT]: 真实胜负、本局头像/原句、已赢收藏与可选小红书分享接口。
 * [OUTPUT]: 统一局后卡与近景整图分享封面；浏览器预览与平台首图同图同文案，取消或失败保留。
 * [POS]: 局后呈现与用户主动分享入口，不制造胜局或改写对局规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { containRoyalDialogTab } from './royal-dialog-focus';
import type { MatchHighlights } from '../match/highlights';
import { PostMatchFeedback } from './PostMatchFeedback';
import { feedbackParentOrigin } from '../post-match-feedback';
import { companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { defeatedCompanionNames, type CompanionCollection, type CompanionReward } from '../opponent/companion-collection';
import { RoyalIcon } from './RoyalIcon';
import { PraiseCard } from './PraiseCard';
import { FollowAuthor } from './FollowAuthor';
import type { GameMode } from '../opponent/model';
import { miniToolApi, postVictoryNote, shareFailure, victoryNote, type NoteDraft } from '../minitool/share-note';
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
/** All outcomes use one card with any rule explanation displayed separately. */
export function RoyalFinish({ winner, onRestart, gameMode='practice', companionId, collection, collectionSaveFailed = false, onCollection, victoryPraise = VICTORY_PRAISES[0], messageKey = '', highlights, resultExplanation }: {
  resultExplanation?: string | null;
  highlights?: MatchHighlights;
  collection?: CompanionCollection;
  victoryPraise?: string; collectionSaveFailed?: boolean; collectionReward?: CompanionReward | null; onCollection?: () => void;
  companionId?: string; winner: 'player' | 'opponent' | null; onRestart: () => void; gameMode?: GameMode; messageKey?: string;
}) {
  const feedbackAvailable = typeof window !== 'undefined' && window.parent !== window && Boolean(feedbackParentOrigin(window.location.search, document.referrer));
  const companion = companionFor(companionId), won = winner === 'player';
  const art = won ? COMPANION_CARD_ART[companion.id].src : companion.avatar;
  const line = resultCardLine(winner, victoryPraise, messageKey);
  const [cardImage, setCardImage] = useState('');
  const [shareImage, setShareImage] = useState('');
  const [shareDraft, setShareDraft] = useState<NoteDraft | null>(null);
  useEffect(() => { setCardImage(''); setShareImage(''); setShareDraft(null); }, [art, companion.name, line]);
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
      const names = won ? defeatedCompanionNames(collection, companionId) : [];
      setShareImage(cover);
      setShareDraft(victoryNote(cover, gameMode, companion.name, won ? image : undefined, won, names));
      const api = miniToolApi();
      if (api) {
        await postVictoryNote(api, cover, gameMode, companion.name, won ? image : undefined, won, names);
      } else {
        // The browser preview uses the same cover and draft, without pretending to publish a note.
        setSharePreview(true);
      }
    } catch (error) { if (mounted.current) setShareMessage(shareFailure(error)); }
    finally { sharingLock.current = false; if (mounted.current) setSharing(false); }
  };
  return <div className={`finish-mask royal-finish ${won ? 'won' : 'comfort'}`} role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') stopCelebration(); e.stopPropagation(); }}>
    <h1 id="royal-result-title" className="royal-sr-only">{won ? '公主赢了' : '本局结束'}</h1>
    {celebrating && <div className="royal-petals" aria-hidden="true">{Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i} className="royal-flower" style={{ '--fall-x':`${(i*37+7)%100}%`, '--fall-delay':`${i%7*.08}s`, '--fall-spin':`${i%2?210:-160}deg`, '--petal-color':['#eab6c3','#fff3db','#cfabc9','#d4b469'][i%4] } as CSSProperties}><RoyalIcon name="sparkle"/></i>)}</div>}
    {onCollection && <button className="royal-finish-book" aria-label="查看赞美卡册" onClick={() => { stopCelebration(); onCollection(); }}><RoyalIcon name="cards"/><span>赞美卡册</span></button>}
    <div className="royal-result-scroll" data-has-highlights={Boolean(highlights?.shots) || undefined}>
    <div className="finish-content royal-result-card unified-praise-card" data-companion-id={companion.id}>
      <PraiseCard art={art} name={companion.name} text={line} onImage={setCardImage}/>
    </div>
    <div className="royal-card-actions">
      <button type="button" className="royal-share" disabled={sharing} onClick={() => void share()}>{sharing ? '准备中…' : '分享'}</button>
      <FollowAuthor />
      <button type="button" ref={restartButton} autoFocus data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button>
    </div>
    {resultExplanation && <p className="royal-card-status" role="status">{resultExplanation}</p>}
    {highlights && highlights.shots > 0 && <section className="royal-match-highlights" aria-label="本局亮点">
      <h2>本局亮点</h2><dl>
        <div><dt>合法进球</dt><dd>{highlights.legalPots}<small> 球</small></dd></div>
        <div><dt>最高连进</dt><dd>{highlights.bestRun}<small> 球</small></dd></div>
        <div><dt>本局出杆</dt><dd>{highlights.shots}<small> 杆</small></dd></div>
      </dl>
    </section>}
    {collectionSaveFailed && <p className="royal-card-status" role="status">卡片暂未保存，请保持页面打开。</p>}
    {shareMessage && <p className="royal-card-status" role="status">{shareMessage}</p>}
    {feedbackAvailable && <PostMatchFeedback outcome={won ? 'win' : 'loss'} mode={gameMode} compact onContinue={onRestart}/>}
    </div>
    {sharePreview && createPortal(<div className="royal-share-preview" role="dialog" aria-modal="true" aria-labelledby="share-preview-title"
      onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') setSharePreview(false); e.stopPropagation(); }}>
      <section><header><h2 id="share-preview-title">{shareDraft?.title ?? '公主的赞美卡'}</h2><button ref={previewClose} aria-label="关闭分享预览" onClick={() => setSharePreview(false)}><RoyalIcon name="close"/></button></header>
        <img src={shareImage} alt={`${companion.name} · ${line}`} className="share-preview-image"/>
        <p className="share-preview-copy">{shareDraft?.content}</p>
        <p className="share-preview-hint">在小红书内点分享，即可带上这张封面和文案。</p>
        <button className="share-preview-return" onClick={() => setSharePreview(false)}>返回赞美卡</button>
      </section>
    </div>, document.body)}
  </div>;
}
