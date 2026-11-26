/*
[INPUT]: 双方逐杆结算记录、开局、思考和真实球路事实
[OUTPUT]: 按规则和特殊球事实选必播台词，普通台词受去重和冷却约束；展示后记入预算
[POS]: 陪练表现层适配器；不判球规、只持久化有界发言记忆、不改变AI速度或已获赞美卡
[PROTOCOL]: 变更时更新此头部，然后检查CLAUDE.md
*/
import { createDialogueMemory, type SpokenLine } from './dialogue-memory';
import { VOICE_STREAK_LINES, VOICE_VARIATIONS, dialogueMotif } from './companion-voice-variations';
import type { SaveStore } from '../minitool/persistent-storage';
import type { MatchState, RoundResolution, ShotFacts } from '../match/types';
import { DIALOGUE_SCENES, DIALOGUE_SETTINGS as settings, SHOT_PROGRESS_LINES, STREAK_FALLBACK_LINES } from './companion-dialogue-bank';
import { settledShot, type SettledShot } from '../match/shot-log';
import { companionVoiceId, customCompanionLine } from './companion-preferences';
import { companionVoice, voicedProgress } from './companion-voices';
import { coreCompanion } from './core-companions';
import { companionMomentLine } from './companion-moments';
import { ruleLinesForShot } from './companion-instructions';
import { POCKETS, TABLE, type BilliardsWorld, type PhysicsEvent } from '../physics';
import { erfProb } from '../planner/evaluate';
import type { ShotCapture } from '../planner/review';
import type { ShotHighlight } from '../match/shot-highlights';
import { shotHighlightLines } from './shot-highlight-lines';

type SceneId = typeof DIALOGUE_SCENES[number]['id'];
export type CompanionDialogue = { id: number; text: string; sceneId: string; companionId?: string; kind?: 'rule' | 'progress' | 'highlight' };
type ShotContext = {
  worldBefore: BilliardsWorld;
  events: readonly PhysicsEvent[];
  startedWithFreeBall: boolean;
  intent?: ShotCapture['intent'];
  executionSigma?: number;
};
type Selection = { choice: CompanionDialogue; group: string | null; shot: number; at: number; opening: boolean; memoryLine?: SpokenLine; required?: boolean };
type ProgressId = keyof typeof SHOT_PROGRESS_LINES;
const runMilestones = [2, 3, 4, 5] as const;
const RARE_POT_CHANCE = 0.25;

function speechRhythm(companionId: string | undefined) {
  const cadence = companionVoice(companionId)?.cadence;
  if (cadence === 'quiet') return { cooldown: 18000, shotGap: 3, limit: 3, chance: .28 };
  return {
    cooldown: cadence === 'lively' ? 8500 : settings.cooldown_ms,
    shotGap: settings.min_shot_gap,
    limit: settings.max_lines_per_rack - settings.reserve_terminal,
    chance: cadence === 'lively' ? 2.1 : 1,
  };
}

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

export function createCompanionDialogue(random: () => number = Math.random, store: SaveStore | null = null) {
  const memory = createDialogueMemory(store);
  const lineFor = (text: string, scene: string, voice?: string): SpokenLine => ({ text, scene, voice: voice ?? "default", motif: dialogueMotif(scene, text) });
  let token = 0, rematch = false, ended = false, readyDone = false, thinkingDone = false;
  let pots = 0, dry = 0, empty = 0, ordinaryCount = 0;
  const shotLog = new Map<number, SettledShot>();
  let lastEntry: SettledShot | undefined;
  let lastAt = -Infinity, lastShot = -Infinity;
  let pending: Selection | null = null;
  const scenes = new Map<string, number>(), groups = new Map<string, number>();
  const ruleVisits = new Map<string, number>();
  const spoken = new Set<string>();
  
  const roll = () => { const n = random(); return Number.isFinite(n) ? Math.max(0, Math.min(.999999999, n)) : 0; };

  function choose(ids: SceneId[], companionId: string | undefined, now: number, opening = false): CompanionDialogue | null {
    // Pick facts first. A limited/high-priority scene never falls through to another lottery.
    const scene = DIALOGUE_SCENES.filter(s => ids.includes(s.id)).sort((a, b) => b.priority - a.priority)[0];
    const voice = companionVoice(companionId);
    const rhythm = speechRhythm(companionId);
    if (!scene || ended || ordinaryCount >= rhythm.limit) return null;
    const firstScore = !!voice && scene.id === 'P_FIRST_POT';
    const limit = settings.semantic_limits[scene.semantic_group as keyof typeof settings.semantic_limits];
    if ((scenes.get(scene.id) ?? 0) >= scene.max_per_rack || (groups.get(scene.semantic_group) ?? 0) >= limit) return null;
    if (!opening && !firstScore && (now - lastAt < rhythm.cooldown || shotLog.size - lastShot < rhythm.shotGap)) return null;
    const voiceId = companionVoiceId(companionId);
    const custom = (!coreCompanion(voiceId) && voiceId && VOICE_VARIATIONS[voiceId]?.[scene.id]) || voice?.scenes[scene.id];
    const authored = typeof custom === 'string' ? [custom] : custom;
    const lines = (authored?.map(text => ({ text, weight: 1 })) ?? scene.lines)
      .filter(line => !spoken.has(line.text));
    const fresh = memory.candidates(lines.map(l => lineFor(l.text, scene.id, companionId)), opening);
    const eligible = lines.filter(l => fresh.some(f => f.text === l.text));
    const probability = opening || firstScore ? 1 : Math.min(1, scene.probability * rhythm.chance);
    if (!eligible.length || roll() >= probability) return null;
    const weights = eligible.map(line => line.weight);
    let position = roll() * weights.reduce((sum, weight) => sum + weight, 0), index = 0;
    while (index < eligible.length - 1 && position >= weights[index]) position -= weights[index++];
    const choice: CompanionDialogue = { id: ++token, text: eligible[index].text, sceneId: scene.id, companionId,
      ...(firstScore ? { kind: 'progress' } : {}) };
    pending = { choice, group: scene.semantic_group, shot: shotLog.size, at: now, opening, memoryLine: lineFor(choice.text, scene.id, companionId) };
    return choice;
  }

  function progress(id: ProgressId, companionId: string | undefined, now: number): CompanionDialogue | null {
    const voice = companionVoice(companionId);
    const scoring = id.includes('_STREAK_') || id.endsWith('_NEAR_CLEAR') || id.endsWith('_EIGHT_READY');
    if (!scoring && !id.endsWith('_LATER') && scenes.has(id)) return null;
    const voiceId = companionVoiceId(companionId);
    const variant = VOICE_STREAK_LINES[voiceId ?? '']?.[id] ?? VOICE_STREAK_LINES[voice?.cadence ?? '']?.[id];
    const voiceLines = voicedProgress(voice, id);
    const authored = coreCompanion(voiceId) && voiceLines ? voiceLines : variant ? [variant] : voiceLines;
    const fresh = (lines: readonly string[]) => memory.candidates(lines.filter(text => !spoken.has(text))
      .map(text => lineFor(text, id, companionId)));
    const voiced = authored ? fresh(authored) : [];
    const staged = voiced.length ? voiced : fresh(SHOT_PROGRESS_LINES[id]);
    const available = staged.length || !id.includes('_STREAK_') ? staged :
      fresh(STREAK_FALLBACK_LINES[id.startsWith('P_') ? 'P' : 'N']);
    if (!available.length) return null;
    const text = available[Math.floor(roll() * available.length)].text;
    const choice = { id: ++token, text, sceneId: id, companionId, kind: 'progress' as const };
    pending = { choice, group: null, shot: shotLog.size, at: now, opening: false, memoryLine: lineFor(text, id, companionId) };
    return choice;
  }

  function reset(isRematch = false) {
    memory.reset();
    pending = null; shotLog.clear(); scenes.clear(); groups.clear(); spoken.clear(); ruleVisits.clear();
    pots = dry = empty = ordinaryCount = 0;
    lastEntry = undefined;
    lastShot = -Infinity; rematch = isRematch; ended = readyDone = thinkingDone = false;
  }

  function personalLine(sceneId: string, text: string, companionId: string | undefined, now: number, opening = false) {
    if (scenes.has(sceneId)) return null;
    const choice: CompanionDialogue = { id: ++token, text, sceneId, companionId, ...(opening ? {} : { kind: 'progress' }) };
    pending = { choice, group: null, at: now, shot: shotLog.size, opening };
    return choice;
  }

  function ready(companionId: string | undefined, now: number) {
    if (readyDone || ended) return null;
    memory.start();
    readyDone = true;
    const opening = rematch ? 'REMATCH' : 'OPEN_PLAYER';
    const custom = customCompanionLine(companionId, 'opening');
    return custom ? personalLine(opening, custom, companionId, now, true) : choose([opening], companionId, now, true);
  }

  function required(sceneId: string, lines: readonly string[], companionId: string | undefined, now: number, kind: 'rule' | 'highlight') {
    const occurrence = ruleVisits.get(sceneId) ?? 0;
    ruleVisits.set(sceneId, occurrence + 1);
    const candidates = memory.candidates(lines.map(text => lineFor(text, sceneId, companionId)), true);
    const selected = candidates[occurrence % candidates.length];
    const choice: CompanionDialogue = { id: ++token, text: selected.text, sceneId, companionId, kind };
    pending = { choice, group: null, at: now, shot: shotLog.size, opening: false, required: true, memoryLine: selected };
    return choice;
  }

  function settle(before: MatchState, facts: ShotFacts, resolution: RoundResolution, now: number, context?: ShotContext,
    highlight: ShotHighlight | null = null): CompanionDialogue | null {
    if (ended || before.phase === 'finished' || facts.shotId !== resolution.shotId || shotLog.has(facts.shotId)) return null;
    const record = settledShot(before, facts, resolution, lastEntry);
    shotLog.set(facts.shotId, record);
    lastEntry = record;
    pending = null;
    const next = resolution.next;
    const reactions = highlight && shotHighlightLines(highlight, before.companionId);
    const highlightScene = highlight && `SHOT_${highlight.actor}_${highlight.kind}`;
    if (next.phase === 'finished') {
      ended = true;
      return reactions && highlightScene ? required(highlightScene, reactions, before.companionId, now, 'highlight') : null;
    }
    const foul = next.messageKey === 'foul';
    if (!foul && !['pot-continue', 'group-assigned', 'miss-turn', 'opponent-pot-turn'].includes(next.messageKey)) return null;
    const player = before.actor === 'player';
    const objects = record.pocketed.filter(number => number >= 1 && number <= 15 && number !== 8);
    const count = record.legalPots.length;
    const previousPots = pots, previousDry = dry;
    if (player) {
      pots += count;
      if (!before.breaking) { dry = count ? 0 : dry + 1; empty = !foul && !objects.length ? empty + 1 : 0; }
    }
    const rule = ruleLinesForShot(before, facts, next);
    if (rule) {
      const lines = reactions ? rule.lines.map((line, index) => line + reactions[index % reactions.length]) : rule.lines;
      return required(rule.sceneId, lines, before.companionId, now, reactions ? 'highlight' : 'rule');
    }

    if (foul) return null;
    if (reactions && highlightScene) return required(highlightScene, reactions, before.companionId, now, 'highlight');

    if (record.blackEightMiss) {
      const misses = [...shotLog.values()].filter(entry => entry.actor === record.actor && entry.blackEightMiss).length;
      const prefix = player ? 'P' : 'N';
      const scene: ProgressId = misses === 1 ? `${prefix}_FINAL_MISS` : misses === 2 ? `${prefix}_FINAL_MISS_2` : `${prefix}_FINAL_MISS_LATER`;
      return progress(scene, before.companionId, now);
    }

    const remaining = record.groupAtStart === 'solid' ? facts.remainingSolids :
      record.groupAtStart === 'stripe' ? facts.remainingStripes : null;
    const prefix = player ? 'P' : 'N';
    if (record.scoringRun > 0 && remaining === 0) return progress(`${prefix}_EIGHT_READY`, before.companionId, now);
    if (record.scoringRun > 0 && remaining === 1) return progress(`${prefix}_NEAR_CLEAR`, before.companionId, now);

    const milestone = runMilestones.find(run => run === record.scoringRun);
    if (player && !before.breaking && !milestone) {
      const scene = count > 0 ? 'pot' : !objects.length ? 'miss' : null;
      const text = scene && customCompanionLine(before.companionId, scene);
      if (text) {
        const choice = personalLine(scene === 'pot' ? 'CUSTOM_POT' : 'CUSTOM_MISS', text, before.companionId, now);
        if (choice) return choice;
      }
    }
    const rare = player ? rarePlayerPot(record, context) : null;
    if (rare) {
      const choice = progress(rare, before.companionId, now);
      if (choice) return choice;
    }
    // Once the available lines for a milestone are spent, leave space instead of repeating routine praise.
    if (milestone) return progress(`${prefix}_STREAK_${milestone}`, before.companionId, now);

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
    } else if (player) {
      for (const n of [1, 2, 3] as const) add(`P_EMPTY_${n}`, empty === n);
    } else if (!before.breaking) {
      add('N_ONE', count === 1); add('N_MULTI', count >= 2);
      add('N_EMPTY', !objects.length && record.nextActor !== record.actor);
    }
    return choose(ids, before.companionId, now);
  }

  function thinking(companionId: string | undefined, now: number) {
    const voice = companionVoice(companionId);
    const rhythm = speechRhythm(companionId);
    if (voice?.cadence === 'quiet' || ended || thinkingDone || pending ||
        now - lastAt < rhythm.cooldown || shotLog.size - lastShot < rhythm.shotGap || ordinaryCount >= rhythm.limit) return null;
    thinkingDone = true;
    const selected = memory.candidates([lineFor(voice?.thinking ?? companionMomentLine(companionId, 'thinking'), 'THINKING', companionId)])[0];
    if (!selected) return null;
    const choice = { id: ++token, text: selected.text, sceneId: 'THINKING', companionId };
    pending = { choice, group: 'opponent_waiting', at: now, shot: shotLog.size, opening: false, memoryLine: selected };
    return choice;
  }

  function shown(id: number, now: number) {
    if (!pending || pending.choice.id !== id || now < pending.at) return false;
    const { choice, group, opening } = pending;
    if (pending.memoryLine) memory.shown(pending.memoryLine);
    if (pending.required) { pending = null; return true; }
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
