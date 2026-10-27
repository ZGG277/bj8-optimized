import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { COMPANIONS } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { collectedCompanionCount, type CompanionCollection } from '../opponent/companion-collection';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { RoyalIcon } from './RoyalIcon';

export function CompanionCollectionBook({ collection, initialCompanionId, saveFailed = false, onClose }: {
  collection: CompanionCollection; initialCompanionId?: string; saveFailed?: boolean; onClose: () => void;
}) {
  const [index, setIndex] = useState(() => Math.max(0, COMPANIONS.findIndex(p => p.id === initialCompanionId || (!initialCompanionId && collection.cards[p.id]))));
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const count = collectedCompanionCount(collection);
  const change = (delta: number) => { setIndex(value => Math.max(0, Math.min(COMPANIONS.length - 1, value + delta))); setDragX(0); };
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
      <div><h2 id="companion-book-title">公主的赞美卡</h2><p>已赢下 {count} / {COMPANIONS.length} 位</p></div>
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
      {COMPANIONS.map((companion, i) => {
        const offset = i - index;
        if (Math.abs(offset) > 2) return null;
        const card = collection.cards[companion.id], art = COMPANION_CARD_ART[companion.id];
        return <article key={companion.id} className={`companion-playing-card ${card ? 'collected' : 'locked'}`}
          data-companion-card={companion.id} data-active={offset === 0 ? 'true' : undefined}
          aria-hidden={offset !== 0} style={{ '--card-offset': offset, '--card-z': 5 - Math.abs(offset), '--card-drag': `${offset === 0 ? dragX : 0}px` } as CSSProperties}>
          <span className="companion-card-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}<RoyalIcon name="crown"/></span>
          {card ? <>
            <img src={art.src} alt={`${companion.name} · ${art.expression}`} draggable={false} width="320" height="320"/>
            <div className="companion-card-copy"><h3>{companion.name}</h3><span>{art.expression}</span><p>“{art.praise}”</p><small>已胜过他 {card.wins} 次</small></div>
          </> : <div className="companion-card-back"><RoyalIcon name="crown"/><p>等待公主赢下这一局</p><small>获胜后，收下他的专属赞美</small></div>}
        </article>;
      })}
    </div>
    <nav className="companion-book-nav" aria-label="卡册翻页">
      <button aria-label="上一张卡" disabled={index === 0} onClick={() => change(-1)}><RoyalIcon name="left"/></button>
      <span aria-live="polite">{index + 1} / {COMPANIONS.length}</span>
      <button aria-label="下一张卡" disabled={index === COMPANIONS.length - 1} onClick={() => change(1)}><RoyalIcon name="right"/></button>
    </nav>
    {saveFailed && <p className="companion-save-notice" role="status">卡片暂未保存，请保持页面打开。</p>}
  </div>;
}
