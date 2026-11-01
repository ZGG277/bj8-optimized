/** Rendering-only offset of a connected cushion: clip concave offset loops.
 * Original nose vertices at offset=0 and every physical segment stay fixed. */
import type { CushionSegment, Point2 } from '../physics';
import { cushionJoinOutward } from './cushion-join';

const key = (p: Point2) => `${p.x.toFixed(8)},${p.z.toFixed(8)}`;
const cache = new WeakMap<readonly CushionSegment[], Map<number, Map<string, Point2>>>();
const cross = (a: Point2, b: Point2) => a.x * b.z - a.z * b.x;
const sub = (a: Point2, b: Point2) => ({ x: a.x - b.x, z: a.z - b.z });

function intersection(a: Point2, b: Point2, c: Point2, d: Point2): Point2 {
  const r = sub(b, a), s = sub(d, c), denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-14) return { ...b };
  const t = cross(sub(c, a), s) / denominator;
  return { x: a.x + t * r.x, z: a.z + t * r.z };
}

export function cushionOffsetPoint(_segment: CushionSegment, endpoint: Point2, offset: number,
  segments: readonly CushionSegment[]): Point2 {
  if (offset === 0) return { ...endpoint };
  let distances = cache.get(segments);
  if (!distances) { distances = new Map(); cache.set(segments, distances); }
  let result = distances.get(offset);
  if (!result) {
    result = new Map(); distances.set(offset, result);
    const joins = new Map<string, CushionSegment[]>();
    for (const s of segments) for (const p of [s.a, s.b]) {
      const k = key(p); joins.set(k, [...(joins.get(k) ?? []), s]);
    }
    const seen = new Set<string>();
    const starts = [...joins.keys()].sort((a, b) => joins.get(a)!.length - joins.get(b)!.length);
    for (const start of starts) {
      const nodes: Point2[] = [], outward: Point2[] = [], path: CushionSegment[] = [];
      let at = start;
      for (;;) {
        const s = joins.get(at)?.find(s => !seen.has(s.id));
        if (!s) break;
        const p = key(s.a) === at ? s.a : s.b, q = p === s.a ? s.b : s.a;
        if (!nodes.length) { nodes.push(p); outward.push(cushionJoinOutward(s, p, segments)); }
        nodes.push(q); outward.push(cushionJoinOutward(s, q, segments));
        path.push(s); seen.add(s.id); at = key(q);
      }
      if (!path.length) continue;
      const points = nodes.map((p, i) => ({ x: p.x + outward[i].x * offset, z: p.z + outward[i].z * offset }));
      const lines = path.map((s, i) => [nodes[i], nodes[i+1]].map(p => ({x:p.x-s.inward.x*offset,z:p.z-s.inward.z*offset})));
      const active = path.map((_, i) => i);
      // Offset wavefronts can erase short edges at a concave join. Intersect
      // the surviving offset lines, removing each reversed edge in turn.
      // Every removed station shares that exact join across all neighbours.
      for (let pass=0;pass<path.length;pass++) {
        for (let k=0;k+1<active.length;k++) {
          const i=active[k], j=active[k+1];
          const hit=intersection(lines[i][0],lines[i][1],lines[j][0],lines[j][1]);
          for(let n=i+1;n<=j;n++)points[n]=hit;
        }
        const first=active[0],last=active[active.length-1],end=nodes.length-1;
        if(first>0){const hit=intersection(lines[first][0],lines[first][1],nodes[0],{x:nodes[0].x+outward[0].x,z:nodes[0].z+outward[0].z});for(let n=0;n<=first;n++)points[n]=hit;}
        if(last<path.length-1){const hit=intersection(lines[last][0],lines[last][1],nodes[end],{x:nodes[end].x+outward[end].x,z:nodes[end].z+outward[end].z});for(let n=last+1;n<=end;n++)points[n]=hit;}
        const reverse=active.findIndex(i=>{
          const d=sub(nodes[i+1],nodes[i]),p=sub(points[i+1],points[i]);
          return d.x*p.x+d.z*p.z < -1e-12;
        });
        if(reverse<0||active.length<=2)break;
        active.splice(reverse,1);
      }
      nodes.forEach((p, i) => result!.set(key(p), points[i]));
    }
  }
  return result.get(key(endpoint))!;
}
