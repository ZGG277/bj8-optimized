import { confirmGameStorage, gameStorage } from '../minitool/persistent-storage';
import type { Crop } from '../input/portrait-crop';

export const COMPANION_PREFERENCES_KEY = 'princess-billiards:companion-preferences:v1';
export const COMPANION_LINE_LABELS = {
  opening: '开球', pot: '你进球', miss: '你失手', win: '你赢了',
} as const;
export type CompanionLine = keyof typeof COMPANION_LINE_LABELS;
export type CustomCompanion = {
  id: string;
  name: string;
  avatar?: string;
  avatarEdit?: { source: string; crop: Crop };
  avatarId: string;
  voiceId: string;
  personality?: string;
  personalityLabel?: string;
  lines: Partial<Record<CompanionLine, string>>;
};
export type CompanionPreferences = { saved: string[]; selected: string[]; custom: CustomCompanion[] };

export function readCompanionPreferences(): CompanionPreferences {
  try {
    const value = JSON.parse(gameStorage()?.getItem(COMPANION_PREFERENCES_KEY) ?? '{}');
    const ids = (list: unknown): string[] =>
      Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === 'string'))] : [];
    const custom = Array.isArray(value?.custom) ? value.custom.filter((item: CustomCompanion) =>
      item && typeof item.id === 'string' && item.id.startsWith('custom-') &&
      typeof item.name === 'string' && !!item.name.trim() &&
      typeof item.voiceId === 'string' && typeof item.avatarId === 'string' && !!item.lines
    ) as CustomCompanion[] : [];
    return { saved: ids(value?.saved ?? value?.selected), selected: ids(value?.selected), custom };
  } catch {
    return { saved: [], selected: [], custom: [] };
  }
}

export async function saveCompanionPreferences(preferences: CompanionPreferences) {
  const store = gameStorage();
  if (!store) throw Error('暂时无法保存球友设置。');
  // Older clients still read selected; keep it synchronized with the saved pool.
  const value = JSON.stringify({ ...preferences, selected: preferences.saved });
  if (new Blob([value]).size > 1_000_000) throw Error('球友照片占用空间过多，请减少照片后重试。');
  store.setItem(COMPANION_PREFERENCES_KEY, value);
  await confirmGameStorage(COMPANION_PREFERENCES_KEY);
}

let activeCompanion: CustomCompanion | undefined;
export function lockCompanionProfile(profile?: CustomCompanion) {
  activeCompanion = profile;
}
export function customCompanionFor(id?: string): CustomCompanion | undefined {
  if (!id?.startsWith('custom-')) return undefined;
  return activeCompanion?.id === id ? activeCompanion : readCompanionPreferences().custom.find(item => item.id === id);
}
export function companionVoiceId(id?: string): string | undefined {
  return customCompanionFor(id)?.voiceId ?? id;
}
export function customCompanionLine(id: string | undefined, scene: CompanionLine): string | undefined {
  const text = customCompanionFor(id)?.lines[scene];
  return typeof text === 'string' && text.trim() ? text : undefined;
}
