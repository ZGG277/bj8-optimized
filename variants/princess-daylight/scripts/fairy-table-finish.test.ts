import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fairyRailMaterial, splitFairyTableParts, retireAuthoredPocketAssembly } from '../src/scene/fairy-table-finish';
import { sceneCost } from '../src/minitool/render-guard';

/** Parse only the actual GLB position/index data; no browser, images or renderer. */
function tableFixture(hot: boolean) {
  const file = readFileSync(new URL(`../src/scene/assets/daylight/table-${hot ? 'hot' : 'refined'}.glb`, import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const binary = file.subarray(28 + jsonLength);
  const attribute = (index: number) => {
    const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
    const size = accessor.type === 'VEC3' ? 3 : 1;
    const bytes = accessor.componentType === 5123 ? 2 : 4;
    const values: number[] = [];
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < size; k++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * bytes) + k * bytes;
      values.push(accessor.componentType === 5126 ? binary.readFloatLE(offset)
        : bytes === 2 ? binary.readUInt16LE(offset) : binary.readUInt32LE(offset));
    }
    return { values, size };
  };
  const root = new THREE.Group();
  for (const primitive of doc.meshes[0].primitives) {
    const p = attribute(primitive.attributes.POSITION);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p.values, p.size));
    geometry.setIndex(attribute(primitive.indices).values);
    const material = new THREE.MeshPhysicalMaterial({ name: doc.materials[primitive.material].name });
    root.add(new THREE.Mesh(geometry, material));
  }
  root.rotation.y = -Math.PI / 2; root.position.set(-.81006, -.718, -1.44506);
  root.updateMatrixWorld(true);
  return root;
}
function triangles(root: THREE.Group) {
  let count = 0;
  root.traverse(o => { if (o instanceof THREE.Mesh) count += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; });
  return count;
}
function bounds(mesh: THREE.Mesh) {
  const compact = mesh.geometry.toNonIndexed();
  compact.applyMatrix4(mesh.matrixWorld); compact.computeBoundingBox();
  const result = compact.boundingBox!.clone(); compact.dispose(); return result;
}
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); materials.add(o.material as THREE.Material); } });
  materials.forEach(m => m.dispose());
}

describe('actual daylight fairy-gem rail experiment', () => {
  it('retires pocket-only components while keeping the actual lower frame and rail geometry', () => {
    const root = tableFixture(false); splitFairyTableParts(root, false);
    const lower = () => {
      const result: string[] = [], v = new THREE.Vector3();
      root.traverse(o => { if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry, p = g.getAttribute('position');
        for (let i = 0; i < (g.index?.count ?? p.count); i++) {
          v.fromBufferAttribute(p, g.index?.getX(i) ?? i).applyMatrix4(o.matrixWorld);
          if (v.y <= -.2) result.push(v.toArray().map(x => x.toFixed(6)).join(','));
        }
      }); return result;
    };
    const before = lower(), rails = root.getObjectByName('fairy-gem-rails') as THREE.Mesh;
    const railIndices = Array.from(rails.geometry.index!.array);
    retireAuthoredPocketAssembly(root);
    expect(lower()).toEqual(before);
    expect(Array.from(rails.geometry.index!.array)).toEqual(railIndices);
    dispose(root);
  });
  for (const hot of [false, true]) it(`splits real ${hot ? 'hot' : 'refined'} geometry without duplicate surfaces or a second transparent shell`, () => {
    const root = tableFixture(hot), before = triangles(root);
    splitFairyTableParts(root, hot); root.updateMatrixWorld(true);
    expect(triangles(root)).toBe(before);
    const rails = root.getObjectByName('fairy-gem-rails') as THREE.Mesh;
    const crowns = root.getObjectByName('fairy-pocket-crowns') as THREE.Mesh;
    expect(rails).toBeDefined(); expect(crowns).toBeDefined();
    const railBounds = bounds(rails), crownBounds = bounds(crowns);
    expect(railBounds.min.y).toBeCloseTo(.036, 5);
    expect(railBounds.max.y).toBeCloseTo(.0675, 5);
    expect(crownBounds.min.y).toBeGreaterThanOrEqual(.060);
    expect(crownBounds.max.y).toBeLessThanOrEqual(.071);
    expect((crowns.geometry.index!.count / 3)).toBe(hot ? 170 : 2048);
    expect(railBounds.min.x).toBeLessThan(-.8); expect(railBounds.max.x).toBeGreaterThan(.8);
    expect(railBounds.min.z).toBeLessThan(-1.44); expect(railBounds.max.z).toBeGreaterThan(1.44);
    // All lower ivory structure and its extrema survive independently of the gem material.
    const ivory = root.children.find(o => o instanceof THREE.Mesh && /Pearl/.test((o.material as THREE.Material).name)) as THREE.Mesh;
    expect(bounds(ivory).min.y).toBeLessThan(-.65);
    expect((ivory.material as THREE.MeshPhysicalMaterial).transmission).toBe(0);
    const scene = new THREE.Scene(); scene.add(root);
    // Two material splits add two draws; shared transmission prepass is accounted for.
    const cost = sceneCost(scene);
    expect(cost.calls).toBeLessThanOrEqual(hot ? 10 : 19);
    expect(cost.triangles).toBeLessThanOrEqual(before * (hot ? 1 : 2));
    dispose(root);
  });

  it('keeps one front-side clear gem pass and an opaque thermal fallback', () => {
    const normal = fairyRailMaterial(false), hot = fairyRailMaterial(true);
    expect(normal.transmission).toBe(.88); expect(normal.side).toBe(THREE.FrontSide);
    expect(normal.transparent).toBe(false); expect(normal.opacity).toBe(1);
    expect(normal.depthWrite).toBe(true); expect(normal.map).toBeNull();
    expect(hot.transmission).toBe(0); expect(hot.transparent).toBe(false);
    normal.dispose(); hot.dispose();
  });
});
