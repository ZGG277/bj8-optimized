/** Official Mini Tool author relationship; never starts a dialog without a user click. */
type Result = { follow_status?: number };
type Launch = { miniToolEnv?: { buildVersion?: number | string } };
export type FollowBridge = { launchOptions?: Launch; miniTool?: {
  getLaunchOptions?: () => Promise<Launch>;
  getFollowStatus?: () => Promise<Result>;
  followAuthor?: () => Promise<Result>;
} };
export type FollowState = {
  phase: 'idle' | 'unsupported' | 'querying' | 'ready' | 'error' | 'pending' | 'blocked';
  status: number;
  notice: string;
};
const initial = (): FollowState => ({ phase: 'idle', status: -1, notice: '' });
export function createFollowController(readBridge: () => FollowBridge | undefined) {
  let state = initial();
  let api: FollowBridge['miniTool'];
  let destroyed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(state: FollowState) => void>();
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const set = (next: FollowState) => { if (!destroyed) { state = next; listeners.forEach(fn => fn(state)); } };
  const current = (id: number) => !destroyed && generation === id;
  const result = (value: Result | undefined) => {
    const status = value?.follow_status;
    if (status === 0 || status === 1 || status === 2) set({ phase: 'ready', status, notice: '' });
    else set({ phase: 'error', status: -1, notice: '暂时无法确认关注状态' });
  };
  async function query() {
    if (destroyed || !api || (state.phase !== 'idle' && state.phase !== 'error')) return;
    const id = ++generation;
    set({ phase: 'querying', status: -1, notice: '' });
    timer = setTimeout(() => {
      if (!current(id)) return;
      generation++;
      timer = undefined;
      set({ phase: 'error', status: -1, notice: '查询超时，请稍后重试' });
    }, 5000);
    try {
      const value = await api.getFollowStatus!();
      if (current(id)) { clearTimer(); result(value); }
    } catch {
      if (current(id)) { clearTimer(); result(undefined); }
    }
  }
  async function start() {
    if (destroyed || state.phase !== 'idle') return;
    const id = ++generation;
    set({ phase: 'querying', status: -1, notice: '' });
    try {
      const bridge = readBridge();
      api = bridge?.miniTool;
      if (typeof api?.getFollowStatus !== 'function' || typeof api?.followAuthor !== 'function') {
        set({ phase: 'unsupported', status: -1, notice: '' }); return;
      }
      let launch = bridge?.launchOptions;
      if (launch?.miniToolEnv?.buildVersion == null && typeof api.getLaunchOptions === 'function') {
        timer = setTimeout(() => {
          if (current(id)) { generation++; timer = undefined; set({ phase: 'unsupported', status: -1, notice: '' }); }
        }, 5000);
        launch = await api.getLaunchOptions();
      }
      if (!current(id)) return;
      clearTimer();
      const version = Number(launch?.miniToolEnv?.buildVersion);
      if (!Number.isFinite(version) || Math.floor(version / 1000) < 9510) {
        set({ phase: 'unsupported', status: -1, notice: '' }); return;
      }
      set(initial());
      await query();
    } catch {
      if (current(id)) { clearTimer(); set({ phase: 'unsupported', status: -1, notice: '' }); }
    }
  }
  async function follow() {
    if (destroyed || !api || state.phase !== 'ready' || state.status !== 0) return;
    const id = ++generation;
    set({ phase: 'pending', status: 0, notice: '' });
    // Native dialogs cannot be cancelled by JavaScript. Keep the lock after timeout,
    // including menu remounts, until the original promise settles.
    timer = setTimeout(() => {
      if (current(id)) { timer = undefined; set({ phase: 'pending', status: 0, notice: '确认尚未结束，可以先继续游戏' }); }
    }, 15000);
    try {
      const value = await api.followAuthor!();
      if (current(id)) result(value);
    } catch (error) {
      if (!current(id)) return;
      const code = Number((error as { errCode?: unknown } | null)?.errCode);
      if (code === 20002) set({ phase: 'ready', status: 0, notice: '' });
      else if (code === 15404) set({ phase: 'blocked', status: 0, notice: '今日关注提示已达上限，请改日再试' });
      else if (code === 10003) set({ phase: 'blocked', status: 0, notice: '关注确认仍在进行，可以先继续游戏' });
      else result(undefined);
    } finally { if (current(id)) clearTimer(); }
  }
  return {
    getState: () => state,
    subscribe(fn: (state: FollowState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start, retry: query, follow,
    destroy() { destroyed = true; generation++; clearTimer(); listeners.clear(); },
  };
}
let shared: ReturnType<typeof createFollowController> | undefined;
export function getFollowController() {
  if (!shared) {
    shared = createFollowController(() => (window as Window & { xhs?: FollowBridge }).xhs);
    // Persisted pages retain their single native-flow lock when restored from bfcache.
    const onHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      shared?.destroy(); shared = undefined;
      window.removeEventListener('pagehide', onHide);
    };
    window.addEventListener('pagehide', onHide);
  }
  return shared;
}
