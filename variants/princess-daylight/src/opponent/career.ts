/** [INPUT]: 原规则终局及独立逐杆记录；[OUTPUT]: 资历、最近十局技术与本机排序；[POS]: 不读取卡片推测局数、不调用平台。 */
import type { SaveStore } from '../minitool/persistent-storage';
import type { MatchState } from '../match/types';
import type { SettledShot } from '../match/shot-log';

export const CAREER_KEY = 'princess-billiards:career:v1';
export type CareerMatch = { id: string; at: number; won: boolean; shots: number; scoringShots: number; legalPots: number; fouls: number; bestRun: number; maxMulti: number; skill: number };
export type Career = { version: 1; completed: number; legacyCompleted: number; recordedWins: number; recordedMatches: number; recent: CareerMatch[]; settledIds: string[] };
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const emptyCareer = (knownCompleted = 0): Career => ({ version: 1, completed: whole(knownCompleted) ? knownCompleted : 0,
  legacyCompleted: whole(knownCompleted) ? knownCompleted : 0, recordedWins: 0, recordedMatches: 0, recent: [], settledIds: [] });

export function matchTechnique(shots: readonly SettledShot[]): Omit<CareerMatch, 'id' | 'at' | 'won'> {
  let attempts = 0, scoringShots = 0, legalPots = 0, fouls = 0, run = 0, bestRun = 0, maxMulti = 0;
  const seen = new Set<number>();
  for (const shot of shots) {
    if (seen.has(shot.shotId)) continue;
    seen.add(shot.shotId);
    if (shot.actor !== 'player') { run = 0; continue; }
    attempts++;
    if (shot.foul || shot.result.startsWith('lose-8')) fouls++;
    const pots = shot.legalPots.length;
    legalPots += pots;
    if (pots) scoringShots++;
    maxMulti = Math.max(maxMulti, pots);
    // Break pots count as pots, not a continuous scoring turn. A legal final eight DOES count.
    run = !shot.breaking && pots && !shot.foul ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
    if (shot.nextActor !== 'player' && !shot.winner) run = 0;
  }
  const skill = attempts ? Math.round(40 * Math.min(bestRun, 7) / 7 + 20 * Math.min(maxMulti, 3) / 3
    + 30 * scoringShots / attempts + 10 * (1 - fouls / attempts)) : 0;
  return { shots: attempts, scoringShots, legalPots, fouls, bestRun, maxMulti, skill };
}

export function recordCareerFinish(career: Career, id: string, terminal: MatchState, shots: readonly SettledShot[], at = Date.now()): Career {
  const last = shots[shots.length - 1];
  if (!id || career.settledIds.includes(id) || terminal.phase !== 'finished' || !terminal.winner ||
      !['win-8', 'lose-8-early', 'lose-8-foul'].includes(terminal.messageKey) ||
      !last || last.winner !== terminal.winner || last.result !== terminal.messageKey ||
      !Number.isFinite(at) || at < 0 || career.completed >= Number.MAX_SAFE_INTEGER - 1) return career;
  const metrics = matchTechnique(shots);
  const entry = { ...metrics, id, at, won: terminal.winner === 'player' };
  return { ...career, completed: career.completed + 1, recordedMatches: career.recordedMatches + 1,
    recordedWins: career.recordedWins + (entry.won ? 1 : 0),
    // A real completion with no player shot still adds experience, but has no technique sample.
    recent: metrics.shots ? [...career.recent, entry].slice(-10) : career.recent,
    settledIds: [...career.settledIds, id].slice(-32) };
}

export function careerSummary(career: Career) {
  const samples = career.recent.length;
  const average = samples ? Math.round(career.recent.reduce((sum, m) => sum + m.skill, 0) / samples * 10) / 10 : null;
  const bonus = average === null ? 0 : Math.round(average * .99);
  const thresholds = [0, 1, 10, 30, 100];
  const names = ['初来球台', '初级球友', '熟练球友', '资深球友', '常驻球友'];
  let tier = 0;
  for (let i = 1; i < thresholds.length; i++) if (career.completed >= thresholds[i]) tier = i;
  return { level: names[tier], nextAt: thresholds[tier + 1] ?? null, average, bonus, samples,
    score: career.completed * 100 + bonus };
}

export function loadCareer(store: SaveStore | null, knownCompleted = 0): Career {
  const empty = emptyCareer(knownCompleted);
  try {
    const raw = JSON.parse(store?.getItem(CAREER_KEY) ?? 'null');
    if (raw?.version !== 1 || ![raw.completed, raw.legacyCompleted, raw.recordedWins, raw.recordedMatches].every(whole) ||
      raw.completed !== raw.legacyCompleted + raw.recordedMatches || raw.recordedWins > raw.recordedMatches ||
      !Array.isArray(raw.recent) || !Array.isArray(raw.settledIds)) return empty;
    const recent: CareerMatch[] = raw.recent.filter((m: CareerMatch) => m && typeof m.id === 'string' && m.id.length <= 120 &&
      Number.isFinite(m.at) && m.at >= 0 && typeof m.won === 'boolean' &&
      [m.shots, m.scoringShots, m.legalPots, m.fouls, m.bestRun, m.maxMulti, m.skill].every(whole) &&
      m.shots > 0 && m.scoringShots <= m.shots && m.fouls <= m.shots && m.bestRun <= m.shots && m.maxMulti <= 15 && m.skill <= 100).slice(-10);
    // A newer genuine count can survive through the older skill store (older app or one failed write).
    // Preserve those completions as legacy; never manufacture their technique details.
    const recovered = whole(knownCompleted) ? Math.max(0, knownCompleted - raw.completed) : 0;
    return { version: 1, completed: raw.completed + recovered, legacyCompleted: raw.legacyCompleted + recovered, recordedWins: raw.recordedWins,
      recordedMatches: raw.recordedMatches, recent,
      settledIds: raw.settledIds.filter((s: unknown) => typeof s === 'string' && s.length <= 120).slice(-32) };
  } catch { return empty; }
}
export function saveCareer(store: SaveStore | null, career: Career): boolean {
  try { if (!store) return false; store.setItem(CAREER_KEY, JSON.stringify(career)); return true; } catch { return false; }
}
export type RankSample = { id: string; label: string; completed: number; bonus: number; order: number };
/** Synthetic examples only; equal scores follow the documented first-written order. */
export function rankSamples(rows: readonly RankSample[]) {
  return [...rows].sort((a, b) => (b.completed * 100 + b.bonus) - (a.completed * 100 + a.bonus) || a.order - b.order)
    .map((row, index) => ({ ...row, rank: index + 1, score: row.completed * 100 + row.bonus }));
}
