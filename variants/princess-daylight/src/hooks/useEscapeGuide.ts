import { useEffect, useState } from 'react';
import type { MatchState } from '../match/types';
import type { BilliardsWorld } from '../physics';
import { searchEscapeRoute, type EscapeRoute } from '../planner/escape-route';

type Result = { world: BilliardsWorld; match: MatchState; route: EscapeRoute | null };

export function useEscapeGuide(open: boolean, world: BilliardsWorld, match: MatchState) {
  const [result, setResult] = useState<Result>();
  const verified = result?.world === world && result.match === match ? result : undefined;
  useEffect(() => {
    if (!open || verified) return;
    const trials = searchEscapeRoute(world, match);
    let frame: number;
    const work = () => {
      const before = performance.now();
      do {
        const check = trials.next();
        if (check.done) {
          setResult({ world, match, route: check.value });
          return;
        }
      } while (performance.now() - before < 4);
      frame = window.requestAnimationFrame(work);
    };
    frame = window.requestAnimationFrame(work);
    return () => window.cancelAnimationFrame(frame);
  }, [open, world, match, verified]);
  return open ? verified?.route : undefined; // undefined while computing, null when no route was verified.
}
