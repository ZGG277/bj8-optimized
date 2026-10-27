import { describe, expect, it } from 'vitest';
import { COMPANIONS } from './companions';
import { collectCompanionWin, collectedCompanionCount, emptyCompanionCollection, loadCompanionCollection, saveCompanionCollection, COMPANION_COLLECTION_KEY } from './companion-collection';

function memoryStore(initial: string | null = null) {
  const entries = new Map<string, string>(initial === null ? [] : [[COMPANION_COLLECTION_KEY, initial]]);
  entries.set('princess-billiards:player-skill:v3', 'existing-skill');
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
describe('companion victory collection', () => {
  it('unlocks one card per companion and counts repeated wins without adding duplicate cards', () => {
    const first = collectCompanionWin(emptyCompanionCollection(), COMPANIONS[0].id, 100)!;
    const repeat = collectCompanionWin(first.collection, COMPANIONS[0].id, 200)!;
    const other = collectCompanionWin(repeat.collection, COMPANIONS[1].id, 300)!;
    expect(first.reward).toMatchObject({ isNew: true, wins: 1 });
    expect(repeat.reward).toMatchObject({ isNew: false, wins: 2 });
    expect(collectedCompanionCount(other.collection)).toBe(2);
    expect(other.collection.cards[COMPANIONS[0].id]).toEqual({ wins: 2, firstWonAt: 100, lastWonAt: 200 });
    expect(collectedCompanionCount(first.collection)).toBe(1);
  });
  it('persists and reloads the exact collection without changing legacy progress', () => {
    const store = memoryStore();
    const earned = collectCompanionWin(emptyCompanionCollection(), COMPANIONS[3].id, 1234)!;
    expect(saveCompanionCollection(store, earned.collection)).toBe(true);
    expect(loadCompanionCollection(store)).toEqual(earned.collection);
    expect(store.entries.get('princess-billiards:player-skill:v3')).toBe('existing-skill');
  });
  it('does not infer identities from historical wins and never rewrites a malformed save on load', () => {
    const store = memoryStore('{broken');
    expect(loadCompanionCollection(store)).toEqual(emptyCompanionCollection());
    expect(store.getItem(COMPANION_COLLECTION_KEY)).toBe('{broken');
    expect(loadCompanionCollection(null)).toEqual(emptyCompanionCollection());
    expect(collectCompanionWin(emptyCompanionCollection(), 'unknown')).toBeNull();
  });
  it('validates stored records independently and reports unavailable persistence', () => {
    const id=COMPANIONS[0].id;
    const store=memoryStore(JSON.stringify({version:1,cards:{[id]:{wins:2,firstWonAt:3,lastWonAt:4},unknown:{wins:1,firstWonAt:1,lastWonAt:2},[COMPANIONS[1].id]:{wins:-1,firstWonAt:1,lastWonAt:2}}}));
    expect(collectedCompanionCount(loadCompanionCollection(store))).toBe(1);
    expect(saveCompanionCollection(null, emptyCompanionCollection())).toBe(false);
    expect(saveCompanionCollection({getItem:()=>null,setItem:()=>{throw Error('quota');}},emptyCompanionCollection())).toBe(false);
  });
});
