import type { CushionSegment, Point2 } from '../physics';

const cache = new WeakMap<readonly CushionSegment[], Map<string, readonly [number, number]>>();
const key = (p: Point2) => `${p.x.toFixed(8)},${p.z.toFixed(8)}`;

/** Arc length through each connected rail/jaw run; never reset at a short jaw segment. */
export function cushionClothCoordinates(segments: readonly CushionSegment[]) {
  const prior = cache.get(segments);
  if (prior) return prior;
  const joins = new Map<string, CushionSegment[]>();
  for (const segment of segments) for (const p of [segment.a, segment.b]) {
    const k = key(p); joins.set(k, [...(joins.get(k) ?? []), segment]);
  }
  const result = new Map<string, readonly [number, number]>();
  const starts = [...joins.keys()].sort((a, b) => (joins.get(a)!.length - joins.get(b)!.length) || a.localeCompare(b));
  for (const start of starts) {
    let at = start, distance = 0;
    for (;;) {
      const next = joins.get(at)?.find(s => !result.has(s.id));
      if (!next) break;
      const length = Math.hypot(next.b.x - next.a.x, next.b.z - next.a.z);
      const forward = key(next.a) === at;
      result.set(next.id, forward ? [distance, distance + length] : [distance + length, distance]);
      at = key(forward ? next.b : next.a); distance += length;
    }
  }
  cache.set(segments, result);
  return result;
}
