/*
[INPUT]: 包装页指定且与实际 referrer 一致的父 origin、玩家显式提交的本局留言
[OUTPUT]: 有超时、来源与响应校验的单次留言请求；不读取身份、不保存草稿
[POS]: 产品与妙搭包装之间的窄通信边界；协议对应包装 shared/api.interface.ts
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { version } from '../package.json';
import type { GameMode } from './opponent/model';

export const FEEDBACK_CHANNEL = 'guagua-billiards:feedback:v1';
export const FEEDBACK_MAX_LENGTH = 500;
export const FEEDBACK_TIMEOUT_MS = 12_000;

export interface MatchFeedback {
  submissionId: string;
  message: string;
  outcome: 'win' | 'loss';
  mode: GameMode;
  gameVersion: string;
}

export type FeedbackErrorCode =
  | 'invalid' | 'login_required' | 'forbidden' | 'conflict' | 'rate_limited' | 'unavailable';

export const FEEDBACK_ERROR_COPY: Record<FeedbackErrorCode, string> = {
  invalid: '留言未保存，请检查内容后重试。',
  login_required: '登录后才能留言。你可以先再来一局。',
  forbidden: '当前无法提交留言。你可以先再来一局。',
  conflict: '本局已有一条留言，请直接开始下一局。',
  rate_limited: '提交有些频繁，请稍后重试，或先再来一局。',
  unavailable: '暂未确认保存。内容还在，可以重试或先再来一局。',
};

export class FeedbackSendError extends Error {
  constructor(readonly code: FeedbackErrorCode) {
    super(FEEDBACK_ERROR_COPY[code]);
    this.name = 'FeedbackSendError';
  }
}

export function feedbackParentOrigin(search: string, referrer: string): string | null {
  try {
    const configured = new URLSearchParams(search).get('feedbackParentOrigin');
    if (!configured) return null;
    const parent = new URL(configured);
    if (parent.origin !== configured || !['https:', 'http:'].includes(parent.protocol)) return null;
    if (new URL(referrer).origin !== parent.origin) return null;
    return parent.origin;
  } catch {
    return null;
  }
}

export function createMatchFeedback(message: string, outcome: 'win' | 'loss', mode: GameMode): MatchFeedback {
  return { submissionId: crypto.randomUUID(), message: message.trim(), outcome, mode, gameVersion: version };
}

/** Exported for bounded source/origin checks; arbitrary page messages cannot settle a submission. */
export function feedbackResult(
  event: Pick<MessageEvent, 'source' | 'origin' | 'data'>,
  parent: Window,
  origin: string,
  requestId: string,
  submissionId: string,
): true | FeedbackErrorCode | null {
  if (event.source !== parent || event.origin !== origin) return null;
  const data: unknown = event.data;
  if (!data || typeof data !== 'object' || !('channel' in data) || data.channel !== FEEDBACK_CHANNEL
    || !('type' in data) || data.type !== 'result'
    || !('requestId' in data) || data.requestId !== requestId || !('ok' in data)) return null;
  if (data.ok === true && 'result' in data && data.result && typeof data.result === 'object'
    && 'submissionId' in data.result && data.result.submissionId === submissionId
    && 'status' in data.result && ['saved', 'already_saved'].includes(String(data.result.status))) return true;
  if (data.ok === false && 'error' in data && typeof data.error === 'string'
    && Object.prototype.hasOwnProperty.call(FEEDBACK_ERROR_COPY, data.error)) return data.error as FeedbackErrorCode;
  return null;
}

export function sendMatchFeedback(payload: MatchFeedback): Promise<void> {
  const parent = window.parent;
  const origin = feedbackParentOrigin(window.location.search, document.referrer);
  if (parent === window || !origin) return Promise.reject(new FeedbackSendError('unavailable'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
    const receive = (event: MessageEvent) => {
      const result = feedbackResult(event, parent, origin, requestId, payload.submissionId);
      if (result === null) return;
      cleanup();
      if (result === true) resolve();
      else reject(new FeedbackSendError(result));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new FeedbackSendError('unavailable'));
    }, FEEDBACK_TIMEOUT_MS);
    window.addEventListener('message', receive);
    try {
      parent.postMessage({ channel: FEEDBACK_CHANNEL, type: 'submit', requestId, payload }, origin);
    } catch {
      cleanup();
      reject(new FeedbackSendError('unavailable'));
    }
  });
}
