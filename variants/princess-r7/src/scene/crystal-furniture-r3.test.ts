import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { TABLE, POCKETS } from '../physics';
import { pocketRenderProfile } from '../pocket-render/profile';
import { pocketSeamContract } from '../pocket-render/seam-contract';
import { tableFrameEnvelope } from '../pocket-render/frame-geometry';
import { sceneCost, withinSceneBudget } from '../minitool/render-guard';
import { createCrystalStructure } from './crystal-style';

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

describe('R3 rounded crystal furniture geometry', () => {
  it('has finite, nondegenerate outward-wound faces consistent with the supplied smooth normals', () => {
    const root = build(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = new THREE.Vector3(), face = new THREE.Vector3(), temp = new THREE.Vector3();
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position'), normals = o.geometry.getAttribute('normal'), ix = o.geometry.index;
      for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
        const ids = [0, 1, 2].map(k => ix ? ix.getX(i + k) : i + k);
        a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
        face.copy(b).sub(a).cross(temp.copy(c).sub(a));
        n.set(0, 0, 0); for (const id of ids) n.add(temp.fromBufferAttribute(normals, id));
        expect(face.lengthSq(), `${o.name} face ${i / 3}`).toBeGreaterThan(1e-18);
        expect(face.dot(n), `${o.name} face ${i / 3} must not be inside-out`).toBeGreaterThan(0);
      }
    });
  });

  it('uses rounded closed apron sweeps with real fillets and smoothly outward-facing columns', () => {
    const root = build();
    expect(root.userData).toMatchObject({furnitureRevision: 6, legCount: 4, apronCornerRadius: .118, apronEdgeRadius: .014, legStyle: 'light-roman-column', legFluteCount: 8});
    const frame = root.getObjectByName('crystal-tiered-frame-and-legs') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    expect(frame.material.flatShading).toBe(false);
    const p = frame.geometry.getAttribute('position'), normal = frame.geometry.getAttribute('normal');
    const outlineCornerVertices: number[] = [];
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) >= -.182 && p.getY(i) <= -.07 && Math.abs(p.getX(i)) > TABLE.width / 2 && Math.abs(p.getZ(i)) > TABLE.length / 2) outlineCornerVertices.push(i);
    }
    expect(outlineCornerVertices.length).toBeGreaterThan(30);
    // Existing box corners reached the full X and Z extent simultaneously. The new round does not.
    const envelope=tableFrameEnvelope(POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p))));
    for (const i of outlineCornerVertices) expect(Math.abs(p.getX(i)) > TABLE.width / 2 + .074 + envelope.expansion && Math.abs(p.getZ(i)) > TABLE.length / 2 + .074 + envelope.expansion).toBe(false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (TABLE.width / 2 + .005), z = sz * (TABLE.length / 2 + .005);
      const radii: number[] = [];
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getY(i) + .67) > 1e-5 || Math.sign(p.getX(i)) !== sx || Math.sign(p.getZ(i)) !== sz) continue;
        const dx = p.getX(i) - x, dz = p.getZ(i) - z;
        radii.push(Math.hypot(dx, dz));
        expect(dx * normal.getX(i) + dz * normal.getZ(i)).toBeGreaterThan(0);
      }
      expect(radii).toHaveLength(32);
      expect(Math.min(...radii)).toBeCloseTo(.077, 5); expect(Math.max(...radii)).toBeCloseTo(.081, 5);
      expect(radii.filter(r => Math.abs(r - .077) < 1e-5)).toHaveLength(8);
    }
  });

  it('retains four batches and play clearance inside the shared frame envelope', () => {
    const root = build(), scene = new THREE.Scene(); scene.add(root);
    const cost = sceneCost(scene), bounds = new THREE.Box3().setFromObject(root);
    expect(root.children).toHaveLength(4); expect(cost.calls).toBe(4);
    expect(cost.triangles).toBeLessThan(20000); expect(withinSceneBudget(cost, true)).toBe(true);
    expect(bounds.min.y).toBeCloseTo(-.8155, 5); expect(bounds.max.y).toBeLessThan(.05);
    const envelope = tableFrameEnvelope(POCKETS.map(p => pocketSeamContract(p, pocketRenderProfile(p))));
    expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThan(envelope.halfWidth);
    expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThan(envelope.halfLength);
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) if (p.getY(i) >= 0) expect(Math.abs(p.getX(i)) > TABLE.width / 2 || Math.abs(p.getZ(i)) > TABLE.length / 2).toBe(true);
    });
  });
});
