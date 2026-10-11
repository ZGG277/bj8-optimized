import { describe, it, expect } from 'vitest';
import { createNativeSaveStore, SAVE_KEYS } from './persistent-storage';
const key = SAVE_KEYS[0];
function fixture(values = new Map<string, string>()) {
  return { values, getStorageInfo: async () => ({ keys: [...values.keys()] }),
    getStorage: async ({ key }: { key: string }) => ({ data: values.get(key) ?? null }),
    setStorage: async ({ key, data }: { key: string; data: string }) => { values.set(key, data); } };
}
describe('native cache non-destructive upgrade', () => {
  it('copies all legacy keys byte-for-byte and leaves unknown data untouched', async () => {
    const values = new Map(SAVE_KEYS.map((key, i) => [key, `old-${i}`])); values.set('other-app', 'keep');
    const before = [...values]; const api = fixture();
    const { store } = await createNativeSaveStore(api, { getItem: key => values.get(key) ?? null, setItem: () => { throw Error('no writes during hydration'); } }, () => {});
    for (const key of SAVE_KEYS) { expect(store.getItem(key)).toBe(values.get(key)); expect(JSON.parse(api.values.get(key)!)).toBe(values.get(key)); }
    expect([...values]).toEqual(before); expect(api.values.has('other-app')).toBe(false);
  });
  it('uses existing native progress and does not overwrite it from an older local copy', async () => {
    const api = fixture(new Map([[key, JSON.stringify('{"level":61}')]]));
    const { store } = await createNativeSaveStore(api, { getItem: () => '{"level":1}', setItem() {} }, () => {});
    expect(store.getItem(key)).toBe('{"level":61}');
  });
  it.each(['celadon', 'noir', 'neon'])('reads raw and JSON-wrapped %s themes without rewriting saves', async theme => {
    const values = new Map([
      [key, '{"level":61,"matchesEvaluated":42}'],
      ['princess-billiards:ui-theme:v1', theme],
      ['princess-billiards:completed-match:v1', 'done'],
      ['princess-billiards:first-match-guide:v1', 'done'],
      ['princess-billiards:aim-assist:v1', 'false'],
      ['other-app', 'keep'],
    ]);
    for (const wrapped of [false, true]) {
      const api = fixture(new Map([...values].map(([name, raw]) => [name, wrapped ? JSON.stringify(raw) : raw])));
      const before = [...api.values];
      const { store } = await createNativeSaveStore(api, null, () => {});
      for (const [name, raw] of values) if (SAVE_KEYS.includes(name)) expect(store.getItem(name)).toBe(raw);
      expect([...api.values]).toEqual(before);
    }
  });
  it('keeps JSON writes compatible after loading an unwrapped completion flag', async () => {
    const name = 'princess-billiards:completed-match:v1';
    const api = fixture(new Map([[name, 'done']]));
    const { store, flush } = await createNativeSaveStore(api, null, () => {});
    store.setItem(name, 'done'); await flush();
    expect(api.values.get(name)).toBe(JSON.stringify('done'));
    expect((await createNativeSaveStore(api, null, () => {})).store.getItem(name)).toBe('done');
  });
  it('does not accept a malformed structured save just because it resembles a valid flag', async () => {
    const api = fixture(new Map([[key, 'done']]));
    await expect(createNativeSaveStore(api, null, () => {})).rejects.toThrow(key);
    expect(api.values.get(key)).toBe('done');
  });
  it('stops boot on a read failure instead of writing defaults', async () => {
    const api = fixture(new Map([[key, 'broken']]));
    await expect(createNativeSaveStore(api, null, () => {})).rejects.toThrow('存档格式');
    expect(api.values.get(key)).toBe('broken');
  });
  it('stops boot on a failed migration and retains legacy bytes', async () => {
    const api = fixture(); api.setStorage = async () => { throw Error('save failed'); };
    await expect(createNativeSaveStore(api, { getItem: () => 'old', setItem() { throw Error('must not write'); } }, () => {})).rejects.toThrow('save failed');
  });
  it('serializes rapid writes and retries unsaved keys after failure', async () => {
    const api = fixture(); let fail = true, failures = 0;
    const write = api.setStorage;
    api.setStorage = async options => { if (fail) throw Error('failed'); await write(options); };
    const { store, flush } = await createNativeSaveStore(api, null, () => failures++);
    store.setItem(key, 'first'); await flush(); expect(failures).toBe(1); expect(api.values.size).toBe(0);
    fail = false; store.setItem(SAVE_KEYS[1], 'another'); store.setItem(key, 'latest'); await flush();
    expect(JSON.parse(api.values.get(key)!)).toBe('latest'); expect(JSON.parse(api.values.get(SAVE_KEYS[1])!)).toBe('another');
  });
});
