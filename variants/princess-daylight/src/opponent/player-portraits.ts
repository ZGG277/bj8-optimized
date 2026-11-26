import princess from '../assets/companion-player.webp';
import ivory from '../assets/player-avatars/ivory.webp';
import willow from '../assets/player-avatars/willow.webp';
import blossom from '../assets/player-avatars/blossom.webp';
import mist from '../assets/player-avatars/mist.webp';
import orchid from '../assets/player-avatars/orchid.webp';
import honey from '../assets/player-avatars/honey.webp';
import pine from '../assets/player-avatars/pine.webp';
import magnolia from '../assets/player-avatars/magnolia.webp';
import slate from '../assets/player-avatars/slate.webp';
import plum from '../assets/player-avatars/plum.webp';
import silk from '../assets/player-avatars/silk.webp';
import modernMan from '../assets/player-avatars/modern-man.webp';
import modernWoman from '../assets/player-avatars/modern-woman.webp';
import courtPrince from '../assets/player-avatars/court-prince.webp';
import courtPrincess from '../assets/player-avatars/court-princess.webp';
import { confirmGameStorage, gameStorage } from '../minitool/persistent-storage';

export const DEFAULT_PRINCESS = princess;
export const PLAYER_AVATARS = [
  { id: 'classic', name: '经典头像', image: princess },
  { id: 'ivory', name: '玉坠短发', image: ivory },
  { id: 'willow', name: '青衣短发', image: willow },
  { id: 'blossom', name: '桃色双辫', image: blossom },
  { id: 'mist', name: '蓝衣发带', image: mist },
  { id: 'orchid', name: '紫花发簪', image: orchid },
  { id: 'honey', name: '琥珀衣领', image: honey },
  { id: 'pine', name: '松纹发冠', image: pine },
  { id: 'magnolia', name: '玉兰花簪', image: magnolia },
  { id: 'slate', name: '蓝衣圆镜', image: slate },
  { id: 'plum', name: '中式 · 紫花发簪', image: plum },
  { id: 'silk', name: '中式 · 蓝发束带', image: silk },
  { id: 'modern-man', name: '现代 · 绿衬衫', image: modernMan },
  { id: 'modern-woman', name: '现代 · 橙开衫', image: modernWoman },
  { id: 'court-prince', name: '欧式古典 · 王子', image: courtPrince },
  { id: 'court-princess', name: '欧式古典 · 公主', image: courtPrincess },
] as const;
export type PlayerAvatar = typeof PLAYER_AVATARS[number];
export const PLAYER_AVATAR_PAIRS = [
  { style: '中式', avatars: ['silk', 'plum'] },
  { style: '现代', avatars: ['modern-man', 'modern-woman'] },
  { style: '欧式古典', avatars: ['court-prince', 'court-princess'] },
] as const satisfies ReadonlyArray<{ style: string; avatars: readonly [PlayerAvatar['id'], PlayerAvatar['id']] }>;
export type Portrait = {
  avatar?: string;
  avatarPreset?: PlayerAvatar['id'];
  avatarPhoto?: number;
  photos?: string[];
  name?: string;
  nicknames?: string[];
  customized?: true;
};
const key = 'princess-billiards:portraits:v1';
let profiles: Record<string, Portrait> | undefined;
export function portraitFor(id: string): Portrait {
  if (!profiles) {
    try { profiles = JSON.parse(gameStorage()?.getItem(key) ?? '{}') ?? {}; }
    catch { profiles = {}; }
  }
  const profile = profiles?.[id] ?? {};
  if (id !== 'player') return profile;
  const preset = PLAYER_AVATARS.find(choice => choice.id === profile.avatarPreset);
  const storedPhoto = Array.isArray(profile.photos) && profile.avatarPhoto !== undefined
    ? profile.photos[profile.avatarPhoto] : undefined;
  const avatar = preset?.image ?? storedPhoto;
  return avatar ? { ...profile, avatar } : profile;
}

export function playerNickname() {
  const name = portraitFor('player').name;
  return typeof name === 'string' ? name.trim() || undefined : undefined;
}

function wasCustomized(profile: Portrait) {
  return profile.customized === true || Boolean(profile.avatar || profile.avatarPreset) || profile.avatarPhoto !== undefined ||
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
