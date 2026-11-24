import { CareerPanel } from './CareerPanel';
import type { Career } from '../opponent/career';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { COMPANIONS, companionFor } from '../opponent/companions';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import { type CompanionCollection } from '../opponent/companion-collection';
import { containRoyalDialogTab } from './royal-dialog-focus';
import { RoyalIcon } from './RoyalIcon';
import { PraiseCard } from './PraiseCard';
import { VICTORY_PRAISES } from '../opponent/victory-praise';
import { addressPlayer } from '../opponent/player-address';
import { DEFAULT_PRINCESS, playerNickname, portraitFor } from '../opponent/player-portraits';
import type { MatchMemoryCard } from '../match/memory-card';
import { loadMemoryCards } from '../minitool/memory-card-storage';
import { MemoryCardFace, useMemoryPages } from './MemoryCard';

function SavedMemoryCard({ card }: { card: MatchMemoryCard }) {
  const [page, setPage] = useState(0);
  const name = card.playerName === '公主' && playerNickname() !== '公主' ? '你' : card.playerName;
  const nickname = name === '你' ? undefined : name;
  const lines = useMemo(() => card.lines.map(line => line.side === 'player'
    ? line : { ...line, text: addressPlayer(line.text, card.opponentId, nickname) }), [card.lines, card.opponentId, nickname]);
  const pages = useMemoryPages(lines);
  return <MemoryCardFace card={name === card.playerName ? card : { ...card, playerName: name }} page={page} onPage={setPage} pages={pages} showNavigation={false}
    portraits={{ opponent: companionFor(card.opponentId).avatar, player: portraitFor('player').avatar || DEFAULT_PRINCESS }}/>;
}

export function CompanionCollectionBook({ collection, initialCompanionId, saveFailed = false, onClose, career, careerSaveFailed, initialCareer = false }: {
  career?: Career; careerSaveFailed?: boolean; initialCareer?: boolean; collection: CompanionCollection; initialCompanionId?: string; saveFailed?: boolean; onClose: () => void;
}) {
  const [showCareer, setShowCareer] = useState(initialCareer);
  const history = collection.history ?? [];
  // Old saves only knew companion totals; preserve those without inventing a per-match order.
  const legacy = COMPANIONS.filter(p => (collection.cards[p.id]?.wins ?? 0) > history.filter(c => c.companionId === p.id).length)
    .sort((a,b) => collection.cards[a.id].firstWonAt-collection.cards[b.id].firstWonAt)
    .map(p => ({ id:`legacy-${p.id}`, companionId:p.id, name:p.name, praise:VICTORY_PRAISES[COMPANIONS.indexOf(p)], ordinal:0 }));
  const [saved] = useState(() => {
    try { return { cards: loadMemoryCards(), failed: false }; }
    catch { return { cards: [], failed: true }; }
  });
  const cards = [
    ...saved.cards.slice().sort((a, b) => b.finishedAt - a.finishedAt).map(card => ({ kind: 'memory' as const, id: card.id, card })),
    ...[...legacy, ...history].map(card => ({ kind: 'praise' as const, id: card.id, card })),
  ];
  const [index, setIndex] = useState(() => initialCompanionId
    ? Math.max(0, cards.findIndex(entry => entry.kind === 'praise' && entry.card.companionId === initialCompanionId)) : 0);
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
  if (showCareer && career) return <CareerPanel career={career} saveFailed={careerSaveFailed} onClose={onClose} onCards={() => setShowCareer(false)}/>;
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
      <div><h2 id="companion-book-title">回忆卡册</h2>
        {career && <button className="companion-career-link" onClick={() => setShowCareer(true)}>球局记录</button>}
        <p>{cards[index]?.kind === 'praise' ? '以前收藏的赞美卡' : count ? '' : '打完一局，留下一张回忆卡'}</p>
      </div>
      <button ref={close} onClick={onClose} aria-label="收起卡册"><RoyalIcon name="close"/></button>
    </header>
    <div className="companion-card-stack" aria-label="左右滑动查看卡牌"
      onPointerDown={event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('.memory-card-dialogue')) return;
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
      {!count && <div className="companion-empty"><RoyalIcon name="cards"/><p>第一张回忆，等你来收</p></div>}
      {cards.map((entry, i) => {
        const offset=i-index;
        if(Math.abs(offset)>1)return null;
        if (entry.kind === 'memory') return <article key={entry.id} className="companion-playing-card collected unified-praise-card book-memory-card"
          data-memory-card={entry.id} data-active={offset === 0 ? 'true' : undefined} aria-hidden={offset !== 0}
          style={{ '--card-offset': offset, '--card-z': 5-Math.abs(offset), '--card-drag': `${offset === 0 ? dragX : 0}px` } as CSSProperties}>
          <SavedMemoryCard card={entry.card}/>
        </article>;
        const card = entry.card;
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
    {saved.failed && <p className="companion-save-notice" role="status">回忆卡暂时无法读取。</p>}
    {saveFailed && <p className="companion-save-notice" role="status">卡片暂未保存，请保持页面打开。</p>}
  </div>;
}
