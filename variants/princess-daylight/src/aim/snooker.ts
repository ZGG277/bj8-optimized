import { getCueBall, TABLE, type BilliardsWorld } from '../physics';
import { firstObjectHit } from './aim-solution';
import { legalNumbers } from '../match/match-machine';
import type { MatchState } from '../match/types';
import type { SettledShot } from '../match/shot-log';
import type { ShotHighlight } from '../match/shot-highlights';

const radius = 2 * TABLE.ballRadius;
const revolution = 2 * Math.PI;
const bearings = (x: number, z: number) => Math.atan2(x, -z);
const normalized = (angle: number) => (angle % revolution + revolution) % revolution;

/** All straight first contacts are blocked, including a thin contact on either edge. */
export function isSnookered(world: BilliardsWorld, legalBalls: readonly number[]): boolean {
  const cue = getCueBall(world);
  if (!cue?.active || world.moving || !legalBalls.length) return false;
  const objects = world.balls.filter(ball => ball.active && ball.number !== 0);
  const legal = new Set(legalBalls);
  const targets = objects.filter(ball => legal.has(ball.number));
  if (!targets.length) return false;
  const blockers = objects.filter(ball => !legal.has(ball.number));
  if (!blockers.length) return false;

  // Nearest-ball order is constant between tangent rays and rays through two circle intersections.
  const edges = [0, revolution];
  for (const ball of objects) {
    const x = ball.x - cue.x, z = ball.z - cue.z;
    const angle = bearings(x, z);
    const spread = Math.asin(Math.min(1, radius / Math.hypot(x, z)));
    edges.push(normalized(angle - spread), normalized(angle + spread));
  }
  for (const target of targets) for (const blocker of blockers) {
    const dx = blocker.x - target.x, dz = blocker.z - target.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 1e-8) return false;
    if (distance >= radius * 2) continue;
    const height = Math.sqrt(radius * radius - distance * distance / 4);
    const x = (target.x + blocker.x) / 2 - cue.x, z = (target.z + blocker.z) / 2 - cue.z;
    edges.push(
      normalized(bearings(x - dz / distance * height, z + dx / distance * height)),
      normalized(bearings(x + dz / distance * height, z - dx / distance * height)),
    );
  }
  edges.sort((a, b) => a - b);
  for (let index = 1; index < edges.length; index++) {
    if (edges[index] - edges[index - 1] < 1e-9) continue;
    const first = firstObjectHit(world, (edges[index] + edges[index - 1]) / 2);
    if (first !== null && legal.has(first)) return false;
  }
  return true;
}

export function safetyHighlight(
  world: BilliardsWorld, shot: SettledShot, next: MatchState, before: MatchState, atStart?: BilliardsWorld,
): ShotHighlight | null {
  if (shot.breaking || shot.foul || next.phase === 'finished' || next.phase === 'placing') return null;
  const base = { shotId: shot.shotId, actor: shot.actor };
  if (next.actor !== shot.actor && next.playerGroup) {
    const legal = legalNumbers(world, next.actor, next.playerGroup);
    if (isSnookered(world, legal) &&
        (shot.actor === 'opponent' || (atStart && !isSnookered(atStart, legalNumbers(atStart, next.actor, before.playerGroup))))) {
      return { ...base, kind: 'snooker' };
    }
  }
  if (shot.actor === 'player' && atStart && shot.firstContact !== null &&
      isSnookered(atStart, legalNumbers(atStart, 'player', before.playerGroup))) {
    return { ...base, kind: 'escape', target: shot.firstContact };
  }
  return null;
}
