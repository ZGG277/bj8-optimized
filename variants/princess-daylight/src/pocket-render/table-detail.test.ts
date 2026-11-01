import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CUSHION_SEGMENTS, POCKETS, pocketLocalToWorld } from '../physics';
import { pocketRenderProfile } from './profile';
import { createWellLining } from './well-lining';
import { cushionClothCoordinates } from './cloth-coordinates';
import { clothFibreHeight } from '../scene/cloth-fibres';

describe('close-view surfaces preserve the C1 playing envelope', () => {
  it('keeps a continuous metric cloth coordinate across every connected jaw/rail seam', () => {
    const uv = cushionClothCoordinates(CUSHION_SEGMENTS);
    let joints = 0;
    for (const a of CUSHION_SEGMENTS) for (const b of CUSHION_SEGMENTS) {
      if (a === b) continue;
      for (const [i, p] of [a.a, a.b].entries()) for (const [j, q] of [b.a, b.b].entries()) {
        if (Math.hypot(p.x - q.x, p.z - q.z) > 1e-8) continue;
        expect(uv.get(a.id)![i]).toBeCloseTo(uv.get(b.id)![j], 8); joints++;
      }
    }
    expect(joints).toBeGreaterThan(12);
  });
  it('has periodic, non-striped fibre values and derivatives at tile boundaries', () => {
    for (let i = 0; i < 41; i++) {
      const t = i / 41;
      expect(clothFibreHeight(0, t)).toBeCloseTo(clothFibreHeight(1, t), 10);
      expect(clothFibreHeight(t, 0)).toBeCloseTo(clothFibreHeight(t, 1), 10);
      const d = 1e-5;
      expect(clothFibreHeight(-d, t)).toBeCloseTo(clothFibreHeight(1 - d, t), 10);
      expect(Math.abs(clothFibreHeight(t, t))).toBeLessThan(.5);
    }
  });
  for (const pocket of POCKETS) it(`closes lining ${pocket.index} outward without moving its inner aperture`, () => {
    const profile = pocketRenderProfile(pocket), g = createWellLining(pocket, profile);
    const p = g.getAttribute('position'), uv = g.getAttribute('uv'), n = profile.wellRadialSteps;
    for (let i = 0; i <= n; i++) {
      const angle = (i % n) / n * Math.PI * 2;
      const original = pocketLocalToWorld(pocket, profile.topCenterDepth + Math.sin(angle) * profile.topDepthRadius, Math.cos(angle) * profile.topLateralRadius);
      expect(p.getX(i * 2)).toBeCloseTo(original.x, 6);
      expect(p.getZ(i * 2)).toBeCloseTo(original.z, 6);
      expect(p.getY(i * 2)).toBeCloseTo(profile.wellTopY, 6);
    }
    expect(uv.getX(n * 2) % 1).toBe(0);
    const edges = new Map<string, number>();
    const point = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i);
    const key = (i: number) => point(i).toArray().map(v => v.toFixed(6)).join(',');
    for (let i = 0; i < g.index!.count; i += 3) {
      const v = [0, 1, 2].map(k => g.index!.getX(i + k));
      expect(point(v[1]).sub(point(v[0])).cross(point(v[2]).sub(point(v[0]))).lengthSq()).toBeGreaterThan(1e-18);
      for (let j = 0; j < 3; j++) {
        const k = [key(v[j]), key(v[(j + 1) % 3])].sort().join('|');
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    expect(Array.from(g.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
    expect(g.index!.count / 3).toBe(288);
    g.dispose();
  });
});
