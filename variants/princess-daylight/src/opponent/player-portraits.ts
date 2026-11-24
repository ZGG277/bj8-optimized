import princess from '../assets/companion-player.webp';
import { confirmGameStorage, gameStorage } from '../minitool/persistent-storage';

export const DEFAULT_PRINCESS = princess;
export type Portrait = { avatar?: string; name?: string; customized?: true };
const key = 'princess-billiards:portraits:v1';
let profiles: Record<string, Portrait> | undefined;
export function portraitFor(id: string): Portrait {
  if (!profiles) {
    try { profiles = JSON.parse(gameStorage()?.getItem(key) ?? '{}') ?? {}; }
    catch { profiles = {}; }
  }
  return profiles?.[id] ?? {};
}

export function playerNickname() {
  const name = portraitFor('player').name;
  return typeof name === 'string' ? name.trim() || undefined : undefined;
}

function wasCustomized(profile: Portrait) {
  return profile.customized === true || Boolean(profile.avatar) ||
    (typeof profile.name === 'string' && Boolean(profile.name.trim()));
}

export function hasCustomizedPlayerPortrait() {
  return wasCustomized(portraitFor('player'));
}

export async function savePortrait(id: string, profile: Portrait) {
  const previous = portraitFor(id);
  const saved: Portrait = id === 'player' && (wasCustomized(previous) || wasCustomized(profile))
    ? { ...profile, customized: true } : profile;
  const next = { ...profiles, [id]: saved };
  const store = gameStorage();
  if (!store) throw Error('个人资料暂时无法保存。');
  store.setItem(key, JSON.stringify(next));
  await confirmGameStorage(key);
  profiles = next;
}
