import { useCallback, useEffect, useRef, useState } from 'react';
import { TableAvatar } from './TableAvatar';
import { COMPANIONS, companionFor } from '../opponent/companions';
import { readCompanionPreferences } from '../opponent/companion-preferences';
import { highlightLabel, practiceGoalFrom, type CompanionRelationship, type RememberedExchange, type TableSkill } from '../opponent/companion-memory';
import { addressPlayer, callPlayerByName } from '../opponent/player-address';
import { playerNickname } from '../opponent/player-portraits';
import { shortSpeech } from '../opponent/short-speech';
import { storybookCompanion } from '../opponent/storybook-companions';
import type { Brief } from '../opponent/table-coach';
import { aiBridge, askTableFriend, chatFailure, localTableAnswer, storybookReply, TABLE_SOURCE, type Exchange, type TableConversation } from '../minitool/table-chat';
import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { RoyalIcon } from './RoyalIcon';

export type TableChatLine = { id: number; side: 'player' | 'opponent'; text: string; companionId?: string; source?: string; requestId?: string; openingReminder?: true };
const READING_MS = 1600;

export function useTableChat() {
  const [lines, setLines] = useState<TableChatLine[]>([]);
  const [live, setLive] = useState<TableChatLine | null>(null);
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

  const say = useCallback((message: Omit<TableChatLine, 'id'>, showOnTable = true) => {
    const authored = message.side === 'opponent' && !message.source && !message.openingReminder;
    const nickname = authored ? playerNickname() : undefined;
    const body = authored ? addressPlayer(message.text, message.companionId, nickname) : message.text;
    const text = callPlayerByName(body, nickname);
    const line = { ...message, text, id: ++sequence.current };
    setLines(previous => [...previous, line]);
    if (showOnTable) {
      const preview = !authored ? body : storybookCompanion(message.companionId) ? storybookReply(body) : shortSpeech(body);
      setLive({ ...line, text: callPlayerByName(preview, nickname, body.includes('你')) });
    }
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
  const showOpeningReminder = useCallback((text: string, companionId?: string) => {
    say({ side: 'opponent', text, companionId, openingReminder: true });
  }, [say]);
  const dismissOpeningReminder = useCallback(() => {
    setLive(current => current?.openingReminder ? null : current);
  }, []);

  const reset = useCallback(() => {
    invalidate(); exchanges.current = []; setFailure(null);
    setWaiting(false); setLines([]); setLive(null);
  }, [invalidate]);

  async function send(question: string, brief: Brief, context: TableConversation, onRemember: (id: string, exchange: RememberedExchange) => void, retry = false) {
    if (busy.current || !question.trim() || (retry && failure?.question !== question)) return;
    const token = ++request.current;
    busy.current = true;
    setWaiting(true);
    setFailure(null);
    if (!retry) say({ side: 'player', text: question });
    const started = performance.now();
    const conversation = { ...context, nickname: playerNickname() };
    let received = false;
    const local = () => {
      const answer = localTableAnswer(question, brief, context);
      if (!answer) return false;
      const addressed = addressPlayer(answer, brief.roleId, conversation.nickname);
      const line = storybookCompanion(brief.roleId) ? storybookReply(addressed, '这杆先看清，再慢慢打。') : shortSpeech(addressed);
      receive({ question, answer: callPlayerByName(line, conversation.nickname, true), source: TABLE_SOURCE });
      return true;
    };
    function receive(reply: Exchange) {
      if (request.current !== token || received) return;
      received = true;
      window.clearTimeout(deadline.current);
      delivery.current = window.setTimeout(() => {
        if (request.current !== token) return;
        busy.current = false; setWaiting(false);
        exchanges.current.push(reply);
        onRemember(brief.roleId, { rackId: context.rackId, at: Date.now(), question, answer: reply.answer, source: reply.source });
        say({ side: 'opponent', text: reply.answer, companionId: brief.roleId, source: reply.source, requestId: reply.requestId });
      }, Math.max(0, READING_MS - (performance.now() - started)));
    }
    function fail(error: unknown) {
      if (request.current !== token || received) return;
      const reason = chatFailure(error);
      if (!reason.includes('AI_CONTENT_BLOCKED') && local()) return;
      received = true;
      window.clearTimeout(deadline.current);
      busy.current = false;
      setWaiting(false);
      setLive(current => current?.side === 'player' ? null : current);
      setFailure({ question, reason });
    }
    try {
      if (practiceGoalFrom(question) && local()) return;
      const bridge = aiBridge();
      if (!bridge?.createModel) { fail('NO_AI_BRIDGE'); return; }
      deadline.current = window.setTimeout(() => fail('AI_TIMEOUT'), 45000);
      const tableLines = lines.filter(line => line.companionId === brief.roleId && !line.source && !line.openingReminder).slice(-4).map(line => line.text);
      receive(await askTableFriend(bridge, brief, exchanges.current, question, tableLines, conversation));
    } catch (error) { fail(error); }
  }
  return { lines, live, waiting, failure, send, automatic, showOpeningReminder, dismissOpeningReminder, reset, dismissFailure: () => setFailure(null) };
}

function ChatBubble({line}: {line:TableChatLine}) {
  const player=line.side==='player';
  return <div key={line.id} className={'chat-row '+line.side} data-source={line.source} data-request-id={line.requestId}>
    <TableAvatar id={player ? 'player' : line.companionId}/>
    <div className="table-chat-bubble">
      <p>{line.text}{line.source === TABLE_SOURCE && <small>{TABLE_SOURCE}</small>}</p>
    </div>
  </div>;
}
export function ChatFloat({line}: {line:TableChatLine}) {
  return <div key={line.id} className="chat-float" role="status" data-opening-reminder={line.openingReminder}><ChatBubble line={line}/></div>;
}
type MemoryPanel = {
  relationship?: CompanionRelationship;
  skill: TableSkill;
  status: 'ready' | 'saving' | 'unsaved' | 'unavailable' | 'unreadable';
  preferredId?: string;
  onPreferred: (id: string) => void;
  onClear: () => void;
  onRetry: () => void;
  rackId: string;
  companionId?: string;
};

export function ChatMemory({ relationship, skill, status, preferredId, onPreferred, onClear, onRetry, rackId, companionId }: MemoryPanel) {
  const [confirming, setConfirming] = useState(false);
  const nickname = playerNickname();
  const previous = relationship?.exchanges.filter(exchange => exchange.rackId !== rackId).slice(-4) ?? [];
  return <details className="chat-memory">
    <summary>球友记忆与球技</summary>
    <div className="chat-memory-content">
      {!readCompanionPreferences().selected.length && <label className="chat-next-companion">以后陪打
        <select aria-label="以后陪打" value={preferredId ?? ''} onChange={event => onPreferred(event.target.value)}>
          <option value="">随机球友</option>
          {COMPANIONS.map(friend => <option key={friend.id} value={friend.id}>{companionFor(friend.id).name}</option>)}
        </select>
      </label>}
      <section aria-label="这位球友的记忆">
        <h3>共同经历</h3>
        <p>{relationship ? `一起打过或聊过 ${relationship.visits} 局，完成 ${relationship.completed} 局` : '打过一杆或聊过一次，就会留下共同记录。'}</p>
        {relationship?.practiceGoal
          ? <p>你想练的动作 · {relationship.practiceGoal.text}</p>
          : <p>可以在聊天里说「记住我想练低杆」。</p>}
        {relationship?.highlights.length ? <ul className="chat-memory-highlights">{relationship.highlights.slice(-3).reverse().map(shot =>
          <li key={`${shot.rackId}:${shot.shotId}`}>{highlightLabel(shot)}</li>)}</ul> : null}
        {previous.length > 0 && <details className="chat-past-exchanges">
          <summary>以前聊过</summary>
          {previous.map((exchange, index) => <div key={`${exchange.rackId}:${exchange.at}:${index}`}>
            <p><strong>你</strong> {exchange.question}</p><p><strong>球友</strong> {addressPlayer(exchange.answer, companionId, nickname)}</p>
          </div>)}
        </details>}
        {relationship && (confirming
          ? <div className="chat-memory-confirm">
            <span>清除与这位球友的跨局记录？</span>
            <button type="button" onClick={() => { onClear(); setConfirming(false); }}>清除</button>
            <button type="button" onClick={() => setConfirming(false)}>取消</button>
          </div>
          : <button type="button" className="chat-memory-clear" onClick={() => setConfirming(true)}>清除这位球友的记忆</button>)}
      </section>
      <section aria-label="共享球技档案">
        <h3>你的球技档案</h3>
        <dl>
          <div><dt>可评估的进攻杆</dt><dd>{skill.accuracy.attempts ? `${skill.accuracy.successes}/${skill.accuracy.attempts} 进球` : '待积累'}</dd></div>
          <div><dt>进球后留有好打路线</dt><dd>{skill.position.attempts ? `${skill.position.successes}/${skill.position.attempts} 杆` : '待积累'}</dd></div>
          <div><dt>最近完整局最高连杆</dt><dd>{skill.bestRecentRun ? `${skill.bestRecentRun} 杆` : '待积累'}</dd></div>
          {skill.fouls.attempts > 0 && <div><dt>犯规</dt><dd>{skill.fouls.count}/{skill.fouls.attempts} 杆</dd></div>}
        </dl>
      </section>
      {status === 'saving' && <p role="status">正在保存记忆…</p>}
      {status === 'unsaved' && <p role="status">记忆尚未保存。<button type="button" onClick={onRetry}>重试保存</button></p>}
      {status === 'unavailable' && <p role="status">这次打开只在当前页面记忆。</p>}
      {status === 'unreadable' && <p role="status">记忆读取失败。原记录已保留，请重新打开小工具。</p>}
    </div>
  </details>;
}

export function TalkButton({ disabled, expanded, onClick }: { disabled: boolean; expanded: boolean; onClick: () => void }) {
  return <button type="button" className="talk-to-friend" data-control-content-hold="chat"
    aria-label="和球友聊天" aria-expanded={expanded} disabled={disabled} onClick={onClick}>
    <svg className="chat-glyph" aria-hidden="true" viewBox="0 0 32 32"><path d="M5 4.5C9 2 22 2 26.5 6.5c4 4.2 3.1 12.2-.7 15.8-3.2 3.1-10 3.8-14.5 2.6L4 29l1.4-7.6C1.3 18 1.1 8.7 5 4.5Z"/></svg>
    <span aria-hidden="true">聊</span>
  </button>;
}

export function QuickChat({ input, waiting, onSend, onClose }: {
  input: React.RefObject<HTMLInputElement>; waiting: boolean; onSend: (text: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const composing = useRef(false);
  return <div className="chat-float quick-chat">
    <form className="chat-row player quick-chat-form" aria-label="和球友聊两句"
      onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      }}
      onSubmit={e => { e.preventDefault(); if (!composing.current && !waiting && draft.trim()) onSend(draft.trim()); }}>
      <TableAvatar id="player"/>
      <div className="table-chat-bubble quick-chat-bubble">
        <input ref={input} aria-label="快捷输入" placeholder="说点什么…" maxLength={200} enterKeyHint="send"
          value={draft} onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}/>
        <button className="quick-chat-send" type="submit" disabled={waiting || !draft.trim()}>发送</button>
        <button className="quick-chat-close" type="button" aria-label="收起快捷输入" onClick={onClose}><RoyalIcon name="close"/></button>
      </div>
    </form>
  </div>;
}
