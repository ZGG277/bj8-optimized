import { companionFor, COMPANIONS } from './companions';
import type { SaveStore } from '../minitool/persistent-storage';

export const COMPANION_COLLECTION_KEY = 'princess-billiards:companion-collection:v1';
export type CollectedCompanion = { wins: number; firstWonAt: number; lastWonAt: number };
export type EarnedPraiseCard = { id: string; companionId: string; name: string; praise: string; earnedAt: number; ordinal: number; renderVersion: 2 };
export type CompanionCollection = { version: 1; cards: Record<string, CollectedCompanion>; history?: EarnedPraiseCard[] };
export type CompanionReward = { companionId: string; isNew: boolean; wins: number };
const validId = (id: string) => COMPANIONS.some(companion => companion.id === id);
export const emptyCompanionCollection = (): CompanionCollection => ({ version: 1, cards: {} });

/** Loading never changes old saves or invents per-companion results from the total win count. */
export function loadCompanionCollection(store: SaveStore | null): CompanionCollection {
  const result = emptyCompanionCollection();
  try {
    const raw = store?.getItem(COMPANION_COLLECTION_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.cards || typeof parsed.cards !== 'object') return result;
    for (const [id, record] of Object.entries(parsed.cards)) {
      if (!validId(id) || !record || typeof record !== 'object') continue;
      const value = record as CollectedCompanion;
      if (!Number.isSafeInteger(value.wins) || value.wins < 1 || value.wins > 1000000 ||
        !Number.isFinite(value.firstWonAt) || value.firstWonAt < 0 || value.firstWonAt > 8640000000000000 ||
        !Number.isFinite(value.lastWonAt) || value.lastWonAt < value.firstWonAt || value.lastWonAt > 8640000000000000) continue;
      result.cards[id] = { wins: value.wins, firstWonAt: value.firstWonAt, lastWonAt: value.lastWonAt };
    }
    if (Array.isArray(parsed.history)) {
      const ids = new Set<string>();
      result.history = parsed.history.filter((c: EarnedPraiseCard) => {
        const valid = c && typeof c.id === 'string' && !ids.has(c.id) && validId(c.companionId) &&
          typeof c.name === 'string' && c.name.length <= 40 && typeof c.praise === 'string' &&
          Array.from(c.praise).length > 0 && Array.from(c.praise).length <= 10 &&
          Number.isSafeInteger(c.ordinal) && c.ordinal > 0 && Number.isFinite(c.earnedAt) && c.earnedAt >= 0 && c.renderVersion === 2;
        if (valid) ids.add(c.id);
        return valid;
      }).map((c: EarnedPraiseCard) => ({ id:c.id, companionId:c.companionId, name:c.name, praise:c.praise, earnedAt:c.earnedAt, ordinal:c.ordinal, renderVersion:2 }));
    }
  } catch { /* Keep an unavailable or malformed save untouched. */ }
  return result;
}

/** Called by the existing once-per-completed-match settlement guard, only for a player win. */
export function collectCompanionWin(collection: CompanionCollection, companionId: string | undefined, now = Date.now(), praise?: string): { collection: CompanionCollection; reward: CompanionReward } | null {
  if (!companionId || !validId(companionId) || !Number.isFinite(now) || now < 0) return null;
  const previous = collection.cards[companionId];
  const card = { wins: Math.min(1000000, (previous?.wins ?? 0) + 1),
    firstWonAt: previous?.firstWonAt ?? now, lastWonAt: Math.max(previous?.lastWonAt ?? now, now) };
  const ordinal = Object.values(collection.cards).reduce((sum, record) => sum + record.wins, 0) + 1;
  const history = praise && Array.from(praise).length <= 10 ? [...(collection.history ?? []), {
    id: `win-${ordinal}-${now}`, companionId, name: companionFor(companionId).name,
    praise, earnedAt: now, ordinal, renderVersion: 2 as const,
  }] : collection.history;
  return { collection: { version: 1, ...(history ? { history } : {}), cards: { ...collection.cards, [companionId]: card } },
    reward: { companionId, isNew: !previous, wins: card.wins } };
}

export function saveCompanionCollection(store: SaveStore | null, collection: CompanionCollection): boolean {
  if (!store) return false;
  try { store.setItem(COMPANION_COLLECTION_KEY, JSON.stringify(collection)); return true; }
  catch { return false; }
}
export const collectedCompanionCount = (collection: CompanionCollection) => COMPANIONS.filter(p => collection.cards[p.id]).length;
