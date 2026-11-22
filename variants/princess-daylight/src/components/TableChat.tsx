import { useCallback, useEffect, useRef, useState } from 'react';
import { TableAvatar } from './TableAvatar';
import { companionFor } from '../opponent/companions';
import { shortSpeech } from '../opponent/short-speech';
import type { Brief } from '../opponent/table-coach';
import { aiBridge, askTableFriend, chatFailure, type Exchange } from '../minitool/table-chat';
import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { RoyalIcon } from './RoyalIcon';
import { containRoyalDialogTab } from './royal-dialog-focus';

type Line = { id: number; side: 'player' | 'opponent'; text: string; companionId?: string; source?: string; requestId?: string };
const READING_MS = 1600;

export function useTableChat() {
  const [lines, setLines] = useState<Line[]>([]);
  const [live, setLive] = useState<Line | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const pageId = useRef('rack-' + (performance.timeOrigin ?? Date.now()));
  const closing = useRef(false);
  const navigationTimer = useRef<number>();
  const openRoom = () => {
    if (closing.current || reviewing) return;
    try { if (history.state?.princessChat !== pageId.current) history.pushState({ ...history.state, princessChat: pageId.current }, ''); } catch { /* Embedded hosts may disable navigation. */ }
    setReviewing(true);
  };
  const closeRoom = () => {
    if (closing.current) return;
    setReviewing(false);
    if (history.state?.princessChat !== pageId.current) return;
    closing.current = true;
    navigationTimer.current = window.setTimeout(() => { closing.current = false; }, 400);
    try { history.back(); } catch { closing.current = false; }
  };
  useEffect(() => {
    const back = () => { window.clearTimeout(navigationTimer.current); closing.current = false; setReviewing(history.state?.princessChat === pageId.current); };
    window.addEventListener('popstate', back);
    return () => { window.removeEventListener('popstate', back); window.clearTimeout(navigationTimer.current); };
  }, []);
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<{ question: string; reason: string } | null>(null);
  const sequence = useRef(0);
  const request = useRef(0);
  const busy = useRef(false);
  const exchanges = useRef<Exchange[]>([]);
  const deadline = useRef<number>();
  const delivery = useRef<number>();
  const invalidate = useCallback(() => {
    ++request.current;
    busy.current = false;
    window.clearTimeout(deadline.current);
    window.clearTimeout(delivery.current);
  }, []);
  useEffect(() => invalidate, [invalidate]);

  const say = useCallback((message: Omit<Line, 'id'>, showOnTable = true) => {
    const line = { ...message, text: message.side === 'opponent' ? shortSpeech(message.text) : message.text, id: ++sequence.current };
    setLines(previous => [...previous, line]);
    if (showOnTable) setLive(line);
  }, []);
  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => setLive(null), Math.min(9500, Math.max(3500, live.text.length * 190)));
    return () => window.clearTimeout(timer);
  }, [live]);

  const automatic = useCallback((speech: CompanionDialogue) => {
    const alreadyOnCard = speech.sceneId === 'OPEN_PLAYER' || speech.sceneId === 'REMATCH';
    say({ side: 'opponent', companionId: speech.companionId, text: speech.text }, !alreadyOnCard);
  }, [say]);

  const reset = useCallback(() => {
    invalidate(); exchanges.current = []; setFailure(null); pageId.current += 'r'; closing.current = false;
    setReviewing(false); setWaiting(false); setLines([]); setLive(null);
  }, [invalidate]);

  async function send(question: string, brief: Brief, companionId?: string, retry = false) {
    if (busy.current || !question.trim() || (retry && failure?.question !== question)) return;
    const token = ++request.current;
    busy.current = true;
    setWaiting(true);
    setFailure(null);
    if (!retry) say({ side: 'player', text: question });
    const started = performance.now();
    let received = false;
    function receive(reply: Exchange) {
      if (request.current !== token || received) return;
      received = true;
      window.clearTimeout(deadline.current);
      delivery.current = window.setTimeout(() => {
        if (request.current !== token) return;
        busy.current = false; setWaiting(false);
        exchanges.current.push(reply);
        say({ side: 'opponent', text: reply.answer, companionId, source: reply.source, requestId: reply.requestId });
      }, Math.max(0, READING_MS - (performance.now() - started)));
    }
    function fail(error: unknown) {
      if (request.current !== token || received) return;
      received = true;
      window.clearTimeout(deadline.current);
      busy.current = false;
      setWaiting(false);
      setFailure({ question, reason: chatFailure(error) });
    }
    try {
      const bridge = aiBridge();
      if (!bridge?.createModel) { fail('NO_AI_BRIDGE'); return; }
      deadline.current = window.setTimeout(() => fail('AI_TIMEOUT'), 45000);
      const tableLines = lines.filter(line => line.side === 'opponent' && !line.source).slice(-4).map(line => line.text);
      receive(await askTableFriend(bridge, brief, exchanges.current, question, tableLines));
    } catch (error) { fail(error); }
  }
  return { lines, live, reviewing, openRoom, closeRoom, waiting, failure, send, automatic, reset };
}

function ChatBubble({line}: {line:Line}) {
  const player=line.side==='player';
  return <div key={line.id} className={'chat-row '+line.side} data-source={line.source} data-request-id={line.requestId}>
    <TableAvatar id={player ? 'player' : line.companionId}/>
    <p>{line.text}</p>
  </div>;
}
export function ChatFloat({line}: {line:Line}) {
  return <div key={line.id} className="chat-float" role="status"><ChatBubble line={line}/></div>;
}
export function ChatRoom({lines, companionId, waiting, failure, onSend, onClose}:{
  lines:Line[];companionId?:string;waiting:boolean;failure:{question:string;reason:string}|null;onSend:(q:string,retry?:boolean)=>void;onClose:()=>void;
}) {
  const [draft,setDraft]=useState('');
  const back=useRef<HTMLButtonElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const atBottom=useRef(true);
  const room = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const node = room.current;
    if (!node) return;
    let start: { x:number; y:number } | null = null;
    const begin = (e:TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && !(e.target as Element).closest('input,button,textarea')
        ? {x:t.clientX,y:t.clientY} : null;
    };
    const move = (e:TouchEvent) => {
      if (!start || e.touches.length !== 1) { start=null; return; }
      const dx=e.touches[0].clientX-start.x, dy=Math.abs(e.touches[0].clientY-start.y);
      if (dy > 12 && dy >= dx) { start=null; return; }
      if (dx > 8 && dx > 1.5*dy && e.cancelable) e.preventDefault();
    };
    const end = (e:TouchEvent) => {
      const t=e.changedTouches[0], origin=start; start=null;
      if (!origin || !t) return;
      const dx=t.clientX-origin.x, dy=Math.abs(t.clientY-origin.y);
      if (dx >= 58 && dx >= 1.6*dy) { if(e.cancelable)e.preventDefault(); close.current(); }
    };
    const cancel = () => { start=null; };
    node.addEventListener('touchstart',begin,{passive:true});
    node.addEventListener('touchmove',move,{passive:false});
    node.addEventListener('touchend',end,{passive:false});
    node.addEventListener('touchcancel',cancel);
    return () => {
      node.removeEventListener('touchstart',begin); node.removeEventListener('touchmove',move);
      node.removeEventListener('touchend',end); node.removeEventListener('touchcancel',cancel);
    };
  }, []);
  const friend=companionFor(companionId);
  useEffect(()=>{const trigger=document.activeElement as HTMLElement|null;back.current?.focus();return ()=>trigger?.focus();},[]);
  useEffect(()=>{if(atBottom.current && list.current)list.current.scrollTop=list.current.scrollHeight;},[lines,waiting,failure]);
  return <div ref={room} className="chat-history-page" role="dialog" aria-modal="true" aria-labelledby="chat-title"
    onKeyDown={e=>{containRoyalDialogTab(e);if(e.key==='Escape')onClose();e.stopPropagation();}}>
    <header><button type="button" ref={back} aria-label="返回球桌" onClick={onClose}><RoyalIcon name="left"/>球桌</button><h2 id="chat-title">{friend.name}</h2></header>
    <div className="chat-history-list" ref={list} tabIndex={0} onScroll={e=>{const el=e.currentTarget;atBottom.current=el.scrollHeight-el.clientHeight-el.scrollTop<16;}}>
      {lines.map(line=><ChatBubble key={line.id} line={line}/>)}{waiting && <p className="chat-wait" role="status">正在输入…</p>}
      {failure && <div className="chat-failure" role="status"><span>{failure.reason}</span>
        <button type="button" onClick={()=>onSend(failure.question,true)}>重试</button></div>}
    </div>
    <form className="chat-compose" onSubmit={e=>{e.preventDefault();if(!waiting && draft.trim()){onSend(draft.trim());atBottom.current=true;setDraft('');}}}>
      <input aria-label="想对球友说什么" placeholder="说点什么…" maxLength={200} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <button type="submit" disabled={waiting || !draft.trim()}>发送</button>
    </form>
  </div>;
}
