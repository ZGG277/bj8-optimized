/*
[INPUT]: 实际六袋最终护口/缝边/木框/库边 BufferGeometry 与冻结物理参数
[OUTPUT]: 最终绕序、流形/无交叉、后缝覆盖、端座承托及物理不变回归
[POS]: 直接消费 Scene3D 所用生成器；不再由中间法向或元数据自证接合
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CUSHION_SEGMENTS, POCKETS, TABLE, pocketLocalToWorld } from '../physics';
import { pocketRenderProfile } from './profile';
import { pocketSeamContract } from './seam-contract';
import { createPocketTrimGeometry, createPocketWeltGeometry } from './trim-geometry';
import { createTableFrameGeometry, tableFrameOpening } from './frame-geometry';
import { makeCushionGeometry, TABLE_RENDER } from './cushion-geometry';

const contracts = POCKETS.map(p => pocketSeamContract(p, pocketRenderProfile(p)));
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const mesh = (geometry: THREE.BufferGeometry) => new THREE.Mesh(geometry, material);
const wood = mesh(createTableFrameGeometry(contracts));
const triangles = (g: THREE.BufferGeometry) => {
  const a = g.attributes.position, index = g.index;
  return Array.from({ length: (index?.count ?? a.count) / 3 }, (_, i) =>
    [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(a, index ? index.getX(i * 3 + k) : i * 3 + k)));
};
const key = (v: THREE.Vector3) => [v.x, v.y, v.z].map(n => Math.round(n / 1e-6)).join(',');
function meshMetrics(g: THREE.BufferGeometry) {
  const edges = new Map<string, { count: number; direction: number }>();
  let volume = 0;
  for (const [a, b, c] of triangles(g)) {
    expect(b.clone().sub(a).cross(c.clone().sub(a)).length()).toBeGreaterThan(1e-10);
    volume += a.dot(b.clone().cross(c)) / 6;
    const vs = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const x = key(vs[i]), y = key(vs[(i + 1) % 3]);
      const k = [x, y].sort().join('|');
      const edge = edges.get(k) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += x < y ? 1 : -1; edges.set(k, edge);
    }
  }
  return { open: [...edges.values()].filter(e => e.count !== 2), inconsistent: [...edges.values()].filter(e => e.direction !== 0), volume };
}
function crossing(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }, d: { x: number; z: number }) {
  const cross = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < -1e-18 && cross(c, d, a) * cross(c, d, b) < -1e-18;
}
function down(point: { x: number; z: number }, objects: THREE.Object3D[], y = 0.1) {
  const ray = new THREE.Raycaster(new THREE.Vector3(point.x, y, point.z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObjects(objects, false);
}

describe('final pocket leather assembly', () => {
  it.each(POCKETS)('builds an oriented closed non-intersecting shell for pocket $index', p => {
    const c = contracts[p.index], g = createPocketTrimGeometry(c);
    const metrics = meshMetrics(g);
    expect(metrics.open).toHaveLength(0);
    expect(metrics.inconsistent).toHaveLength(0);
    expect(metrics.volume).toBeGreaterThan(0);
    const top = triangles(g).filter(t => t.every(v => v.y >= TABLE_RENDER.cushionHeight + TABLE_RENDER.capThickness - 1e-6));
    expect(top).toHaveLength((c.stations.length - 1) * 2);
    for (const [a, b, d] of top) expect(b.clone().sub(a).cross(d.clone().sub(a)).y).toBeGreaterThan(1e-10);
    const inner = c.stations.map(s => s.inner), outer = c.stations.map(s => s.outer);
    for (let i = 0; i < inner.length - 1; i++) for (let j = 0; j < outer.length - 1; j++) {
      expect(crossing(inner[i], inner[i + 1], outer[j], outer[j + 1])).toBe(false);
      if (j > i + 1) {
        expect(crossing(inner[i], inner[i + 1], inner[j], inner[j + 1])).toBe(false);
        expect(crossing(outer[i], outer[i + 1], outer[j], outer[j + 1])).toBe(false);
      }
    }
    expect(c.stations.length).toBeLessThanOrEqual(96);
    const welt = createPocketWeltGeometry(c, p.kind === 'corner' ? .0018 : .0016);
    const weltMetrics = meshMetrics(welt);
    expect(weltMetrics.open).toHaveLength(0);
    expect(weltMetrics.inconsistent).toHaveLength(0);
    expect(weltMetrics.volume).toBeGreaterThan(0);
    expect(triangles(g).length + triangles(welt).length).toBeLessThan(1600);
    for (const v of Array.from(g.attributes.normal.array)) expect(Number.isFinite(v)).toBe(true);
  });

  it.each(POCKETS)('seats both terminal cross sections on actual jaw top faces for pocket $index', p => {
    const c = contracts[p.index];
    const jaws = p.jawSegments.map(s => mesh(makeCushionGeometry(s)));
    const jawTop = jaws.flatMap(j => triangles(j.geometry))
      .filter(t => t.every(v => Math.abs(v.y - TABLE_RENDER.cushionHeight) < 1e-6))
      .map(([a, b, d]) => new THREE.Triangle(a, b, d));
    // Shared edges are rounded independently into Float32 buffers. Check exact
    // boundaries within 1 micron; use strict rays inside every supporting face.
    for (const end of [0, 1]) {
      const rows = end === 0 ? c.stations.slice(0, c.jawEndIndices[0] + 1) : c.stations.slice(c.jawEndIndices[1]);
      for (const s of rows) for (const t of [0, .05, .5, .95, 1]) {
        const point = new THREE.Vector3(s.inner.x + (s.outer.x - s.inner.x) * t, s.seatY, s.inner.z + (s.outer.z - s.inner.z) * t);
        const distance = Math.min(...jawTop.map(face => face.closestPointToPoint(point, new THREE.Vector3()).distanceTo(point)));
        expect(distance, `p${p.index} end${end} boundary support`).toBeLessThan(1e-6);
      }
      const samples = rows.slice(1).flatMap((s, i) => [.05, .5, .95].map(along => ({
        inner: { x: rows[i].inner.x + (s.inner.x - rows[i].inner.x) * along, z: rows[i].inner.z + (s.inner.z - rows[i].inner.z) * along },
        outer: { x: rows[i].outer.x + (s.outer.x - rows[i].outer.x) * along, z: rows[i].outer.z + (s.outer.z - rows[i].outer.z) * along },
        seatY: s.seatY,
      })));
      for (const s of samples) for (const t of [.05, .5, .95]) {
        const point = { x: s.inner.x + (s.outer.x - s.inner.x) * t, z: s.inner.z + (s.outer.z - s.inner.z) * t };
        const hit = down(point, jaws, s.seatY + .0001)[0];
        expect(hit, `p${p.index} end${end} at ${JSON.stringify(point)}`).toBeDefined();
        expect(hit.point.y).toBeCloseTo(s.seatY, 6);
      }
    }
  });
});

describe('shared wood/leather boundary', () => {
  it('makes one simple opening and a closed wood solid', () => {
    const path = tableFrameOpening(contracts);
    for (let i = 0; i < path.length; i++) for (let j = i + 2; j < path.length; j++) {
      if (i === 0 && j === path.length - 1) continue;
      expect(crossing(path[i], path[(i + 1) % path.length], path[j], path[(j + 1) % path.length])).toBe(false);
    }
    const metrics = meshMetrics(wood.geometry);
    expect(metrics.open).toHaveLength(0);
    expect(metrics.inconsistent).toHaveLength(0);
    expect(metrics.volume).toBeGreaterThan(0);
  });

  it.each(POCKETS)('covers rear seam strips and the former corner void for pocket $index', p => {
    const c = contracts[p.index], leather = mesh(createPocketTrimGeometry(c));
    const [start, end] = c.jawEndIndices;
    for (let i = start + 1; i < end - 1; i++) {
      const s = c.stations[i], next = c.stations[i + 1];
      const midpoint = { x: (s.outer.x + next.outer.x) / 2, z: (s.outer.z + next.outer.z) / 2 };
      const normal = new THREE.Vector3(s.outward.x + next.outward.x, 0, s.outward.z + next.outward.z).normalize();
      for (const mm of [-1, -.1, .1, 1, 3]) {
        const point = { x: midpoint.x + normal.x * mm / 1000, z: midpoint.z + normal.z * mm / 1000 };
        const hit = down(point, [leather, wood])[0];
        expect(hit, `p${p.index} station${i} offset${mm}`).toBeDefined();
        expect(hit.point.y).toBeGreaterThan(.037);
      }
    }
    if (p.kind === 'corner') {
      // Independent regression coordinates from the reproduced 27mm floor-visible hole.
      for (let lateral = -5; lateral <= 5; lateral += 2.5) for (let depth = 130; depth <= 155; depth += .5) {
        const point = pocketLocalToWorld(p, depth / 1000, lateral / 1000);
        const hit = down(point, [leather, wood])[0];
        expect(hit).toBeDefined(); expect(hit.point.y).toBeGreaterThan(.04);
      }
    }
    // No horizontal closing bridge across the ball-entry corridor.
    for (const lateral of [-.01, 0, .01]) {
      const point = pocketLocalToWorld(p, p.shelfDepth, lateral);
      expect(down(point, [leather, wood])).toHaveLength(0);
    }
  });

  it('preserves the input physics and profile byte-for-byte while generating the final surfaces', () => {
    const before = JSON.stringify({ TABLE, POCKETS, CUSHION_SEGMENTS, profiles: POCKETS.map(pocketRenderProfile) });
    for (const p of POCKETS) createPocketTrimGeometry(pocketSeamContract(p, pocketRenderProfile(p)));
    createTableFrameGeometry(contracts);
    expect(JSON.stringify({ TABLE, POCKETS, CUSHION_SEGMENTS, profiles: POCKETS.map(pocketRenderProfile) })).toBe(before);
    expect(POCKETS.map(p => p.mouthWidth)).toEqual([.1, .1, .102, .102, .1, .1]);
    expect(TABLE.ballRadius).toBe(.028575);
  });
});
