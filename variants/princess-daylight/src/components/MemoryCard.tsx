import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { MEMORY_BUBBLE_COLORS, MEMORY_CARD_SIZE, MEMORY_CHAT, MEMORY_SCORE_LIFT, WARM_BALL_COLORS, layoutMemoryPages, resultStatus, scoreGroups, type MatchMemoryCard, type MemoryLine, type MemoryPage, type PositionedBubble } from '../match/memory-card';
import { memoryFrameAsset, memoryTextMeasure, remainingLabel, type MemoryPortraits } from '../minitool/render-memory-card';
import './memory-card.css';

const box = (left: number, top: number, width?: number, height?: number) => ({ left, top, width, height });
const bubbleFont = `${MEMORY_CHAT.font}px`;
const bubbleTypography = { '--royal-font-size': bubbleFont, lineHeight: `${MEMORY_CHAT.step}px` } as CSSProperties;

export function useMemoryPages(lines: readonly MemoryLine[]) {
  const fallback = useMemo(() => layoutMemoryPages(lines, memoryTextMeasure()), [lines]);
  const [measured, setMeasured] = useState<{ lines: readonly MemoryLine[]; pages: MemoryPage[] }>();
  useLayoutEffect(() => {
    if (!lines.length) return;
    const measure = () => {
      // WebView text zoom and font fallback can change DOM widths without changing Canvas metrics.
      const probe = document.createElement('span');
      probe.className = 'memory-bubble-line memory-bubble-measure';
      probe.style.setProperty('--royal-font-size', bubbleFont);
      probe.setAttribute('aria-hidden', 'true');
      document.body.append(probe);
      try {
        const canvas = memoryTextMeasure();
        const widths = new Map<string, number>();
        const pages = layoutMemoryPages(lines, text => {
          const cached = widths.get(text);
          if (cached !== undefined) return cached;
          probe.textContent = text;
          const width = Math.max(probe.getBoundingClientRect().width, canvas(text));
          widths.set(text, width);
          return width;
        });
        setMeasured({ lines, pages });
      } finally {
        probe.remove();
      }
    };
    measure();
    document.fonts?.addEventListener('loadingdone', measure);
    window.addEventListener('resize', measure);
    return () => {
      document.fonts?.removeEventListener('loadingdone', measure);
      window.removeEventListener('resize', measure);
    };
  }, [lines]);
  return measured?.lines === lines ? measured.pages : fallback;
}

function MemoryRack({ card, numbers, x }: { card: MatchMemoryCard; numbers: readonly number[]; x: number }) {
  return <div className="memory-rack" style={box(x - 4.6, 89.4)} aria-hidden="true">
    {numbers.map(n => <span key={n} data-potted={card.score.group && !card.score.active.includes(n) || undefined}
      data-unassigned={!card.score.group || undefined} data-stripe={n > 8 || undefined}
      style={{ '--ball': WARM_BALL_COLORS[n < 8 ? n - 1 : n - 9] } as CSSProperties}/>)}
  </div>;
}

function MemoryPortrait({ src, x, y, size }: { src: string; x: number; y: number; size: number }) {
  return <img className="memory-portrait" style={box(x, y, size, size)} src={src} alt="" draggable={false}/>;
}

type BubblePress = { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout>; held: boolean };

function MemoryBubble({ entry, speaker, scale, onRemove }: {
  entry: PositionedBubble; speaker: string; scale: number; onRemove?: (id: number) => void;
}) {
  const press = useRef<BubblePress | null>(null);
  const [offset, setOffset] = useState(0);
  const [held, setHeld] = useState(false);
  const drop = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => drop, []);
  const cancel = () => { drop(); setOffset(0); setHeld(false); };
  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || press.current) return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    press.current = { id, x, y, held: false, timer: setTimeout(() => {
      if (!press.current) return;
      press.current.held = true;
      setHeld(true);
    }, 280) };
    event.currentTarget.setPointerCapture(id);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = press.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.held && Math.hypot(dx, dy) > 9) { cancel(); return; }
    if (active.held && Math.abs(dx) > Math.abs(dy)) setOffset(Math.max(-80, Math.min(80, dx / scale)));
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = press.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    cancel();
    if (active.held && Math.abs(dx) >= 37 && Math.abs(dx) > Math.abs(dy) * 1.2) onRemove?.(entry.id);
  }
  const contents = entry.rows.map((row,index) => <span className="memory-bubble-line" key={index}>{row}</span>);
  const side = entry.side === 'player' ? { right: 0 } : { left: 0 };
  const palette = MEMORY_BUBBLE_COLORS[entry.side];
  const style = { ...bubbleTypography, ...side, top: 0, height: entry.height, padding: `${MEMORY_CHAT.paddingY}px ${MEMORY_CHAT.paddingX}px`,
    background: palette.background, color: palette.text, borderRadius: MEMORY_CHAT.radius,
    transform: offset ? `translateX(${offset}px)` : undefined };
  return <div className="memory-bubble-row" data-side={entry.side} data-line-id={entry.id} style={box(0, entry.y, MEMORY_CHAT.width, entry.height)}>
    {offset !== 0 && <span className="memory-delete-mark" aria-hidden="true" data-direction={offset > 0 ? 'right' : 'left'} style={box(entry.x, 0, entry.width, entry.height)}>删除</span>}
    {onRemove ? <button type="button" className="memory-bubble" style={style} data-held={held || undefined}
      aria-label={`${speaker}：${entry.rows.join('')}`} aria-keyshortcuts="Delete"
      onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onContextMenu={event => event.preventDefault()} onKeyDown={event => {
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onRemove(entry.id); }
      }}>{contents}</button> : <div className="memory-bubble" role="group" aria-label={speaker} style={style}>{contents}</div>}
  </div>;
}

export function MemoryCardFace({ card, portraits, pages, page, onPage, onRemove, showNavigation = true }: {
  card: MatchMemoryCard; portraits: MemoryPortraits; pages: MemoryPage[]; page: number; onPage: (page: number) => void; onRemove?: (id: number) => void; showNavigation?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [scale,setScale] = useState(1);
  const { opponent: away, player: home } = scoreGroups(card.score.group);
  const background = memoryFrameAsset(card.frame);
  const current = Math.min(page, pages.length - 1);
  useEffect(() => {
    const cardFrame = frame.current;
    if (!cardFrame) return;
    const measure = () => {
      const width = cardFrame.getBoundingClientRect().width;
      if (width > 0) setScale(width / MEMORY_CARD_SIZE.width);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(cardFrame);
    window.addEventListener('resize',measure);
    measure();
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const select = (index: number) => {
    if (!scroll.current) return;
    scroll.current.scrollTop = index * MEMORY_CHAT.height;
    onPage(index);
  };

  return <div className="memory-card-group">
    <div className="memory-card-face" ref={frame} data-frame={card.frame} aria-label="三比四回忆卡">
      <div className="memory-card-surface" style={{ transform: `scale(${scale})`, backgroundImage: background ? `url("${background}")` : undefined }}>
        <div className="memory-card-result" aria-label="本局比分" style={{ top: -MEMORY_SCORE_LIFT }}>
          <p className="memory-score-name" style={box(37, 59, 126)}>{card.opponentName}</p>
          <p className="memory-score-name" style={box(197, 59, 126)}>{card.playerName}</p>
          <MemoryPortrait src={portraits.opponent} x={26} y={79} size={30}/>
          <MemoryPortrait src={portraits.player} x={304} y={79} size={30}/>
          <MemoryRack card={card} numbers={away} x={66}/>
          <MemoryRack card={card} numbers={home} x={216}/>
          <div className="memory-score-eight" data-active={card.score.active.includes(8)} aria-label={card.score.active.includes(8) ? '黑八仍在桌上' : '黑八已离桌'}>8</div>
          <p className="memory-score-count" style={box(51, 108, 98)}>{remainingLabel(card, away)}</p>
          <p className="memory-score-count" style={box(211, 108, 98)}>{remainingLabel(card, home)}</p>
          <p className="memory-score-winner">{resultStatus(card)}</p>
        </div>
        <div ref={scroll} className="memory-card-dialogue" tabIndex={0} aria-label="上下滑动回顾本局对话"
          style={box(MEMORY_CHAT.left, MEMORY_CHAT.top, MEMORY_CHAT.width, MEMORY_CHAT.height)}
          onScroll={event => onPage(Math.min(pages.length - 1, Math.round(event.currentTarget.scrollTop / MEMORY_CHAT.height)))}>
          {pages.map((entries,index) => <section className="memory-card-page" key={index} aria-label={`对话第 ${index + 1} 页`} style={{ height: MEMORY_CHAT.height }}>
            {entries.length ? entries.map((bubble,row) => <MemoryBubble key={`${bubble.id}-${row}`} entry={bubble} scale={scale} onRemove={onRemove}
              speaker={bubble.side === 'player' ? card.playerName : card.opponentName}/>)
              : <p className="memory-card-empty">{card.reason || '这页没有对话'}</p>}
          </section>)}
        </div>
        <p className="memory-card-footer">公主请开球{pages.length > 1 && ` · ${current + 1} / ${pages.length}`}</p>
      </div>
    </div>
    {showNavigation && pages.length > 1 && <div className="memory-page-navigation" aria-label="选择要分享的对话页">
      <button type="button" disabled={current <= 0} onClick={() => select(current - 1)} aria-label="上一页对话">↑</button>
      <span>{current + 1} / {pages.length}</span>
      <button type="button" disabled={current >= pages.length - 1} onClick={() => select(current + 1)} aria-label="下一页对话">↓</button>
    </div>}
  </div>;
}
