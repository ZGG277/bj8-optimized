/*
[INPUT]: 依赖 physics 确定性仿真、planner/candidates 几何候选；接收当前世界、合法球与严格仿真预算
[OUTPUT]: 对外输出已验证进球且不洗袋的顾燃战术选杆，挑战模式优先保留下一杆
[POS]: 对手 AI 纯策略层；以有界确定性仿真替代通用高预算走位搜索
[PROTOCOL]: 候选、评分或预算变化时同步更新 tactical-shot.test.ts 与 opponent/CLAUDE.md
*/
import {
  cloneWorld,
  isCueBallPocketed,
  pocketedThisShot,
  simulateUntilStop,
  strikeCueBall,
  type BilliardsWorld,
} from '../physics';
import { generateCandidates, type ShotCandidate } from '../planner/candidates';

export type TacticalSearchConfig = {
  candidateLimit: number;
  simulationLimit: number;
  followUpWeight: number;
  alternativeChance: number;
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

function candidateEase(candidate: ShotCandidate): number {
  return (
    Math.log1p(candidate.tolerance * 1000) * 1.35 -
    candidate.cutAngle * 0.85 -
    (candidate.cueDistance + candidate.pocketDistance) * 0.14
  );
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
  const simulationLimit = Math.max(1, Math.floor(config.simulationLimit));
  const bases = generateCandidates(world, legal)
    .sort((a, b) => candidateEase(b) - candidateEase(a))
    .slice(0, Math.max(1, Math.floor(config.candidateLimit)));
  let simulations = 0;
  const verified: VerifiedShot[] = [];

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
    }
  }

  if (verified.length === 0) {
    const calibrationDeltas = [0.004, -0.004, 0.008, -0.008, 0.012, -0.012, 0.016, -0.016];
    for (const base of bases.slice(0, 2)) {
      for (const delta of calibrationDeltas) {
        tryCandidate(withVariant(base, SPIN_VARIANTS[1].spin, 6, delta));
      }
    }
  }

  verified.sort((a, b) => b.score - a.score);
  const useAlternative =
    verified.length > 1 && rng() < clamp(config.alternativeChance, 0, 1);
  return {
    shot: verified[useAlternative ? 1 : 0]?.candidate ?? null,
    simulations,
  };
}
