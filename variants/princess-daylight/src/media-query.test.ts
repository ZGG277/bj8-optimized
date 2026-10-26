import { describe, expect, it, vi } from 'vitest';
import { observeMediaQuery } from './media-query';
describe('media preference across WebViews', () => {
  it('uses and disposes the legacy listener when modern EventTarget is absent', () => {
    const listener=vi.fn(), query={ matches:false, addListener:vi.fn(), removeListener:vi.fn() };
    const stop=observeMediaQuery(query, listener);
    expect(query.addListener).toHaveBeenCalledWith(listener);
    query.addListener.mock.calls[0][0](); expect(listener).toHaveBeenCalledOnce();
    stop(); expect(query.removeListener).toHaveBeenCalledWith(listener);
  });
  it('prefers modern events and tolerates a missing preference API', () => {
    const listener=vi.fn(), query={ matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn(), addListener:vi.fn() };
    const stop=observeMediaQuery(query,listener); stop();
    expect(query.removeEventListener).toHaveBeenCalledWith('change',listener);
    expect(query.addListener).not.toHaveBeenCalled();
    expect(() => observeMediaQuery(undefined, listener)()).not.toThrow();
  });
});
