/*
[INPUT]: 本局胜负/模式与开始下一局动作；通过 post-match-feedback 提交有限留言
[OUTPUT]: 可跳过的局后卡片，保留失败内容、同键重试、发送中/成功/失败明确状态
[POS]: 结束覆层展示组件；不收集额外身份，不把网络等待接入游戏状态机
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useRef, useState } from 'react';
import type { GameMode } from '../opponent/model';
import {
  createMatchFeedback,
  FEEDBACK_MAX_LENGTH,
  FeedbackSendError,
  sendMatchFeedback,
  type MatchFeedback,
} from '../post-match-feedback';

interface PostMatchFeedbackProps {
  outcome: 'win' | 'loss';
  mode: GameMode;
  onContinue: () => void;
}

export function PostMatchFeedback({ outcome, mode, onContinue }: PostMatchFeedbackProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const payload = useRef<MatchFeedback | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const submit = async () => {
    if (pending.current || status === 'saved' || !message.trim()) return;
    pending.current = true;
    setStatus('sending');
    setError('');
    try {
      // Keep the first payload after a timeout: an earlier request may already have saved it.
      payload.current ??= createMatchFeedback(message, outcome, mode);
      await sendMatchFeedback(payload.current);
      if (mounted.current) setStatus('saved');
    } catch (failure) {
      if (mounted.current) {
        setStatus('error');
        setError(failure instanceof FeedbackSendError ? failure.message : '暂未确认保存，请重试或先再来一局。');
      }
    } finally {
      pending.current = false;
    }
  };

  if (!open) {
    return (
      <section className="finish-actions" aria-label="本局结束操作">
        <button type="button" data-control-tip="new-match" onClick={onContinue}>再来一局</button>
        <button
          type="button"
          className="feedback-secondary"
          aria-expanded="false"
          aria-controls="match-feedback-panel"
          onClick={() => setOpen(true)}
        >留言</button>
      </section>
    );
  }

  return (
    <section
      id="match-feedback-panel"
      className="match-feedback"
      aria-label="本局留言"
      data-feedback-state={status}
    >
      {status === 'saved' ? (
        <p className="feedback-success" role="status">留言已保存，谢谢你！</p>
      ) : (
        <>
          <label htmlFor="match-feedback-message">这局打得怎么样？</label>
          <p id="match-feedback-privacy" className="feedback-hint">
            吐槽、建议都欢迎，最多 500 字。仅应用管理者查看，请勿填写联系方式等隐私。
          </p>
          <textarea
            id="match-feedback-message"
            aria-describedby="match-feedback-privacy match-feedback-count"
            placeholder="哪里不顺手，或者想加点什么？（选填）"
            value={message}
            maxLength={FEEDBACK_MAX_LENGTH}
            readOnly={status === 'sending' || payload.current !== null}
            onChange={event => setMessage(event.target.value)}
            rows={3}
          />
          <small id="match-feedback-count" className="feedback-count">{message.length} / {FEEDBACK_MAX_LENGTH}</small>
          {status === 'sending' && <p className="feedback-hint" role="status">正在发送… 可以先开始下一局。</p>}
          {status === 'error' && <p className="feedback-error" role="alert">{error}</p>}
        </>
      )}
      <div className="feedback-actions">
        {status !== 'saved' && (
          <button
            type="button"
            className="feedback-submit"
            disabled={status === 'sending' || !message.trim()}
            onClick={submit}
          >{status === 'sending' ? '发送中…' : status === 'error' ? '重试提交' : '提交留言'}</button>
        )}
        <button
          type="button"
          data-control-tip="new-match"
          className="feedback-continue"
          onClick={onContinue}
        >再来一局</button>
      </div>
    </section>
  );
}
