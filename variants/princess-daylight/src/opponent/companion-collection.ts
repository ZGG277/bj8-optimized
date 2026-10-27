import { COMPANIONS } from './companions';
import type { SaveStore } from '../minitool/persistent-storage';

export const COMPANION_COLLECTION_KEY = 'princess-billiards:companion-collection:v1';
export type CollectedCompanion = { wins: number; firstWonAt: number; lastWonAt: number };
export type CompanionCollection = { version: 1; cards: Record<string, CollectedCompanion> };
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
  } catch { /* Keep an unavailable or malformed save untouched. */ }
  return result;
}

/** Called by the existing once-per-completed-match settlement guard, only for a player win. */
export function collectCompanionWin(collection: CompanionCollection, companionId: string | undefined, now = Date.now()): { collection: CompanionCollection; reward: CompanionReward } | null {
  if (!companionId || !validId(companionId) || !Number.isFinite(now) || now < 0) return null;
  const previous = collection.cards[companionId];
  const card = { wins: Math.min(1000000, (previous?.wins ?? 0) + 1),
    firstWonAt: previous?.firstWonAt ?? now, lastWonAt: Math.max(previous?.lastWonAt ?? now, now) };
  return { collection: { version: 1, cards: { ...collection.cards, [companionId]: card } },
    reward: { companionId, isNew: !previous, wins: card.wins } };
}

export function saveCompanionCollection(store: SaveStore | null, collection: CompanionCollection): boolean {
  if (!store) return false;
  try { store.setItem(COMPANION_COLLECTION_KEY, JSON.stringify(collection)); return true; }
  catch { return false; }
}
export const collectedCompanionCount = (collection: CompanionCollection) => COMPANIONS.filter(p => collection.cards[p.id]).length;
