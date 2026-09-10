/*
[INPUT]: 留言传输与可控父窗口/时间
[OUTPUT]: 来源、精确 origin、响应匹配、超时清理和独立入口失败的回归证据
[POS]: post-match-feedback 的通信边界单测，不启动浏览器或写数据库
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEEDBACK_CHANNEL,
  FEEDBACK_TIMEOUT_MS,
  createMatchFeedback,
  feedbackParentOrigin,
  sendMatchFeedback,
} from './post-match-feedback';

const parentOrigin = 'https://lg22l37ytz.feishuapp.com';
const search = `?feedbackParentOrigin=${encodeURIComponent(parentOrigin)}`;

describe('反馈父 origin', () => {
  it('只有配置与实际嵌入页的 referrer 精确一致才启用', () => {
    expect(feedbackParentOrigin(search, `${parentOrigin}/app/app_17b18dh5axj`)).toBe(parentOrigin);
    expect(feedbackParentOrigin(search, 'https://other.example/')).toBeNull();
    expect(feedbackParentOrigin(search, '')).toBeNull();
    expect(feedbackParentOrigin('?feedbackParentOrigin=*', parentOrigin)).toBeNull();
    expect(feedbackParentOrigin(`?feedbackParentOrigin=${parentOrigin}/path`, parentOrigin)).toBeNull();
    expect(feedbackParentOrigin('?feedbackParentOrigin=data:text/plain,ok', 'data:text/plain,ok')).toBeNull();
  });
});

describe('留言传输', () => {
  let listener: ((event: MessageEvent) => void) | undefined;
  const postMessage = vi.fn();
  const removeEventListener = vi.fn();
  const parent = { postMessage };
  let fakeWindow: { parent: unknown; location: { search: string } };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    listener = undefined;
    fakeWindow = {
      parent,
      location: { search },
    };
    vi.stubGlobal('window', {
      ...fakeWindow,
      setTimeout,
      addEventListener: (_type: string, receive: (event: MessageEvent) => void) => { listener = receive; },
      removeEventListener,
    });
    vi.stubGlobal('document', { referrer: `${parentOrigin}/app/app_17b18dh5axj` });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  function deliver(data: unknown, origin = parentOrigin, source: unknown = parent) {
    listener?.({ data, origin, source } as MessageEvent);
  }

  it('拒绝伪造来源/来源后缀/错请求/错提交，只有受信成功回执可确认已保存', async () => {
    const payload = createMatchFeedback('  PM-FEEDBACK-20260909 测试  ', 'win', 'practice');
    const settled = vi.fn();
    const promise = sendMatchFeedback(payload).then(settled);
    const request = postMessage.mock.calls[0][0];
    const result = {
      channel: FEEDBACK_CHANNEL, type: 'result', requestId: request.requestId,
      ok: true, result: { submissionId: payload.submissionId, status: 'saved' },
    };
    expect(postMessage.mock.calls[0][1]).toBe(parentOrigin);
    expect(request.payload.message).toBe('PM-FEEDBACK-20260909 测试');
    expect(Object.keys(request.payload).sort()).toEqual(
      ['gameVersion', 'message', 'mode', 'outcome', 'submissionId'],
    );
    deliver(result, `${parentOrigin}.untrusted.example`);
    deliver(result, parentOrigin, {});
    deliver({ ...result, requestId: 'wrong' });
    deliver({ ...result, result: { submissionId: 'wrong', status: 'saved' } });
    deliver({ ...result, result: { submissionId: payload.submissionId, status: 'queued' } });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    deliver(result);
    await promise;
    expect(settled).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('请求超时不假报保存，注销监听并允许保留同一 submissionId 重试', async () => {
    const payload = createMatchFeedback('网络丢包', 'loss', 'challenge');
    const first = sendMatchFeedback(payload);
    const failed = expect(first).rejects.toMatchObject({ code: 'unavailable' });
    vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS);
    await failed;
    expect(removeEventListener).toHaveBeenCalledOnce();
    const retry = sendMatchFeedback(payload);
    const request = postMessage.mock.calls[1][0];
    expect(request.payload.submissionId).toBe(payload.submissionId);
    deliver({ channel: FEEDBACK_CHANNEL, type: 'result', requestId: request.requestId,
      ok: true, result: { submissionId: payload.submissionId, status: 'already_saved' } });
    await expect(retry).resolves.toBeUndefined();
  });

  it('登录失败明确返回，不调用任何页面跳转', async () => {
    const promise = sendMatchFeedback(createMatchFeedback('test', 'loss', 'practice'));
    const request = postMessage.mock.calls[0][0];
    deliver({ channel: FEEDBACK_CHANNEL, type: 'result', requestId: request.requestId,
      ok: false, error: 'login_required' });
    await expect(promise).rejects.toMatchObject({ code: 'login_required' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('缺少桥接的独立游戏入口保守失败，不向任意 origin 发消息', async () => {
    vi.stubGlobal('document', { referrer: '' });
    await expect(sendMatchFeedback(createMatchFeedback('test', 'win', 'practice')))
      .rejects.toMatchObject({ code: 'unavailable' });
    expect(postMessage).not.toHaveBeenCalled();
  });
});
