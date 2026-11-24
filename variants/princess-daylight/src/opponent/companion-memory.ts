import { getCueBall, type BilliardsWorld } from '../physics';
import type { SettledShot } from '../match/shot-log';
import type { ShotCapture } from '../planner/review';
import type { Career } from './career';
import { customCompanionFor } from './companion-preferences';
import { COMPANIONS } from './companions';
import { recordedAccuracy, type GameMode, type PlayerSkillProfile, type ShotSkillObservation } from './model';

type Point = { x: number; z: number };
export type ShotEvidence = {
  rackId: string;
  shotId: number;
  at: number;
  companionId: string;
  mode: GameMode;
  breaking: boolean;
  angle: number;
  power: number;
  spin: ShotCapture['spin'];
  cueStart: Point | null;
  cueEnd: Point | null;
  consultedPlan?: { target: number; pocket: number; cueEnd: Point };
  inferredTarget: ShotCapture['intent'];
  legalTargets: number[];
  openNextTargets: number[];
  firstContact: SettledShot['firstContact'];
  pockets: { ball: number; pocket: number }[];
  legalPots: readonly number[];
  result: SettledShot['result'];
  foul: SettledShot['foul'];
  scoringRun: number;
  observation: ShotSkillObservation;
};

export type RememberedExchange = {
  rackId: string;
  at: number;
  question: string;
  answer: string;
  source: string;
};

export type CompanionRelationship = {
  visits: number;
  completed: number;
  lastRackId: string;
  lastFinishedRackId: string;
  lastSeenAt: number;
  exchanges: RememberedExchange[];
  practiceGoal?: { text: string; rackId: string; at: number };
  highlights: ShotEvidence[];
  greetingKeys?: string[];
};

export type CompanionMemory = {
  version: 1;
  preferredCompanionId?: string;
  friends: Record<string, CompanionRelationship>;
  shots: ShotEvidence[];
};

export const emptyCompanionMemory = (): CompanionMemory => ({ version: 1, friends: {}, shots: [] });
export const isCompanionId = (id: unknown): id is string => typeof id === 'string' && (COMPANIONS.some(friend => friend.id === id) || !!customCompanionFor(id));
const validCount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const validPoint = (point: Point | null) => point === null || !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
const validBallNumbers = (values: readonly number[]) => Array.isArray(values) && values.length <= 16
  && values.every(value => validCount(value) && value <= 15);
const validEvidence = (shot: ShotEvidence) => shot && isCompanionId(shot.companionId)
  && typeof shot.rackId === 'string' && validCount(shot.shotId) && validCount(shot.at)
  && Number.isFinite(shot.angle) && Number.isFinite(shot.power) && Number.isFinite(shot.spin?.x) && Number.isFinite(shot.spin?.y)
  && validPoint(shot.cueStart) && validPoint(shot.cueEnd) && validCount(shot.scoringRun)
  && validBallNumbers(shot.legalPots) && validBallNumbers(shot.legalTargets) && validBallNumbers(shot.openNextTargets)
  && Array.isArray(shot.pockets) && shot.pockets.length <= 16
  && typeof shot.result === 'string' && ['success', 'miss', 'unknown'].includes(shot.observation?.position);

export function readCompanionMemory(raw: string | null): CompanionMemory {
  if (raw === null) return emptyCompanionMemory();
  const data: CompanionMemory = JSON.parse(raw);
  if (data?.version !== 1 || !data.friends || Array.isArray(data.friends) || typeof data.friends !== 'object'
    || !Array.isArray(data.shots) || data.shots.length > 96 || !data.shots.every(validEvidence)
    || (data.preferredCompanionId !== undefined && !isCompanionId(data.preferredCompanionId))) {
    throw new Error('球友记忆暂时无法读取');
  }
  for (const [id, friend] of Object.entries(data.friends)) {
    if (!isCompanionId(id) || !friend || !validCount(friend.visits) || !validCount(friend.completed)
      || !validCount(friend.lastSeenAt) || typeof friend.lastRackId !== 'string' || typeof friend.lastFinishedRackId !== 'string'
      || !Array.isArray(friend.highlights) || friend.highlights.length > 4 || !friend.highlights.every(shot => validEvidence(shot) && shot.companionId === id)
      || !Array.isArray(friend.exchanges) || friend.exchanges.length > 12 || friend.exchanges.some(exchange => !exchange || typeof exchange.rackId !== 'string'
        || typeof exchange.question !== 'string' || exchange.question.length > 200 || typeof exchange.answer !== 'string' || exchange.answer.length > 160
        || typeof exchange.source !== 'string' || !validCount(exchange.at))
      || (friend.practiceGoal !== undefined && (!friend.practiceGoal || typeof friend.practiceGoal.text !== 'string'
        || typeof friend.practiceGoal.rackId !== 'string' || !validCount(friend.practiceGoal.at)))
      || (friend.greetingKeys !== undefined && (!Array.isArray(friend.greetingKeys)
        || friend.greetingKeys.length > 4 || friend.greetingKeys.some(key => typeof key !== 'string')))) {
      throw new Error('球友记忆暂时无法读取');
    }
  }
  return data;
}

function touchFriend(data: CompanionMemory, id: string, rackId: string, at: number): CompanionRelationship {
  const previous = data.friends[id] ?? {
    visits: 0, completed: 0, lastRackId: '', lastFinishedRackId: '', lastSeenAt: 0, exchanges: [], highlights: [],
  };
  return { ...previous, visits: previous.visits + Number(previous.lastRackId !== rackId), lastRackId: rackId, lastSeenAt: at };
}

export function rememberExchange(data: CompanionMemory, id: string, exchange: RememberedExchange): CompanionMemory {
  const friend = touchFriend(data, id, exchange.rackId, exchange.at);
  const text = practiceGoalFrom(exchange.question);
  if (text) friend.practiceGoal = { text, rackId: exchange.rackId, at: exchange.at };
  friend.exchanges = [...friend.exchanges, { ...exchange, question: exchange.question.slice(0, 200), answer: exchange.answer.slice(0, 160) }].slice(-12);
  return { ...data, friends: { ...data.friends, [id]: friend } };
}

export function practiceGoalFrom(question: string) {
  return question.match(/^记住[：:，,\s]*(?:我(?:下次)?想练|我(?:下次)?想改善)[：:，,\s]*(.{1,60})[。！!]?$/u)?.[1].replace(/[。！!]$/u, '');
}

export function rememberShot(data: CompanionMemory, shot: ShotEvidence): CompanionMemory {
  if (data.shots.some(existing => existing.rackId === shot.rackId && existing.shotId === shot.shotId)) return data;
  const friend = touchFriend(data, shot.companionId, shot.rackId, shot.at);
  if (highlightLabel(shot)) friend.highlights = [...friend.highlights, shot].slice(-4);
  return { ...data, shots: [...data.shots, shot].slice(-96), friends: { ...data.friends, [shot.companionId]: friend } };
}

export function rememberFinish(data: CompanionMemory, id: string, rackId: string, at: number): CompanionMemory {
  if (data.friends[id]?.lastFinishedRackId === rackId) return data;
  const friend = touchFriend(data, id, rackId, at);
  return { ...data, friends: { ...data.friends, [id]: { ...friend, completed: friend.completed + 1, lastFinishedRackId: rackId } } };
}

function cuePoint(world: BilliardsWorld): Point | null {
  const ball = getCueBall(world);
  return ball?.active ? { x: ball.x, z: ball.z } : null;
}

export function captureShotEvidence(
  context: { rackId: string; companionId: string; mode: GameMode; at: number },
  capture: ShotCapture,
  settled: SettledShot,
  world: BilliardsWorld,
  cueEnd: Point | null,
  observation: ShotSkillObservation,
  legalTargets: number[],
  openNextTargets: number[],
): ShotEvidence {
  return {
    ...context, shotId: settled.shotId, breaking: capture.breaking, angle: capture.angle,
    power: capture.power, spin: capture.spin, cueStart: cuePoint(capture.worldBefore), cueEnd,
    consultedPlan: capture.planned ? {
      target: capture.planned.candidate.target, pocket: capture.planned.candidate.pocket, cueEnd: capture.planned.cueEnd,
    } : undefined,
    inferredTarget: capture.intent, legalTargets, openNextTargets, firstContact: settled.firstContact,
    pockets: world.events.flatMap(event => event.type === 'pocket' ? [{ ball: event.ball, pocket: event.pocket }] : []),
    legalPots: settled.legalPots, result: settled.result, foul: settled.foul, scoringRun: settled.scoringRun, observation,
  };
}

export function highlightLabel(shot: ShotEvidence) {
  if (shot.foul || shot.result.startsWith('lose-8')) return null;
  if (shot.legalPots.includes(8)) return '那杆稳稳收下的黑八';
  if (shot.scoringRun >= 3) return `连进${shot.scoringRun}杆的那回`;
  if (shot.legalPots.length >= 2) return `一杆进${shot.legalPots.length}颗的好球`;
  if (shot.legalPots.length && shot.observation.position === 'success') return '进球后留得很顺的那杆';
  return null;
}

export function skillForTable(skill: PlayerSkillProfile, career: Career) {
  const recent = skill.recentAssessments ?? [];
  const accuracy = recent.length ? recent.reduce((total, rack) => ({
    attempts: total.attempts + rack.accuracyAttempts, successes: total.successes + rack.accuracySuccesses,
  }), { attempts: 0, successes: 0 }) : recordedAccuracy(skill);
  return {
    completed: career.completed, recentMatches: recent.length, accuracy,
    position: { successes: skill.positionSuccesses, attempts: skill.positionAttempts },
    fouls: { count: skill.fouls, attempts: skill.foulAttempts },
    bestRecentRun: Math.max(0, ...career.recent.map(rack => rack.bestRun)),
    confidence: skill.confidence,
  };
}

export type TableSkill = ReturnType<typeof skillForTable>;
