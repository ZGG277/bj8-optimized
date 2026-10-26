import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFollowController, type FollowBridge } from './follow-author';

// SDK stubs only: never invokes a real author relationship or consumes platform quota.
function setup(status = 0, version: number | undefined = 9510000) {
  const api = { getFollowStatus: vi.fn().mockResolvedValue({ follow_status: status }), followAuthor: vi.fn().mockResolvedValue({ follow_status: 1 }) };
  const bridge: FollowBridge = { launchOptions: { miniToolEnv: { buildVersion: version } }, miniTool: api };
  const controller = createFollowController(() => bridge);
  return { controller, api, bridge };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
afterEach(() => vi.useRealTimers());
describe('official follow controller (SDK stubs)', () => {
  it.each([0,1,2])('queries once on demand and renders status %s without a dialog', async status => {
    const {controller,api} = setup(status);
    expect(api.getFollowStatus).not.toHaveBeenCalled();
    await controller.start(); await controller.start();
    expect(controller.getState()).toEqual({phase:'ready',status,notice:''});
    expect(api.getFollowStatus).toHaveBeenCalledExactlyOnceWith();
    expect(api.followAuthor).not.toHaveBeenCalled();
    if (status) { await controller.follow(); expect(api.followAuthor).not.toHaveBeenCalled(); }
  });
  it.each([9509999, 0, NaN])('hides unsupported version %s without querying', async version => {
    const {controller,api} = setup(0,version); await controller.start();
    expect(controller.getState().phase).toBe('unsupported'); expect(api.getFollowStatus).not.toHaveBeenCalled();
  });
  it('hides absent SDK and missing methods', async () => {
    for (const bridge of [undefined, {}, {miniTool:{getFollowStatus:vi.fn()}}]) {
      const controller = createFollowController(() => bridge); await controller.start(); expect(controller.getState().phase).toBe('unsupported');
    }
  });
  it('uses asynchronous launch options when sync version is missing; otherwise hides unknown', async () => {
    const {controller,bridge,api} = setup(); delete bridge.launchOptions;
    await controller.start(); expect(api.getFollowStatus).not.toHaveBeenCalled();
    const launch = vi.fn().mockResolvedValue({ miniToolEnv: {buildVersion:'9510123'} });
    bridge.miniTool!.getLaunchOptions = launch;
    const second = createFollowController(() => bridge); await second.start();
    expect(launch).toHaveBeenCalledExactlyOnceWith(); expect(second.getState().status).toBe(0);
  });
  it('treats resolved -1 as retryable query failure, never as not-followed', async () => {
    const {controller,api} = setup(-1); await controller.start(); await controller.follow();
    expect(controller.getState().phase).toBe('error'); expect(api.followAuthor).not.toHaveBeenCalled();
    api.getFollowStatus.mockResolvedValue({follow_status:0}); await controller.retry(); expect(controller.getState().status).toBe(0);
  });
  it('ignores late timed-out queries and permits explicit retry', async () => {
    vi.useFakeTimers(); const {controller,api} = setup(); const pending=deferred<{follow_status:number}>();
    api.getFollowStatus.mockReturnValueOnce(pending.promise); const starting=controller.start();
    await vi.advanceTimersByTimeAsync(5001); expect(controller.getState().phase).toBe('error');
    api.getFollowStatus.mockResolvedValue({follow_status:2}); await controller.retry();
    pending.resolve({follow_status:0}); await starting; expect(controller.getState().status).toBe(2); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds launch option discovery and ignores its late response', async () => {
    vi.useFakeTimers(); const {controller,bridge,api}=setup(); delete bridge.launchOptions;
    const pending=deferred<{}>(); bridge.miniTool!.getLaunchOptions=()=>pending.promise; const starting=controller.start();
    await vi.advanceTimersByTimeAsync(5001); expect(controller.getState().phase).toBe('unsupported');
    pending.resolve({miniToolEnv:{buildVersion:9510000}}); await starting; expect(api.getFollowStatus).not.toHaveBeenCalled();
  });
  it('guards concurrent clicks, menu remounts, and a slow native confirmation', async () => {
    vi.useFakeTimers(); const {controller,api}=setup(); await controller.start();
    const pending=deferred<{follow_status:number}>(); api.followAuthor.mockReturnValue(pending.promise);
    const following=controller.follow(); await controller.follow();
    const unsubscribe=controller.subscribe(()=>{}); unsubscribe(); await controller.start();
    await vi.advanceTimersByTimeAsync(15001); await controller.follow();
    expect(api.followAuthor).toHaveBeenCalledExactlyOnceWith(); expect(controller.getState().phase).toBe('pending');
    expect(controller.getState().notice).toContain('继续游戏');
    pending.resolve({follow_status:1}); await following; expect(controller.getState().status).toBe(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('returns quietly after cancellation; a later explicit click can retry', async () => {
    const {controller,api}=setup(); await controller.start(); api.followAuthor.mockRejectedValueOnce({errCode:20002});
    await controller.follow(); expect(controller.getState()).toEqual({phase:'ready',status:0,notice:''});
    await controller.follow(); expect(api.followAuthor).toHaveBeenCalledTimes(2); expect(controller.getState().status).toBe(1);
  });
  it.each([15404,10003])('blocks repeat dialogs after native error %s',async errCode=>{
    const {controller,api}=setup(); await controller.start(); api.followAuthor.mockRejectedValue({errCode});
    await controller.follow(); await controller.follow(); await controller.start(); await controller.retry();
    expect(controller.getState().phase).toBe('blocked'); expect(api.followAuthor).toHaveBeenCalledTimes(1);
  });
  it.each([-1,undefined])('handles resolved follow failure %s with manual query recovery', async follow_status=>{
    const {controller,api}=setup(); await controller.start(); api.followAuthor.mockResolvedValue({follow_status});
    await controller.follow(); expect(controller.getState().phase).toBe('error'); await controller.retry(); expect(controller.getState().status).toBe(0);
  });
  it('clears timers/listeners on disposal and ignores native completion',async()=>{
    vi.useFakeTimers(); const {controller,api}=setup(); await controller.start();
    const pending=deferred<{follow_status:number}>(); api.followAuthor.mockReturnValue(pending.promise);
    const listener=vi.fn(); controller.subscribe(listener); const following=controller.follow(); controller.destroy();
    expect(vi.getTimerCount()).toBe(0); const calls=listener.mock.calls.length; pending.resolve({follow_status:1}); await following;
    expect(listener).toHaveBeenCalledTimes(calls); await controller.follow(); expect(api.followAuthor).toHaveBeenCalledTimes(1);
  });
});
