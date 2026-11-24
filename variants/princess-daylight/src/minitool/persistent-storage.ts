/**
 * [INPUT]: 浏览器旧存档与可选原生缓存接口。
 * [OUTPUT]: 挂载前统一读档、串行写入；保存原字节，兼容首次视角提示完成标记。
 * [POS]: 存储适配边界；不清旧存档，不更改比赛状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
export const SAVE_KEYS = [
  'princess-billiards:portraits:v1', 'princess-billiards:companion-preferences:v1',
  'princess-billiards:dialogue-memory:v1', 'princess-billiards:career:v1',
  'princess-billiards:player-skill:v3', 'princess-billiards:player-skill:v2',
  'princess-billiards:player-skill:v1', 'princess-billiards:control-layout:v3',
  'princess-billiards:learned-controls:v1', 'princess-billiards:completed-match:v1',
  'princess-billiards:first-match-guide:v1', 'princess-billiards:aim-assist:v1', 'princess-billiards:ui-theme:v1',
  'princess-billiards:first-match-progress:v1', 'princess-billiards:scene:v1',
  'princess-billiards:muted:v1',
  'princess-billiards:guide-learning:v1',
  'princess-billiards:companion-collection:v1', 'princess-billiards:match-memory-cards:v1',
  'princess-billiards:victory-praise:v1',
  'princess-billiards:view-switch-hint:v1',
];
export type SaveStore = Pick<Storage, 'getItem' | 'setItem'>;
export const COMPANION_MEMORY_KEY = 'princess-billiards:companion-memory:v1';
export type CompanionMemoryStorage = { read(): string | null; write(raw: string): Promise<boolean> };
type NativeCache = {
  getStorageInfo(): Promise<{ keys: string[] }>;
  getStorage(options: { key: string }): Promise<{ data: string | null }>;
  setStorage(options: { key: string; data: string }): Promise<unknown>;
};
type Launch = { miniToolEnv?: { buildVersion?: number | string } };
type Bridge = { launchOptions?: Launch; miniTool?: Partial<NativeCache> & { getLaunchOptions?: () => Promise<Launch> } };
let active: SaveStore | null = null;
let companionMemory: CompanionMemoryStorage | null = null;
let knownLegacyClient = false;
function legacy(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
export function gameStorage(): SaveStore | null {
  if (import.meta.env.VITE_MINITOOL !== '1' || knownLegacyClient) return legacy();
  return active;
}
export function gameCompanionMemory(): CompanionMemoryStorage | null {
  if (import.meta.env.VITE_MINITOOL === '1' && !knownLegacyClient) return companionMemory;
  const browser = legacy();
  return browser && {
    read: () => browser.getItem(COMPANION_MEMORY_KEY),
    async write(raw) { browser.setItem(COMPANION_MEMORY_KEY, raw); return true; },
  };
}
function bounded<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('存档读取超时，请重试。')), 5000);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
let retryPendingSaves: (() => Promise<void>) | null = null;
let confirmPendingSave: ((key: string) => Promise<boolean>) | null = null;
export async function confirmGameStorage(key: string) {
  if (confirmPendingSave && !(await confirmPendingSave(key))) throw Error('球友设置尚未保存，请重试。');
}
function reportSaveFailure() {
  let status = document.getElementById('minitool-save-status');
  if (!status) {
    status = document.createElement('div'); status.id = 'minitool-save-status'; status.setAttribute('role', 'alert');
    status.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px;background:#662d21;color:white;text-align:center;font:14px sans-serif';
    document.body.appendChild(status);
  }
  status.textContent = '本次进度尚未保存，请保持页面打开。';
  const retry = document.createElement('button');
  retry.textContent = '重试保存';
  retry.style.cssText = 'min-height:44px;margin-left:8px;padding:6px 12px;border:1px solid #e6c98e;border-radius:8px;background:#fff8ea;color:#664823';
  retry.onclick = () => { retry.disabled = true; void retryPendingSaves?.().then(() => { retry.disabled = false; }, () => { retry.disabled = false; }); };
  status.appendChild(retry);
}
function decodeNativeSave(key: string, data: string): string {
  // New writes wrap the exact legacy bytes in JSON. Historic/decoded string
  // values can also arrive without that wrapper; only accept known valid ones.
  try {
    const decoded: unknown = JSON.parse(data);
    return typeof decoded === 'string' ? decoded : data;
  } catch {
    const validTheme = key === 'princess-billiards:ui-theme:v1' && ['celadon', 'noir', 'neon'].includes(data);
    const completed = (key === 'princess-billiards:completed-match:v1'
      || key === 'princess-billiards:first-match-guide:v1'
      || key === 'princess-billiards:view-switch-hint:v1') && data === 'done';
    const scene = key === 'princess-billiards:scene:v1' && ['castle', 'lake'].includes(data);
    if (validTheme || completed || scene) return data;
    throw new Error(`存档格式无法读取（${key}），请保留原数据。`);
  }
}
/** Exported factory allows deterministic migration/failure tests without touching user data. */
export async function createNativeSaveStore(api: NativeCache, old: SaveStore | null, onFailure: () => void, onRecovered: () => void = () => {}) {
  const keys = (await bounded(api.getStorageInfo())).keys;
  if (!Array.isArray(keys)) throw new Error('无法确认已有存档，请重试。');
  const cache = new Map<string, string>();
  async function read(key: string) {
    const { data } = await bounded(api.getStorage({ key }));
    if (data === null || data === '') return null;
    if (typeof data !== 'string') throw new Error('存档读取不完整，请重试。');
    return decodeNativeSave(key, data);
  }
  async function write(key: string, raw: string, verify = false) {
    const result = await bounded(api.setStorage({ key, data: JSON.stringify(raw) }));
    const acknowledged = (result as { errMsg?: string } | undefined)?.errMsg === 'setStorage:ok';
    if ((verify || !acknowledged) && await read(key) !== raw) throw new Error('存档未确认，请重试。');
  }
  for (const key of SAVE_KEYS) {
    if (keys.includes(key)) {
      const value = await read(key);
      if (value !== null) cache.set(key, value);
    } else {
      let value: string | null;
      try { value = old?.getItem(key) ?? null; } catch { throw new Error('旧存档暂时无法读取，请重试。'); }
      if (value !== null) {
        await write(key, value, true);
        cache.set(key, value);
      }
    }
  }
  let memoryReadError: unknown;
  if (keys.includes(COMPANION_MEMORY_KEY)) {
    try {
      const value = await read(COMPANION_MEMORY_KEY);
      if (value !== null) cache.set(COMPANION_MEMORY_KEY, value);
    } catch (error) {
      memoryReadError = error || new Error('球友记忆读取失败');
    }
  }
  // Writes are ordered. Failed entries stay pending, so another update retries every unsaved key.
  const pending = new Map<string, string>();
  let queue = Promise.resolve();
  const retry = () => {
    queue = queue.then(async () => {
      for (const [name, raw] of pending) {
        try {
          await write(name, raw);
          if (pending.get(name) === raw) pending.delete(name);
        } catch { onFailure(); return; }
      }
      if (!pending.size) onRecovered();
    });
    return queue;
  };
  const store: SaveStore = {
    getItem: key => cache.get(key) ?? null,
    setItem(key, value) {
      if (!SAVE_KEYS.includes(key)) throw new Error('Unknown save key');
      cache.set(key, value); pending.set(key, value);
      void retry();
    },
  };
  const memory: CompanionMemoryStorage = {
    read() {
      if (memoryReadError) throw memoryReadError;
      return cache.get(COMPANION_MEMORY_KEY) ?? null;
    },
    async write(raw) {
      if (memoryReadError) return false;
      cache.set(COMPANION_MEMORY_KEY, raw);
      pending.set(COMPANION_MEMORY_KEY, raw);
      await retry();
      return !pending.has(COMPANION_MEMORY_KEY);
    },
  };
  return { store, memory, flush: () => queue, retry, async confirmed(key: string) { await queue; return !pending.has(key); } };

}
export async function prepareGameStorage() {
  if (import.meta.env.VITE_MINITOOL !== '1') return;
  knownLegacyClient = false;
  const bridge = (window as Window & { xhs?: Bridge }).xhs;
  const api = bridge?.miniTool;
  const buildVersion = (launch?: Launch) => {
    const raw = String(launch?.miniToolEnv?.buildVersion ?? '');
    const version = Number(raw);
    return /^[1-9]\d{6,}$/.test(raw) && Number.isSafeInteger(version) ? version : 0;
  };
  let version = buildVersion(bridge?.launchOptions);
  if (!version && typeof api?.getLaunchOptions === 'function') {
    try { version = buildVersion(await bounded(api.getLaunchOptions())); } catch { /* An unknown version cannot enable new memory storage. */ }
  }
  if (!version) return;
  if (Math.floor(version / 1000) < 9460) { knownLegacyClient = true; return; }
  if (!api || typeof api.getStorageInfo !== 'function' || typeof api.getStorage !== 'function' || typeof api.setStorage !== 'function') {
    throw new Error('当前客户端存档服务未就绪，请关闭后重新打开。');
  }
  const result = await createNativeSaveStore(api as NativeCache, legacy(), reportSaveFailure, () => {
    document.getElementById('minitool-save-status')?.remove();
  });
  active = result.store;
  companionMemory = result.memory;
  retryPendingSaves = result.retry;
  confirmPendingSave = result.confirmed;
}
