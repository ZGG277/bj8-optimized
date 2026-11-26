import { firstObjectHit } from '../aim/aim-solution';
import { factsFromWorld } from '../match/shot-facts';
import { legalNumbers, resolveStoppedShot } from '../match/match-machine';
import type { MatchState } from '../match/types';
import {
  cloneWorld, CUSHION_SEGMENTS, getCueBall, PHYSICS_DT, stepWorld, strikeCueBall, TABLE, type BilliardsWorld,
} from '../physics';
import type { Point2, RailSide } from '../physics/table-geometry';

export type EscapeRoute = {
  target: number;
  rail: RailSide;
  power: number;
  angle: number;
  points: [start: Point2, bounce: Point2, contact: Point2];
  targetPosition: Point2;
};

const trialPowers = [42, 62, 29, 78] as const;
const maxTrials = 56;
const cushionCenter = TABLE.ballRadius;
const rails = CUSHION_SEGMENTS.filter(segment => segment.role === 'rail');

function bankAngles(world: BilliardsWorld, cue: Point2, legal: Set<number>) {
  const candidates: { angle: number; cost: number }[] = [];
  for (const segment of rails) {
    const axis = segment.inward.x !== 0 ? 'x' : 'z';
    const along = axis === 'x' ? 'z' : 'x';
    const face = segment.a[axis] + segment.inward[axis] * cushionCenter;
    for (const ball of world.balls) {
      if (!ball.active || !legal.has(ball.number)) continue;
      // Mirror the target around the rail, then try its center and useful thin-contact lines.
      const mirrored = 2 * face - ball[axis];
      const t = (face - cue[axis]) / (mirrored - cue[axis]);
      if (!(t > 0 && t < 1)) continue;
      for (const offset of [0, -.045, .045, -.075, .075, -.12, .12]) {
        const entry = cue[along] + ((ball[along] + offset) - cue[along]) * t;
        if (entry <= Math.min(segment.a[along], segment.b[along]) + cushionCenter ||
            entry >= Math.max(segment.a[along], segment.b[along]) - cushionCenter) continue;
        const point = { [axis]: face, [along]: entry } as Point2;
        const angle = Math.atan2(point.x - cue.x, -(point.z - cue.z));
        if (firstObjectHit(world, angle) !== null) continue;
        const cost = Math.hypot(ball.x - point.x, ball.z - point.z) +
          Math.hypot(cue.x - point.x, cue.z - point.z) + Math.abs(offset) * 4;
        candidates.push({ angle, cost });
      }
    }
  }
  return candidates.sort((a, b) => a.cost - b.cost).map(candidate => candidate.angle);
}

function* verifyEscape(
  world: BilliardsWorld, before: MatchState, legal: Set<number>, cue: Point2, angle: number, power: number,
): Generator<void, EscapeRoute | null> {
  const sim = cloneWorld(world);
  if (!strikeCueBall(sim, angle, power, { x: 0, y: 0 })) return null;
  const stepLimit = Math.ceil(9 / PHYSICS_DT);
  for (let step = 0; step < stepLimit && sim.moving; step++) {
    stepWorld(sim);
    if (sim.firstContact !== null && !legal.has(sim.firstContact)) return null;
    if (sim.firstContact === null && step * PHYSICS_DT >= 3.2) return null;
    if (step % 30 === 29) yield;
  }
  if (sim.moving || sim.eventBudgetExhaustions !== world.eventBudgetExhaustions) return null;
  const contact = sim.events.find(event => event.type === 'first-contact');
  if (!contact?.cuePosition || !legal.has(contact.ball)) return null;
  const beforeContact = sim.events.filter(event => event.type === 'cushion')
    .filter(event => event.ball === 0 && event.time < contact.time);
  const bounce = beforeContact[0];
  if (beforeContact.length !== 1 || !bounce.rail || bounce.speed < .10) return null;
  const { next } = resolveStoppedShot(before, factsFromWorld(sim));
  if (next.messageParams.reason || (next.phase === 'finished' && next.winner !== 'player')) return null;
  const target = world.balls.find(ball => ball.number === contact.ball)!;
  return {
    target: contact.ball, rail: bounce.rail.side, power, angle,
    points: [{ x: cue.x, z: cue.z }, { x: bounce.rail.x, z: bounce.rail.z }, contact.cuePosition],
    targetPosition: { x: target.x, z: target.z },
  };
}

/** Early-exit, time-sliceable search. Every returned route has been played to rest by the real engine. */
export function* searchEscapeRoute(world: BilliardsWorld, before: MatchState): Generator<void, EscapeRoute | null> {
  const cue = getCueBall(world);
  if (!cue?.active || world.moving || before.phase !== 'aiming' || before.actor !== 'player' || before.breaking) return null;
  const legal = new Set(legalNumbers(world, 'player', before.playerGroup));
  const angles = bankAngles(world, cue, legal);
  let trials = 0;
  // Try more directions at a useful medium pace before revisiting the best directions at other powers.
  for (let i = 0; i < trialPowers.length; i++) {
    for (const angle of angles.slice(0, i === 0 ? 28 : 12)) {
      if (trials++ === maxTrials) return null;
      const route = yield* verifyEscape(world, before, legal, cue, angle, trialPowers[i]);
      if (route) return route;
      yield;
    }
  }
  return null;
}
