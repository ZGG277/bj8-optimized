/** Career contract tests use the original eight-ball resolver, never simulated card totals. */
import { describe, expect, it } from 'vitest';
import { careerSummary, emptyCareer, loadCareer, matchTechnique, rankSamples, recordCareerFinish, saveCareer, CAREER_KEY } from './career';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import { settledShot } from '../match/shot-log';
import type { MatchState, ShotFacts } from '../match/types';
function shot(id: number, patch: Partial<ShotFacts> = {}, state: Partial<MatchState> = {}) {
  const before: MatchState = { ...beginMatch(createInitialMatchState()), phase: 'rolling', playerGroup: 'solid', breaking: false, ...state };
  const facts: ShotFacts = { shotId: id, firstContact: 1, pocketed: [1], cueScratch: false, cushionAfterFirstContact: true, remainingSolids: 5, remainingStripes: 7, ...patch };
  const result = resolveStoppedShot(before, facts); return { log: settledShot(before, facts, result), terminal: result.next };
}
const finish = (id = 99) => shot(id, { firstContact: 8, pocketed: [8], remainingSolids: 0 });
describe('career', () => {
  it('counts one real terminal only; replays, unfinished and mismatched terminal records add nothing', () => {
    const start = emptyCareer(); const f = finish(); const done = recordCareerFinish(start, 'rack', f.terminal, [f.log], 1000);
    expect(done).toMatchObject({ completed: 1, recordedMatches: 1, recordedWins: 1 });
    expect(recordCareerFinish(done, 'rack', f.terminal, [f.log])).toBe(done);
    expect(recordCareerFinish(start, 'new', shot(1).terminal, [shot(1).log])).toBe(start);
    expect(recordCareerFinish(start, 'new', f.terminal, [])).toBe(start);
    expect(recordCareerFinish(start, 'new', f.terminal, [shot(1).log])).toBe(start);
  });
  it('records genuine rule losses but never gives illegal pots technical credit', () => {
    const f = shot(1, { firstContact: 8, pocketed: [8], remainingSolids: 5 });
    const c = recordCareerFinish(emptyCareer(), 'early', f.terminal, [f.log]);
    expect(c).toMatchObject({ completed: 1, recordedWins: 0 });
    expect(c.recent[0]).toMatchObject({ skill: 0, fouls: 1, legalPots: 0 });
  });
  it('separates consecutive scoring rods from multiball and includes the legal final eight', () => {
    const logs = [shot(1, { pocketed: [1, 2] }).log, shot(2).log, finish(3).log];
    expect(matchTechnique(logs)).toMatchObject({ shots: 3, scoringShots: 3, legalPots: 4, bestRun: 3, maxMulti: 2, skill: 70 });
    expect(matchTechnique([...logs, logs[2]])).toEqual(matchTechnique(logs));
  });
  it('resets streaks on misses, opponents and breaks; foul pots add no legal score', () => {
    const logs = [shot(1).log, shot(2, { pocketed: [] }).log, shot(3).log,
      shot(4, { firstContact: 9, pocketed: [] }, { actor: 'opponent' }).log, shot(5).log,
      shot(6, { pocketed: [0, 2], cueScratch: true }).log, shot(7, { pocketed: [1, 2] }, { breaking: true, playerGroup: null }).log];
    expect(matchTechnique(logs)).toMatchObject({ shots: 6, fouls: 1, bestRun: 1, maxMulti: 2, legalPots: 5 });
  });
  it('uses the last ten eligible game means and does not invent a no-shot sample', () => {
    let c = emptyCareer();
    for (let i = 0; i < 12; i++) { const f = finish(); c = recordCareerFinish(c, `r${i}`, f.terminal, [f.log], i); }
    const opp = shot(1, { firstContact: 8, pocketed: [8], remainingStripes: 0 }, { actor: 'opponent' });
    c = recordCareerFinish(c, 'opponent-only', opp.terminal, [opp.log]);
    expect(c.completed).toBe(13); expect(c.recent).toHaveLength(10); expect(c.recent[0].id).toBe('r2');
    c = { ...c, recent: c.recent.map((m, i) => ({ ...m, skill: i === 9 ? 100 : 0 })) };
    expect(careerSummary(c)).toMatchObject({ average: 10, samples: 10, bonus: 10, score: 1310 });
  });
  it('migrates only known completed counts, keeps missing technique absent, and supports the first tier', () => {
    expect(careerSummary(loadCareer(null, 7))).toMatchObject({ level: '初级球友', samples: 0, average: null, score: 700 });
    expect(loadCareer(null, 7).legacyCompleted).toBe(7);
    expect(careerSummary(emptyCareer())).toMatchObject({ level: '初来球台', nextAt: 1, score: 0 });
    expect(careerSummary(emptyCareer(10)).level).toBe('熟练球友');
    expect(loadCareer(null, NaN).completed).toBe(0);
  });
  it('keeps experience dominant even when technique drops, with deterministic first-written ties', () => {
    const rows = rankSamples([{ id: 'a', label: 'A', completed: 10, bonus: 99, order: 1 },
      { id: 'b', label: 'B', completed: 11, bonus: 0, order: 2 }, { id: 'c', label: 'C', completed: 10, bonus: 99, order: 3 }]);
    expect(rows.map(r => r.id)).toEqual(['b', 'a', 'c']); expect(rows.map(r => r.rank)).toEqual([1, 2, 3]);
  });
  it('persists duplicate protection and validates corrupt data without deleting old storage', () => {
    const map = new Map<string, string>(); const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    const f = finish(); const done = recordCareerFinish(emptyCareer(3), 'one', f.terminal, [f.log]);
    expect(saveCareer(store, done)).toBe(true); expect(loadCareer(store, 3)).toEqual(done);
    expect(loadCareer(store, 5)).toMatchObject({ completed: 5, legacyCompleted: 4, recent: done.recent });
    const restored = loadCareer(store); expect(recordCareerFinish(restored, 'one', f.terminal, [f.log])).toBe(restored);
    store.setItem(CAREER_KEY, '{broken'); expect(loadCareer(store, 3)).toEqual(emptyCareer(3)); expect(store.getItem(CAREER_KEY)).toBe('{broken');
    expect(saveCareer({ ...store, setItem: () => { throw Error('quota'); } }, done)).toBe(false);
  });
});
