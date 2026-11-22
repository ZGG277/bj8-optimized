import princess from '../assets/companion-player.webp';
import { gameStorage } from '../minitool/persistent-storage';

export const DEFAULT_PRINCESS = princess;
export type Portrait = { avatar?: string; name?: string };
const key = 'princess-billiards:portraits:v1';
let profiles: Record<string, Portrait> | undefined;
export function portraitFor(id: string): Portrait {
  if (!profiles) {
    try { profiles = JSON.parse(gameStorage()?.getItem(key) ?? '{}') ?? {}; }
    catch { profiles = {}; }
  }
  return profiles?.[id] ?? {};
}
export function savePortrait(id: string, profile: Portrait) {
  portraitFor(id);
  const next = { ...profiles, [id]: profile };
  const store = gameStorage();
  if (!store) throw Error('头像暂时无法保存');
  store.setItem(key, JSON.stringify(next));
  profiles = next;
}
