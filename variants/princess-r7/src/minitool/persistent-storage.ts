/** Native cache first; hydrate before mounting. Keep legacy keys/bytes and never clear old saves. */
export const SAVE_KEYS = [
  'princess-billiards:player-skill:v3', 'princess-billiards:player-skill:v2',
  'princess-billiards:player-skill:v1', 'princess-billiards:control-layout:v3',
  'princess-billiards:learned-controls:v1', 'princess-billiards:completed-match:v1',
  'princess-billiards:first-match-guide:v1', 'princess-billiards:aim-assist:v1', 'princess-billiards:ui-theme:v1',
];
export type SaveStore = Pick<Storage, 'getItem' | 'setItem'>;
type NativeCache = {
  getStorageInfo(): Promise<{ keys: string[] }>;
  getStorage(options: { key: string }): Promise<{ data: string | null }>;
  setStorage(options: { key: string; data: string }): Promise<unknown>;
};
type Launch = { miniToolEnv?: { buildVersion?: number } };
type Bridge = { launchOptions?: Launch; miniTool?: Partial<NativeCache> & { getLaunchOptions?: () => Promise<Launch> } };
let active: SaveStore | null = null;
function legacy(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
export function gameStorage(): SaveStore | null {
  return import.meta.env.VITE_MINITOOL === '1' && active ? active : legacy();
}
function bounded<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('存档读取超时，请重试。')), 5000);
    request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function reportSaveFailure() {
  let status = document.getElementById('minitool-save-status');
  if (!status) {
    status = document.createElement('div'); status.id = 'minitool-save-status'; status.setAttribute('role', 'alert');
    status.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px;background:#662d21;color:white;text-align:center;font:14px sans-serif';
    document.body.appendChild(status);
  }
  status.textContent = '本次进度未能保存，请保持页面打开，稍后再次操作重试。';
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
      || key === 'princess-billiards:first-match-guide:v1') && data === 'done';
    if (validTheme || completed) return data;
    throw new Error(`存档格式无法读取（${key}），请保留原数据。`);
  }
}
/** Exported factory allows deterministic migration/failure tests without touching user data. */
export async function createNativeSaveStore(api: NativeCache, old: SaveStore | null, onFailure: () => void) {
  const keys = (await bounded(api.getStorageInfo())).keys;
  if (!Array.isArray(keys)) throw new Error('无法确认已有存档，请重试。');
  const cache = new Map<string, string>();
  for (const key of SAVE_KEYS) {
    if (keys.includes(key)) {
      const { data } = await bounded(api.getStorage({ key }));
      if (typeof data !== 'string') throw new Error('存档读取不完整，请重试。');
      cache.set(key, decodeNativeSave(key, data));
    } else {
      let value: string | null;
      try { value = old?.getItem(key) ?? null; } catch { throw new Error('旧存档暂时无法读取，请重试。'); }
      if (value !== null) {
        await bounded(api.setStorage({ key, data: JSON.stringify(value) }));
        cache.set(key, value);
      }
    }
  }
  // Writes are ordered. Failed entries stay pending, so another update retries every unsaved key.
  const pending = new Map<string, string>();
  let queue = Promise.resolve();
  const store: SaveStore = {
    getItem: key => cache.get(key) ?? null,
    setItem(key, value) {
      if (!SAVE_KEYS.includes(key)) throw new Error('Unknown save key');
      cache.set(key, value); pending.set(key, value);
      queue = queue.then(async () => {
        for (const [name, raw] of pending) {
          try {
            await bounded(api.setStorage({ key: name, data: JSON.stringify(raw) }));
            if (pending.get(name) === raw) pending.delete(name);
            try { old?.setItem(name, raw); } catch { /* Native cache is already durable. */ }
          } catch { onFailure(); return; }
        }
      });
    },
  };
  return { store, flush: () => queue };
}
export async function prepareGameStorage() {
  if (import.meta.env.VITE_MINITOOL !== '1') return;
  const bridge = (window as Window & { xhs?: Bridge }).xhs;
  const api = bridge?.miniTool;
  let version = Number(bridge?.launchOptions?.miniToolEnv?.buildVersion) || 0;
  if (!version && typeof api?.getLaunchOptions === 'function') {
    try { version = Number((await bounded(api.getLaunchOptions())).miniToolEnv?.buildVersion) || 0; } catch { /* Unknown version uses documented legacy path. */ }
  }
  if (Math.floor(version / 1000) < 9460) return;
  if (!api || typeof api.getStorageInfo !== 'function' || typeof api.getStorage !== 'function' || typeof api.setStorage !== 'function') {
    throw new Error('当前客户端存档服务未就绪，请关闭后重新打开。');
  }
  active = (await createNativeSaveStore(api as NativeCache, legacy(), reportSaveFailure)).store;
}
