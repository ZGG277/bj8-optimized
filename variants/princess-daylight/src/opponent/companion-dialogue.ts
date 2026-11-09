/*
[INPUT]: 双方逐杆结算记录、开局、思考和真实球路事实
[OUTPUT]: 去重、冷却与事实优先级约束的一句台词；只在UI确实展示时计入预算
[POS]: 陪练表现层适配器；不判球规、不持久化、不改变AI速度或已获赞美卡
[PROTOCOL]: 变更时更新此头部，然后检查CLAUDE.md
*/
import type { MatchState, RoundResolution, ShotFacts } from '../match/types';
import { DIALOGUE_SCENES, DIALOGUE_SETTINGS as settings, SHOT_PROGRESS_LINES } from './companion-dialogue-bank';
import { settledShot, type SettledShot } from '../match/shot-log';
import { companionVoice, voicedProgress } from './companion-voices';
import { companionMomentLine } from './companion-moments';
import { ruleLinesForShot } from './companion-instructions';
import { POCKETS, TABLE, type BilliardsWorld, type PhysicsEvent } from '../physics';
import { erfProb } from '../planner/evaluate';
import type { ShotCapture } from '../planner/review';

type SceneId = typeof DIALOGUE_SCENES[number]['id'];
export type CompanionDialogue = { id: number; text: string; sceneId: string; companionId?: string; kind?: 'rule' | 'progress' };
type ShotContext = {
  worldBefore: BilliardsWorld;
  events: readonly PhysicsEvent[];
  startedWithFreeBall: boolean;
  intent?: ShotCapture['intent'];
  executionSigma?: number;
};
type Selection = { choice: CompanionDialogue; group: string | null; shot: number; at: number; opening: boolean };
type ProgressId = keyof typeof SHOT_PROGRESS_LINES;
const runMilestones = [2, 3, 5, 7] as const;
const RARE_POT_CHANCE = 0.25;

function rarePlayerPot(record: SettledShot, context?: ShotContext): ProgressId | null {
  if (!context || context.worldBefore.shot + 1 !== record.shotId || record.breaking || !record.legalPots.length) return null;
  const { intent, executionSigma } = context;
  let rare: ProgressId | null = null;
  for (const event of context.events) {
    if (event.type !== 'pocket' || !record.legalPots.includes(event.ball)) continue;
    if (intent && event.ball === record.firstContact && event.ball === intent.target && event.pocket === intent.pocket &&
        intent.halfWidth > 0 && typeof executionSigma === 'number' && Number.isFinite(executionSigma) && executionSigma > 0 &&
        erfProb(intent.halfWidth, executionSigma) <= RARE_POT_CHANCE) return 'P_RARE_PRECISION';
    const start = context.worldBefore.balls.find(ball => ball.active && ball.number === event.ball);
    const pocket = POCKETS[event.pocket];
    if (!start || !pocket) continue;
    if (event.time - context.worldBefore.time >= 2.8 && event.speed > 0 && event.speed <= .025 * TABLE.length) {
      rare = 'P_RARE_SLOW';
    } else if (rare === null && Math.hypot(start.x - pocket.x, start.z - pocket.z) >= .82 * TABLE.length) {
      rare = 'P_RARE_LONG';
    }
  }
  return rare;
}

export function createCompanionDialogue(random: () => number = Math.random) {
  let token = 0, rematch = false, ended = false, readyDone = false, thinkingDone = false;
  let pots = 0, dry = 0, empty = 0, ordinaryCount = 0;
  const shotLog = new Map<number, SettledShot>();
  let lastEntry: SettledShot | undefined;
  let lastAt = -Infinity, lastShot = -Infinity;
  let pending: Selection | null = null;
  const scenes = new Map<string, number>(), groups = new Map<string, number>();
  const ruleVisits = new Map<string, number>();
  const spoken = new Set<string>();
  const recent: string[][] = [];
  const roll = () => { const n = random(); return Number.isFinite(n) ? Math.max(0, Math.min(.999999999, n)) : 0; };

  function choose(ids: SceneId[], companionId: string | undefined, now: number, opening = false): CompanionDialogue | null {
    // Pick facts first. A limited/high-priority scene never falls through to another lottery.
    const scene = DIALOGUE_SCENES.filter(s => ids.includes(s.id)).sort((a, b) => b.priority - a.priority)[0];
    if (!scene || ended || ordinaryCount >= settings.max_lines_per_rack - settings.reserve_terminal) return null;
    const limit = settings.semantic_limits[scene.semantic_group as keyof typeof settings.semantic_limits];
    if ((scenes.get(scene.id) ?? 0) >= scene.max_per_rack || (groups.get(scene.semantic_group) ?? 0) >= limit) return null;
    if (!opening && (now - lastAt < settings.cooldown_ms || shotLog.size - lastShot < settings.min_shot_gap)) return null;
    const custom = companionVoice(companionId)?.scenes[scene.id];
    const authored = typeof custom === 'string' ? [custom] : custom;
    const lines = (authored?.map(text => ({ text, weight: 1 })) ?? scene.lines)
      .filter(line => !spoken.has(line.text));
    if (!lines.length || roll() >= scene.probability) return null;
    const weights = lines.map(line => line.weight * (recent.some(rack => rack.includes(line.text)) ? settings.recent_line_weight_multiplier : 1));
    let position = roll() * weights.reduce((sum, weight) => sum + weight, 0), index = 0;
    while (index < lines.length - 1 && position >= weights[index]) position -= weights[index++];
    const choice = { id: ++token, text: lines[index].text, sceneId: scene.id, companionId };
    pending = { choice, group: scene.semantic_group, shot: shotLog.size, at: now, opening };
    return choice;
  }

  function progress(id: ProgressId, companionId: string | undefined, now: number, toBlackEight = false): CompanionDialogue | null {
    const available = (voicedProgress(companionVoice(companionId), id) ?? SHOT_PROGRESS_LINES[id])
      .map(text => toBlackEight ? `${text} 下一杆打黑八。` : text)
      .filter(text => !spoken.has(text));
    if (!available.length || (!id.endsWith('_LATER') && scenes.has(id))) return null;
    const text = available[Math.floor(roll() * available.length)];
    const choice = { id: ++token, text, sceneId: id, companionId, kind: 'progress' as const };
    pending = { choice, group: null, shot: shotLog.size, at: now, opening: false };
    return choice;
  }

  function reset(isRematch = false) {
    if (spoken.size) { recent.push([...spoken]); if (recent.length > settings.recent_racks) recent.shift(); }
    pending = null; shotLog.clear(); scenes.clear(); groups.clear(); spoken.clear(); ruleVisits.clear();
    pots = dry = empty = ordinaryCount = 0;
    lastEntry = undefined;
    lastShot = -Infinity; rematch = isRematch; ended = readyDone = thinkingDone = false;
  }

  function ready(companionId: string | undefined, now: number) {
    if (readyDone || ended) return null;
    readyDone = true;
    return choose([rematch ? 'REMATCH' : 'OPEN_PLAYER'], companionId, now, true);
  }

  function settle(before: MatchState, facts: ShotFacts, resolution: RoundResolution, now: number, context?: ShotContext): CompanionDialogue | null {
    if (ended || before.phase === 'finished' || facts.shotId !== resolution.shotId || shotLog.has(facts.shotId)) return null;
    const record = settledShot(before, facts, resolution, lastEntry);
    shotLog.set(facts.shotId, record);
    lastEntry = record;
    pending = null;
    const next = resolution.next;
    if (next.phase === 'finished') { ended = true; return null; } // Existing award/comfort card owns the ending.
    const foul = next.messageKey === 'foul';
    if (!foul && !['pot-continue', 'group-assigned', 'miss-turn', 'opponent-pot-turn'].includes(next.messageKey)) return null;
    const player = before.actor === 'player';
    const playerGroup = next.playerGroup;
    const objects = record.pocketed.filter(number => number >= 1 && number <= 15 && number !== 8);
    const count = record.legalPots.length;
    const previousPots = pots, previousDry = dry;
    if (player) {
      pots += count;
      if (!before.breaking) { dry = count ? 0 : dry + 1; empty = !foul && !objects.length ? empty + 1 : 0; }
    }
    const rule = ruleLinesForShot(before, facts, next);
    if (rule) {
      const occurrence = ruleVisits.get(rule.sceneId) ?? 0;
      ruleVisits.set(rule.sceneId, occurrence + 1);
      return {
        id: ++token,
        text: rule.lines[occurrence % rule.lines.length],
        sceneId: rule.sceneId,
        companionId: before.companionId,
        kind: 'rule',
      };
    }

    if (foul) return null;

    if (record.blackEightMiss) {
      const misses = [...shotLog.values()].filter(entry => entry.actor === record.actor && entry.blackEightMiss).length;
      const prefix = player ? 'P' : 'N';
      const scene: ProgressId = misses === 1 ? `${prefix}_FINAL_MISS` : misses === 2 ? `${prefix}_FINAL_MISS_2` : `${prefix}_FINAL_MISS_LATER`;
      return progress(scene, before.companionId, now);
    }

    const remaining = playerGroup === 'solid' ? facts.remainingSolids : playerGroup === 'stripe' ? facts.remainingStripes : null;
    const toBlackEight = player && remaining === 0;
    const rare = player ? rarePlayerPot(record, context) : null;
    if (rare) {
      const choice = progress(rare, before.companionId, now, toBlackEight);
      if (choice) return choice;
    }

    const milestone = runMilestones.find(run => run === record.scoringRun);
    if (milestone) {
      const choice = progress(`${player ? 'P' : 'N'}_STREAK_${milestone}`, before.companionId, now, toBlackEight);
      if (choice) return choice;
    }

    const ids: SceneId[] = [];
    const add = (id: SceneId, matches = true) => { if (matches) ids.push(id); };
    if (player && before.breaking) {
      add('P_BREAK_MULTI', count >= 2); add('P_BREAK_ONE', count === 1); add('P_BREAK_DRY', !objects.length);
    } else if (player && count > 0) {
      add('P_FIRST_POT', previousPots === 0); add('P_ONE', count === 1); add('P_TWO', count === 2); add('P_MANY', count >= 3);
      add('P_RECOVER', previousDry >= 3);
      if (context && context.worldBefore.shot + 1 === facts.shotId) {
        add('P_BALL_IN_HAND', context.startedWithFreeBall);
        for (const event of context.events) {
          if (event.type !== 'pocket' || !record.legalPots.includes(event.ball)) continue;
          const start = context.worldBefore.balls.find(ball => ball.active && ball.number === event.ball);
          const pocket = POCKETS[event.pocket];
          if (!start || !pocket) continue;
          add('P_LONG', Math.hypot(start.x - pocket.x, start.z - pocket.z) >= .6 * TABLE.length);
          add('P_SLOW', event.time - context.worldBefore.time >= 2 && event.speed >= 0 && event.speed <= .06 * TABLE.length);
        }
      }
      add('P_FINAL_READY', toBlackEight);
    } else if (player) {
      for (const n of [1, 2, 3] as const) add(`P_EMPTY_${n}`, empty === n);
    } else if (!before.breaking) {
      add('N_ONE', count === 1); add('N_MULTI', count >= 2);
      add('N_EMPTY', !objects.length && record.nextActor !== record.actor);
    }
    return choose(ids, before.companionId, now);
  }

  function thinking(companionId: string | undefined, now: number) {
    if (ended || thinkingDone || pending || now - lastAt < settings.cooldown_ms || shotLog.size - lastShot < settings.min_shot_gap
      || ordinaryCount >= settings.max_lines_per_rack - settings.reserve_terminal) return null;
    thinkingDone = true;
    const choice = { id: ++token, text: companionVoice(companionId)?.thinking ?? companionMomentLine(companionId, 'thinking'), sceneId: 'THINKING', companionId };
    pending = { choice, group: 'opponent_waiting', at: now, shot: shotLog.size, opening: false };
    return choice;
  }

  function shown(id: number, now: number) {
    if (!pending || pending.choice.id !== id || now < pending.at) return false;
    const { choice, group, opening } = pending;
    spoken.add(choice.text); scenes.set(choice.sceneId, (scenes.get(choice.sceneId) ?? 0) + 1);
    if (group) {
      groups.set(group, (groups.get(group) ?? 0) + 1);
      ordinaryCount++;
    }
    lastAt = now;
    if (!opening) lastShot = pending.shot;
    pending = null;
    return true;
  }
  return { ready, settle, thinking, shown, reset, cancel: () => { pending = null; },
    snapshot: () => ({
      shot: shotLog.size, pots, dry, empty, ordinaryCount,
      runs: { player: lastEntry?.actor === 'player' ? lastEntry.scoringRun : 0, opponent: lastEntry?.actor === 'opponent' ? lastEntry.scoringRun : 0 },
      shots: [...shotLog.values()].map(entry => ({ ...entry, pocketed: [...entry.pocketed], legalPots: [...entry.legalPots] })),
      lastAt, spoken: [...spoken], scenes: Object.fromEntries(scenes), ended,
    }) };
}
