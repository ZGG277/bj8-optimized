import { customCompanionFor, readCompanionPreferences } from './companion-preferences';
import { portraitFor } from './player-portraits';
import { STORYBOOK_COMPANIONS } from './storybook-companions';
/** Identity is picked once per match, never per render. */
import avatar0 from '../assets/companions/shen-yubai.webp';
import avatar1 from '../assets/companions/lu-jingchen.webp';
import avatar2 from '../assets/companions/wen-xingye.webp';
import avatar3 from '../assets/companions/gu-yanchuan.webp';
import avatar4 from '../assets/companions/jiang-yueheng.webp';
import avatar5 from '../assets/companions/zhou-mubai.webp';
import avatar6 from '../assets/companions/xie-linyu.webp';
import avatar7 from '../assets/companions/pei-zhixu.webp';
import avatar8 from '../assets/companions/song-yucheng.webp';
import avatar9 from '../assets/companions/xu-qinghe.webp';
export type Companion = { id: string; name: string; avatar: string; congratulations: string };
const storybookAvatars = import.meta.glob<string>('../assets/companions/storybook/*.webp', { eager: true, import: 'default' });
export const STORYBOOK_ROSTER: readonly Companion[] = Object.entries(STORYBOOK_COMPANIONS).map(([id, role]) => ({
  id, name: role.name, avatar: storybookAvatars[`../assets/companions/storybook/${id}.webp`],
  congratulations: role.lines.goodShot,
}));
export const ORIGINAL_COMPANIONS: readonly Companion[] = [
  { id: 'shen-yubai', name: '沈予白', avatar: avatar0, congratulations: '恭喜你，这一局赢得漂亮。' },
  { id: 'lu-jingchen', name: '陆景辰', avatar: avatar1, congratulations: '恭喜你，今天的好球值得庆祝。' },
  { id: 'wen-xingye', name: '温星野', avatar: avatar2, congratulations: '你赢啦！再陪你打一局，好不好？' },
  { id: 'gu-yanchuan', name: '顾言川', avatar: avatar3, congratulations: '恭喜你，赢球的样子很耀眼。' },
  { id: 'jiang-yueheng', name: '江月珩', avatar: avatar4, congratulations: '这一局的掌声，都送给你。' },
  { id: 'zhou-mubai', name: '周慕白', avatar: avatar5, congratulations: '恭喜赢球，你的节奏越来越好了。' },
  { id: 'xie-linyu', name: '谢临屿', avatar: avatar6, congratulations: '你赢了，我心服口服。' },
  { id: 'pei-zhixu', name: '裴知序', avatar: avatar7, congratulations: '恭喜你，这份胜利属于你。' },
  { id: 'song-yucheng', name: '宋予澄', avatar: avatar8, congratulations: '漂亮！今天的赢家是你。' },
  { id: 'xu-qinghe', name: '许清和', avatar: avatar9, congratulations: '恭喜你，下一局也为你加油。' },
];
export const COMPANIONS: readonly Companion[] = [...ORIGINAL_COMPANIONS, ...STORYBOOK_ROSTER];
export function companionFor(id?: string): Companion {
  const custom = customCompanionFor(id);
  if (custom) {
    const appearance = COMPANIONS.find(companion => companion.id === custom.avatarId) ?? COMPANIONS[0];
    return { id: custom.id, name: custom.name, avatar: custom.avatar || appearance.avatar,
      congratulations: custom.lines.win || appearance.congratulations };
  }
  const base = COMPANIONS.find(companion => companion.id === id) ?? COMPANIONS[0];
  const profile = portraitFor(base.id);
  if (!profile.name && !profile.avatar) return base;
  return { ...base, name: profile.name || base.name, avatar: profile.avatar || base.avatar };
}
export function companionSelection(preferredId?: string) {
  const { selected, custom } = readCompanionPreferences();
  const valid = new Set([...COMPANIONS, ...custom].map(companion => companion.id));
  const personal = selected.filter(id => valid.has(id));
  return { personal, preferred: preferredId && valid.has(preferredId) ? preferredId : undefined };
}

/** A chosen group sets the pool for the next rack. Otherwise honor the single preference. */
export function pickCompanion(previousId?: string, rng: () => number = Math.random, preferredId?: string): Companion {
  const { personal, preferred } = companionSelection(preferredId);
  if (!personal.length && preferred) return companionFor(preferred);
  const pool = personal.length ? personal : COMPANIONS.filter(companion => companion.id !== previousId).map(companion => companion.id);
  const roll = rng();
  const index = Number.isFinite(roll) ? Math.floor(Math.max(0, Math.min(.999999999, roll)) * pool.length) : 0;
  return companionFor(pool[index]);
}
