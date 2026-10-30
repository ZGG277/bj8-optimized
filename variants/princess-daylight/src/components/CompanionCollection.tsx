import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { COMPANIONS } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { type CompanionCollection } from '../opponent/companion-collection';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { RoyalIcon } from './RoyalIcon';
import { PraiseCard } from './PraiseCard';
import { VICTORY_PRAISES } from '../opponent/victory-praise';

export function CompanionCollectionBook({ collection, initialCompanionId, saveFailed = false, onClose }: {
  collection: CompanionCollection; initialCompanionId?: string; saveFailed?: boolean; onClose: () => void;
}) {
  const history = collection.history ?? [];
  // Old saves only knew companion totals; preserve those without inventing a per-match order.
  const legacy = COMPANIONS.filter(p => (collection.cards[p.id]?.wins ?? 0) > history.filter(c => c.companionId === p.id).length)
    .sort((a,b) => collection.cards[a.id].firstWonAt-collection.cards[b.id].firstWonAt)
    .map(p => ({ id:`legacy-${p.id}`, companionId:p.id, name:p.name, praise:VICTORY_PRAISES[COMPANIONS.indexOf(p)], ordinal:0 }));
  const cards = [...legacy, ...history];
  const [index, setIndex] = useState(() => initialCompanionId && history.length ? cards.length-1 : 0);
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const count = cards.length;
  const change = (delta: number) => { setIndex(value => Math.max(0, Math.min(Math.max(0, count - 1), value + delta))); setDragX(0); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  return <div className="companion-book-mask" role="dialog" aria-modal="true" aria-labelledby="companion-book-title"
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
    onPointerMove={e => e.stopPropagation()} onKeyDown={event => {
      containRoyalDialogTab(event);
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); change(1); }
      event.stopPropagation();
    }}>
    <header className="companion-book-header">
      <div><h2 id="companion-book-title">公主的赞美卡</h2><p>{count ? (cards[index]?.ordinal ? `第 ${cards[index].ordinal} 次胜局` : '此前收藏') : '赢下一局，收下一张赞美卡'}</p></div>
      <button ref={close} onClick={onClose} aria-label="收起卡册"><RoyalIcon name="close"/></button>
    </header>
    <div className="companion-card-stack" aria-label="左右滑动查看卡牌"
      onPointerDown={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) > Math.abs(dy)) { event.preventDefault(); setDragX(Math.max(-100, Math.min(100, dx))); }
      }}
      onPointerUp={event => {
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) change(dx < 0 ? 1 : -1);
        else setDragX(0);
      }} onPointerCancel={() => { gesture.current = null; setDragX(0); }}
      onLostPointerCapture={() => { gesture.current = null; setDragX(0); }}>
      {!count && <div className="companion-empty"><RoyalIcon name="cards"/><p>第一张赞美，等你来收</p></div>}
      {cards.map((card, i) => {
        const offset=i-index;
        if(Math.abs(offset)>1)return null;
        return <article key={card.id} className="companion-playing-card collected unified-praise-card"
          data-companion-card={card.companionId} data-earned-id={card.id} data-earned-ordinal={card.ordinal || undefined}
          data-active={offset===0?'true':undefined} aria-hidden={offset!==0}
          style={{'--card-offset':offset,'--card-z':5-Math.abs(offset),'--card-drag':`${offset===0?dragX:0}px`} as CSSProperties}>
          <PraiseCard art={COMPANION_CARD_ART[card.companionId].src} name={card.name} text={card.praise}/>
        </article>;
      })}
    </div>
    <nav className="companion-book-nav" aria-label="卡册翻页">
      <button aria-label="上一张卡" disabled={!count || index === 0} onClick={() => change(-1)}><RoyalIcon name="left"/></button>
      <span aria-live="polite">{count ? index + 1 : 0} / {count}</span>
      <button aria-label="下一张卡" disabled={!count || index === count - 1} onClick={() => change(1)}><RoyalIcon name="right"/></button>
    </nav>
    {saveFailed && <p className="companion-save-notice" role="status">卡片暂未保存，请保持页面打开。</p>}
  </div>;
}
