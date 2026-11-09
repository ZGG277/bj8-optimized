/*
[INPUT]: 依赖 physics 确定性仿真、planner/candidates 几何候选；接收当前世界、合法球与严格仿真预算
[OUTPUT]: 对外输出已验证的理想进攻/友好留球候选；执行另采一次误差，回退优先清晰合法首碰
[POS]: 对手 AI 纯策略层；以有界确定性仿真替代通用高预算走位搜索
[PROTOCOL]: 候选、评分或预算变化时同步更新 tactical-shot.test.ts 与 opponent/CLAUDE.md
*/
import {
  getCueBall,
  getPocketAimWindow,
  cloneWorld,
  isCueBallPocketed,
  POCKETS,
  TABLE,
  pocketedThisShot,
  simulateUntilStop,
  strikeCueBall,
  type BilliardsWorld,
} from '../physics';
import { factsFromWorld } from '../match/shot-facts';
import { generateCandidates, type ShotCandidate } from '../planner/candidates';

export type TacticalSearchConfig = {
  allowSafety: boolean;
  opportunityChance?: number;
  playerLegal?: number[];
  candidateLimit: number;
  simulationLimit: number;
  followUpWeight: number;
  alternativeChance: number;
};

export type AggressiveFallback = {
  angle: number;
  power: number;
  target: number;
  pocket: number;
};

export type TacticalShotResult = {
  shot: ShotCandidate | null;
  simulations: number;
};

type VerifiedShot = {
  candidate: ShotCandidate;
  endWorld: BilliardsWorld;
  score: number;
};

const SPIN_VARIANTS = [
  { spin: { x: 0, y: 0 }, powerDelta: 0 },
  { spin: { x: -0.35, y: 0 }, powerDelta: 6 },
  { spin: { x: 0.35, y: 0 }, powerDelta: 4 },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 入门谢不赢在无可验证直接进球线时，仍选择一个目标球→袋口的进攻意图。
 * 路径可能被挡住、因而失误或犯规，但不会为了夺回球权而主动做安全球。
 */
export function planAggressiveFallback(
  world: BilliardsWorld,
  legal: number[],
): AggressiveFallback | null {
  const cue = getCueBall(world);
  if (!cue?.active) return null;
  let best: (AggressiveFallback & { score: number }) | null = null;

  for (const target of world.balls) {
    if (!target.active || !legal.includes(target.number)) continue;
    for (const pocket of POCKETS) {
      const mouth = getPocketAimWindow(pocket).center;
      const pocketDx = mouth.x - target.x;
      const pocketDz = mouth.z - target.z;
      const pocketDistance = Math.hypot(pocketDx, pocketDz);
      if (pocketDistance === 0) continue;
      const ghostX = target.x - (pocketDx / pocketDistance) * TABLE.ballRadius * 2;
      const ghostZ = target.z - (pocketDz / pocketDistance) * TABLE.ballRadius * 2;
      if (Math.abs(ghostX) > TABLE.width / 2 || Math.abs(ghostZ) > TABLE.length / 2) continue;
      const cueDistance = Math.hypot(ghostX - cue.x, ghostZ - cue.z);
      if (cueDistance === 0) continue;
      const score = cueDistance + pocketDistance;
      if (best && best.score <= score) continue;
      best = {
        angle: Math.atan2(ghostX - cue.x, -(ghostZ - cue.z)),
        power: clamp(35 + (cueDistance + pocketDistance) * 15, 38, 78),
        target: target.number,
        pocket: pocket.index,
        score,
      };
    }
  }

  if (!best) return null;
  const { score: _score, ...shot } = best;
  return shot;
}

/** Cheap fallback: prefer a clear legal center contact over knowingly shooting through a blocker.
 * This is geometric, not a guaranteed legal result; cushion and scratch rules still apply.
 */
export function planClearContactFallback(world: BilliardsWorld, legal: number[]): AggressiveFallback | null {
  const cue = getCueBall(world);
  if (!cue?.active) return null;
  const candidates = world.balls.filter(ball => ball.active && legal.includes(ball.number))
    .sort((a, b) => Math.hypot(a.x - cue.x, a.z - cue.z) - Math.hypot(b.x - cue.x, b.z - cue.z));
  for (const target of candidates) {
    const dx = target.x - cue.x, dz = target.z - cue.z;
    const squared = dx * dx + dz * dz;
    if (squared <= 0) continue;
    const blocked = world.balls.some(ball => {
      if (!ball.active || ball.number === 0 || ball.number === target.number) return false;
      const t = ((ball.x - cue.x) * dx + (ball.z - cue.z) * dz) / squared;
      return t > 0 && t < 1 && Math.hypot(ball.x - cue.x - t * dx, ball.z - cue.z - t * dz) < TABLE.ballRadius * 2.1;
    });
    if (!blocked) return { angle: Math.atan2(dx, -dz), power: 52, target: target.number, pocket: -1 };
  }
  return null;
}

function candidateEase(candidate: ShotCandidate): number {
  return (
    Math.log1p(candidate.tolerance * 1000) * 1.35 -
    candidate.cutAngle * 0.85 -
    (candidate.cueDistance + candidate.pocketDistance) * 0.14
  );
}

/** Protect clean, forgiving routes and short straight balls waiting at a pocket. */
export function isObviousPot(candidate: Pick<ShotCandidate, 'cutAngle' | 'tolerance' | 'cueDistance' | 'pocketDistance'>): boolean {
  const distance = candidate.cueDistance + candidate.pocketDistance;
  return candidate.cutAngle <= .62 && distance <= 1.65 && candidate.tolerance >= .012
    || candidate.cutAngle <= .38 && candidate.pocketDistance <= .28 && distance <= 1.45 && candidate.tolerance >= .006;
}

function comfortableLeave(end: BilliardsWorld, opponentLegal: number[], playerLegal: number[]): number {
  const facts = factsFromWorld(end);
  if (facts.cueScratch || facts.firstContact === null || !opponentLegal.includes(facts.firstContact) ||
      !facts.cushionAfterFirstContact || facts.pocketed.length) return -Infinity;
  const cue = getCueBall(end);
  if (!cue?.active) return -Infinity;
  const next = generateCandidates(end, playerLegal).filter(candidate =>
    candidate.tolerance >= .009 && candidate.cutAngle <= .9 && candidate.cueDistance + candidate.pocketDistance <= 2.6);
  const nearRail = Math.min(TABLE.width / 2 - Math.abs(cue.x), TABLE.length / 2 - Math.abs(cue.z));
  const railPenalty = Math.max(0, .12 - nearRail) * 5;
  return next.length ? Math.max(...next.map(candidateEase)) - railPenalty : -Infinity;
}

function nextLegalNumbers(
  initialWorld: BilliardsWorld,
  endWorld: BilliardsWorld,
  initialLegal: number[],
): number[] {
  const remaining = initialLegal.filter(number =>
    endWorld.balls.find(ball => ball.number === number)?.active);
  if (remaining.length > 0) return remaining;

  const groups = new Set(
    initialLegal
      .map(number => initialWorld.balls.find(ball => ball.number === number)?.group)
      .filter(group => group === 'solid' || group === 'stripe'),
  );
  const eight = endWorld.balls.find(ball => ball.number === 8);
  return groups.size === 1 && eight?.active ? [8] : [];
}

function followUpScore(
  initialWorld: BilliardsWorld,
  endWorld: BilliardsWorld,
  initialLegal: number[],
  target: number,
): number {
  const nextLegal = nextLegalNumbers(initialWorld, endWorld, initialLegal);
  if (nextLegal.length === 0) return target === 8 ? 2.5 : 0;
  const next = generateCandidates(endWorld, nextLegal);
  if (next.length === 0) return -1.5;
  return Math.max(...next.slice(0, 8).map(candidateEase));
}

function simulateVerified(
  world: BilliardsWorld,
  legal: number[],
  candidate: ShotCandidate,
): BilliardsWorld | null {
  const simulation = cloneWorld(world);
  if (!strikeCueBall(
    simulation,
    candidate.angle,
    candidate.power,
    candidate.spin,
  )) return null;
  simulateUntilStop(simulation);
  const firstContactLegal =
    simulation.firstContact !== null && legal.includes(simulation.firstContact);
  return firstContactLegal &&
    !isCueBallPocketed(simulation) &&
    (!pocketedThisShot(simulation).includes(8) || (legal.length === 1 && legal[0] === 8)) &&
    pocketedThisShot(simulation).includes(candidate.target)
    ? simulation
    : null;
}

function withVariant(
  base: ShotCandidate,
  spin: { readonly x: number; readonly y: number },
  powerDelta: number,
  angleDelta = 0,
): ShotCandidate {
  return {
    ...base,
    angle: base.angle + angleDelta,
    power: clamp(base.power + powerDelta, 1, 100),
    spin: { x: spin.x, y: spin.y },
  };
}

/**
 * 先让前 N 条几何路线各跑 3 种定杆，避免一条难救的路线吃完预算；
 * 仍无解时才对前两条做小范围角度标定。每次物理仿真都受 simulationLimit 硬上限。
 */
export function chooseTacticalShot(
  world: BilliardsWorld,
  legal: number[],
  config: TacticalSearchConfig,
  rng: () => number = Math.random,
): TacticalShotResult {
  const steps = tacticalShotSteps(world, legal, config, rng);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** 主线程版本逐候选让出执行；普通 Worker 仍同步消费完全相同的结果。 */
export function* tacticalShotSteps(
  world: BilliardsWorld, legal: number[], config: TacticalSearchConfig,
  rng: () => number = Math.random,
): Generator<void, TacticalShotResult, void> {
  const simulationLimit = Math.max(1, Math.floor(config.simulationLimit));
  const routes = generateCandidates(world, legal)
    .sort((a, b) => Number(isObviousPot(b)) - Number(isObviousPot(a)) || candidateEase(b) - candidateEase(a));
  const bases = routes.slice(0, Math.max(1, Math.floor(config.candidateLimit)));
  let simulations = 0;
  const verified: VerifiedShot[] = [];

  // On a difficult table, try a close miss around a real potting line first. Any
  // deliberate miss must still be legal and leave a playable shot on the actual table.
  const tryOpportunity = (config.opportunityChance ?? 0) > rng() && !routes.some(isObviousPot);
  const cue = getCueBall(world);
  if (tryOpportunity && config.playerLegal?.length && cue?.active) {
    const playerLegal = config.playerLegal;
    const opportunityLimit = Math.min(9, simulationLimit);
    const probes: ShotCandidate[] = [];
    for (const base of bases.slice(0, 1)) {
      const missOffset = clamp(base.tolerance * 1.7, .009, .043);
      for (const direction of [-1, 1]) {
        probes.push(withVariant(base, SPIN_VARIANTS[0].spin, -3, direction * missOffset));
      }
    }

    const targets = world.balls.filter(ball => ball.active && legal.includes(ball.number))
      .sort((a, b) => Math.hypot(a.x - cue.x, a.z - cue.z) - Math.hypot(b.x - cue.x, b.z - cue.z));
    for (const target of targets.slice(0, 2)) {
      const cueDistance = Math.hypot(target.x - cue.x, target.z - cue.z);
      for (const power of [32, 48, 62]) {
        probes.push({
          target: target.number, pocket: -1, angle: Math.atan2(target.x - cue.x, -(target.z - cue.z)),
          power, spin: { x: 0, y: 0 }, tolerance: .012, cueDistance, pocketDistance: 0, cutAngle: 0,
        });
      }
    }

    let opportunity: ShotCandidate | null = null;
    let bestEase = -Infinity;
    for (const candidate of probes) {
      if (simulations >= opportunityLimit) break;
      const end = cloneWorld(world);
      strikeCueBall(end, candidate.angle, candidate.power, candidate.spin);
      simulateUntilStop(end); simulations++;
      yield;
      // Prefer a plausible attempted pot when it leaves an equally comfortable line.
      const ease = comfortableLeave(end, legal, playerLegal) + (candidate.pocket >= 0 ? .3 : 0);
      if (ease <= bestEase || simulations + 2 > opportunityLimit) continue;

      let robust = true;
      for (const direction of [-1, 1]) {
        const probe = cloneWorld(world);
        strikeCueBall(probe, candidate.angle + direction * .0008, candidate.power * (1 + direction * .008), candidate.spin);
        simulateUntilStop(probe); simulations++;
        if (comfortableLeave(probe, legal, playerLegal) === -Infinity) robust = false;
        yield;
      }
      if (robust) {
        bestEase = ease;
        opportunity = { ...candidate, friendlyOpportunity: true };
      }
    }
    if (opportunity) return { shot: opportunity, simulations };
  }

  const tryCandidate = (candidate: ShotCandidate) => {
    if (simulations >= simulationLimit) return;
    simulations += 1;
    const endWorld = simulateVerified(world, legal, candidate);
    if (!endWorld) return;
    verified.push({
      candidate,
      endWorld,
      score:
        candidateEase(candidate) +
        followUpScore(world, endWorld, legal, candidate.target) * config.followUpWeight,
    });
  };

  for (const base of bases) {
    for (const variant of SPIN_VARIANTS) {
      tryCandidate(withVariant(base, variant.spin, variant.powerDelta));
      yield;
    }
  }

  if (verified.length === 0) {
    const calibrationDeltas = [0.004, -0.004, 0.008, -0.008, 0.012, -0.012, 0.016, -0.016];
    for (const base of bases.slice(0, 2)) {
      for (const delta of calibrationDeltas) {
        tryCandidate(withVariant(base, SPIN_VARIANTS[1].spin, 6, delta));
        yield;
      }
    }
  }

  verified.sort((a, b) =>
    Number(isObviousPot(b.candidate)) - Number(isObviousPot(a.candidate)) || b.score - a.score);
  const best = verified[0];
  const alternative = verified.find(item => best && !isObviousPot(best.candidate) &&
    (item.candidate.target !== best.candidate.target || item.candidate.pocket !== best.candidate.pocket));
  const useAlternative = !!alternative && rng() < clamp(config.alternativeChance, 0, 1);
  return {
    shot: (useAlternative ? alternative : best)?.candidate ?? null,
    simulations,
  };
}
