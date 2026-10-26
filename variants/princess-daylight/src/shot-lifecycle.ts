import type { BilliardsWorld } from './physics';
import type { Actor, MatchState } from './match/types';

/** A delayed animation may commit only to the exact turn and world that created it. */
export function createShotLease(worldRef: { current: BilliardsWorld }, matchRef: { current: MatchState | null }, actor: Actor) {
  const world = worldRef.current, shot = world.shot;
  const phase = actor === 'player' ? 'aiming' : 'opponent';
  let used = false;
  const current = () => !used && worldRef.current === world && world.shot === shot && !world.moving
    && matchRef.current?.actor === actor && matchRef.current.phase === phase;
  return {
    current,
    cancel: () => { used = true; },
    commit(action: () => void) {
      if (!current()) return false;
      used = true;
      action();
      return true;
    },
  };
}
