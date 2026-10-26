/*
[INPUT]: 当前六袋/库边几何、R3动态承托与圆润木框实际三角形
[OUTPUT]: 承托有实体且不挡六袋、加宽木框与共享包络及同源袋口顶点的回归
[POS]: 跨物理/可见几何的实际网格验收
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import sceneSource from '../Scene3D.ts?raw';
import { describe, expect, it } from 'vitest';
import { POCKETS, CUSHION_SEGMENTS, pocketLocalToWorld } from '../physics';
import { TABLE_RENDER, createTableUnderlapGeometry } from './cushion-geometry';
import { createTableFrameGeometry, tableFrameOpening, tableFrameEnvelope } from './frame-geometry';
import { BALL_POCKET_SCALE } from '../physics/size-contract';
import { pocketSeamContract } from './seam-contract';
import { pocketRenderProfile } from './profile';
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

describe('enlarged pocket assembly', () => {
  it('binds actual Scene3D well and net vertices to the same profile rather than legacy heights', () => {
    const scene = sceneSource;
    expect(scene).toMatch(/wallPositions\.push\(top\.x, profile\.wellTopY, top\.z, lower\.x, profile\.wellBottomY, lower\.z\)/);
    expect(scene).toMatch(/THREE\.MathUtils\.lerp\(profile\.wellTopY \* 2 \/ 3, profile\.wellBottomY \* 23 \/ 24, rowT\)/);
    expect(scene).not.toMatch(/lerp\(-0\.004, -0\.069, rowT\)/);
    for (const pocket of POCKETS) {
      const profile = pocketRenderProfile(pocket);
      expect(profile.wellTopY * 2 / 3).toBeCloseTo(-.004 * BALL_POCKET_SCALE, 12);
      expect(profile.wellBottomY * 23 / 24).toBeCloseTo(-.069 * BALL_POCKET_SCALE, 12);
    }
  });
  it('rebuilds all 150 supports from current geometry with no obstruction in the larger openings', () => {
    const geometry = createTableUnderlapGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    expect(geometry.getAttribute('position').count / 3).toBe(CUSHION_SEGMENTS.length * 12);
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    const ray = new THREE.Raycaster();
    for (const pocket of POCKETS) for (const depth of [-pocket.captureInset, 0, pocket.shelfDepth / 2, pocket.shelfDepth]) {
      for (const lateral of [-pocket.dropHalfWidth, 0, pocket.dropHalfWidth]) {
        const p = pocketLocalToWorld(pocket, depth, lateral);
        ray.set(new THREE.Vector3(p.x, .01, p.z), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(mesh), `p${pocket.index} depth=${depth} lateral=${lateral}`).toHaveLength(0);
      }
    }
    for (const segment of CUSHION_SEGMENTS) {
      const x = (segment.a.x + segment.b.x) / 2 - segment.inward.x * .01;
      const z = (segment.a.z + segment.b.z) / 2 - segment.inward.z * .01;
      ray.set(new THREE.Vector3(x, .01, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(mesh);
      expect(hits.length, segment.id).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(-.0004, 7);
    }
    geometry.dispose();
  });

  it('rounds the outer rail inside the shared camera envelope and preserves the exact pocket edge', () => {
    const contracts = POCKETS.map(p => pocketSeamContract(p, pocketRenderProfile(p)));
    const before = JSON.stringify(contracts);
    const geometry = createTableFrameGeometry(contracts);
    expect(JSON.stringify(contracts)).toBe(before);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const envelope = tableFrameEnvelope(contracts);
    expect(envelope.expansion).toBeGreaterThan(0);
    expect(envelope.expansion).toBeLessThan(.055);
    expect(bounds.max.x).toBeCloseTo(envelope.halfWidth, 6);
    expect(bounds.max.z).toBeCloseTo(envelope.halfLength, 6);
    expect(bounds.min.x).toBeCloseTo(-envelope.halfWidth, 6);
    expect(bounds.min.z).toBeCloseTo(-envelope.halfLength, 6);
    expect(bounds.min.y).toBeCloseTo(-TABLE_RENDER.bevelHeight, 7);
    expect(bounds.max.y).toBeCloseTo(TABLE_RENDER.railHeight + TABLE_RENDER.bevelHeight, 7);
    const positions = geometry.getAttribute('position');
    const yValues = new Set(Array.from({length: positions.count}, (_, i) => positions.getY(i).toFixed(7)));
    expect(yValues.size).toBeGreaterThanOrEqual(14);
    for (const p of tableFrameOpening(contracts)) {
      expect(Array.from({length: positions.count}, (_, i) => Math.hypot(positions.getX(i) - p.x, positions.getZ(i) - p.z)).some(d => d < 1e-6)).toBe(true);
    }
    geometry.dispose();
  });
});
