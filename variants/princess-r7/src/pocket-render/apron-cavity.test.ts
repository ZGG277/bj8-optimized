/*
[INPUT]: 实际四批家具三角形与六袋36边上下椭圆袋腔
[OUTPUT]: 三维袋腔没有桌裙、宝石或金线穿入；桌裙保持闭合且绕序一致
[POS]: 最终运行时网格回归；检测三角形穿越袋壁及完整落在袋内的面
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { POCKETS, pocketLocalToWorld, worldToPocketLocal } from '../physics';
import { createCrystalStructure } from '../scene/crystal-style';
import { pocketRenderProfile, pocketWellCrossSectionAtY } from './profile';

type Face = { points: THREE.Vector3[]; box: THREE.Box3 };
const face = (points: THREE.Vector3[]): Face => ({ points, box: new THREE.Box3().setFromPoints(points) });
const roots: THREE.Group[] = [];
const build = () => { const root = createCrystalStructure(); roots.push(root); return root; };
afterEach(() => {
  const materials = new Set<THREE.Material>();
  for (const root of roots.splice(0)) root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  });
  materials.forEach(m => m.dispose());
});
const triangles = (geometry: THREE.BufferGeometry) => {
  const p = geometry.getAttribute('position'), ix = geometry.index;
  return Array.from({ length: (ix?.count ?? p.count) / 3 }, (_, i) => face([0, 1, 2].map(k =>
    new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i * 3 + k) : i * 3 + k))));
};
function facesCross(a: Face, b: Face) {
  if (!a.box.intersectsBox(b.box)) return false;
  const ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
  for (const [edges, target] of [[a, b], [b, a]]) for (let i = 0; i < 3; i++) {
    const start = edges.points[i], end = edges.points[(i + 1) % 3];
    direction.copy(end).sub(start); const length = direction.length();
    ray.set(start, direction.divideScalar(length));
    if (ray.intersectTriangle(target.points[0], target.points[1], target.points[2], false, hit)
      && hit.distanceTo(start) <= length + 1e-8) return true;
  }
  return false;
}

describe('actual furniture clearance around enlarged wells', () => {
  it('keeps every furniture triangle outside all six complete well volumes', () => {
    const root = build();
    const furniture: { name: string; faces: Face[] }[] = [];
    root.traverse(o => { if (o instanceof THREE.Mesh) furniture.push({ name: o.name, faces: triangles(o.geometry) }); });
    for (const pocket of POCKETS) {
      const profile = pocketRenderProfile(pocket), ringCount = profile.wellRadialSteps;
      const ring = (y: number) => {
        const section = pocketWellCrossSectionAtY(profile, y);
        return Array.from({ length: ringCount }, (_, i) => {
          const a = i / ringCount * Math.PI * 2;
          const p = pocketLocalToWorld(pocket, section.centerDepth + section.depthRadius * Math.cos(a), section.lateralRadius * Math.sin(a));
          return new THREE.Vector3(p.x, y, p.z);
        });
      };
      const top = ring(profile.wellTopY), bottom = ring(profile.wellBottomY);
      const boundary: Face[] = [];
      for (let i = 0; i < ringCount; i++) {
        const j = (i + 1) % ringCount;
        boundary.push(face([top[i], top[j], bottom[i]]), face([top[j], bottom[j], bottom[i]]));
      }
      for (const cap of [top, bottom]) for (let i = 1; i < ringCount - 1; i++) boundary.push(face([cap[0], cap[i], cap[i + 1]]));
      const wellBounds = new THREE.Box3().setFromPoints([...top, ...bottom]);
      const inside = (v: THREE.Vector3) => {
        if (v.y < profile.wellBottomY - 1e-8 || v.y > profile.wellTopY + 1e-8) return false;
        const local = worldToPocketLocal(pocket, v), section = pocketWellCrossSectionAtY(profile, v.y);
        return ((local.depth - section.centerDepth) / section.depthRadius) ** 2 + (local.lateral / section.lateralRadius) ** 2 < 1 - 1e-8;
      };
      for (const mesh of furniture) for (const [i, candidate] of mesh.faces.entries()) {
        if (!candidate.box.intersectsBox(wellBounds)) continue;
        expect(candidate.points.some(inside), `p${pocket.index} ${mesh.name} face${i} inside well`).toBe(false);
        expect(boundary.some(wall => facesCross(candidate, wall)), `p${pocket.index} ${mesh.name} face${i} crosses well`).toBe(false);
      }
    }
  });

  it('retains a closed, consistently wound rounded apron and columns', () => {
    const frame = build().getObjectByName('crystal-tiered-frame-and-legs') as THREE.Mesh;
    const edges = new Map<string, { count: number; direction: number }>();
    const key = (p: THREE.Vector3) => p.toArray().map(v => Math.round(v / 1e-6)).join(',');
    let volume = 0;
    for (const { points: [a, b, c] } of triangles(frame.geometry)) {
      volume += a.dot(b.clone().cross(c)) / 6;
      const points = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const start = key(points[i]), end = key(points[(i + 1) % 3]);
        const id = [start, end].sort().join('|'), edge = edges.get(id) ?? { count: 0, direction: 0 };
        edge.count++; edge.direction += start < end ? 1 : -1; edges.set(id, edge);
      }
    }
    expect([...edges.values()].filter(e => e.count !== 2)).toHaveLength(0);
    expect([...edges.values()].filter(e => e.direction !== 0)).toHaveLength(0);
    expect(volume).toBeGreaterThan(0);
  });
});
