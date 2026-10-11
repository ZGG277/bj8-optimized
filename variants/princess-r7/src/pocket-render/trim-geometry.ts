/*
[INPUT]: 共享袋口站点、真实承托高度和有界皮裙厚度
[OUTPUT]: 方向一致的闭合皮圈/皮裙壳体，以及逐站对齐的实体缝边
[POS]: Scene3D 实际消费的最终网格生成器；不改变物理尺寸或相机
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

// Final surface builders. Geometry, rather than userData, is the acceptance contract.
import * as THREE from 'three';
import type { PocketSurfaceContract } from './seam-contract';
import { TABLE_RENDER } from './cushion-geometry';

/** A crease keeps a separate normal, while identical positions still share a geometric edge. */
function surfaceBuffer() {
  const positions: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<string, number>();
  const vertex = (p: THREE.Vector3, role: number) => {
    const key = `${role}:${p.x.toFixed(12)},${p.y.toFixed(12)},${p.z.toFixed(12)}`;
    let i = vertices.get(key);
    if (i === undefined) { i = positions.length / 3; positions.push(p.x, p.y, p.z); vertices.set(key, i); }
    return i;
  };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward: THREE.Vector3, role: number) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-24) return; // Collapsed apron sections end as triangles, never zero-area faces.
    const ordered = n.dot(outward) >= 0 ? [a, b, c] : [a, c, b];
    indices.push(...ordered.map(p => vertex(p, role)));
  };
  return {
    triangle,
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

/** One closed leather shell: thin top plate and a 1.5mm inner apron, seated on the actual jaw. */
export function createPocketTrimGeometry(contract: PocketSurfaceContract): THREE.BufferGeometry {
  const buffer = surfaceBuffer();
  const rings = contract.stations.map(s => {
    const knee = { x: s.inner.x + s.outward.x * TABLE_RENDER.apronThickness, z: s.inner.z + s.outward.z * TABLE_RENDER.apronThickness };
    return [
      new THREE.Vector3(s.inner.x, s.topY, s.inner.z),
      new THREE.Vector3(s.outer.x, s.topY, s.outer.z),
      new THREE.Vector3(s.outer.x, s.seatY, s.outer.z),
      new THREE.Vector3(knee.x, s.seatY, knee.z),
      new THREE.Vector3(knee.x, s.apronBottomY, knee.z),
      new THREE.Vector3(s.inner.x, s.apronBottomY, s.inner.z),
    ];
  });
  for (let i = 1; i < rings.length; i++) {
    const n = contract.stations[i].outward;
    const out = new THREE.Vector3(n.x, 0, n.z);
    const normals = [new THREE.Vector3(0, 1, 0), out, new THREE.Vector3(0, -1, 0), out, new THREE.Vector3(0, -1, 0), out.clone().negate()];
    for (let j = 0; j < 6; j++) {
      const next = (j + 1) % 6;
      buffer.triangle(rings[i - 1][j], rings[i][j], rings[i - 1][next], normals[j], j);
      buffer.triangle(rings[i][j], rings[i][next], rings[i - 1][next], normals[j], j);
    }
  }
  for (const endpoint of [0, rings.length - 1]) {
    const ring = rings[endpoint];
    const next = rings[endpoint === 0 ? 1 : endpoint - 1];
    const direction = ring[0].clone().sub(next[0]).normalize();
    // The apron has zero extension at the seated ends; drop duplicate profile vertices.
    const unique = ring.filter((v, i) => !ring.slice(0, i).some(p => p.distanceToSquared(v) < 1e-20));
    const axis = ring[1].clone().sub(ring[0]).normalize();
    const points = unique.map(p => new THREE.Vector2(p.clone().sub(ring[0]).dot(axis), p.y));
    const faces = THREE.ShapeUtils.triangulateShape(points, []);
    for (const [a, b, c] of faces) buffer.triangle(unique[a], unique[b], unique[c], direction, 6 + endpoint);
  }
  return buffer.finish();
}

/** Welt rings use the same station vertices as the apron; no independently resampled spline. */
export function createPocketWeltGeometry(contract: PocketSurfaceContract, radius: number): THREE.BufferGeometry {
  const buffer = surfaceBuffer();
  const [first, last] = contract.jawEndIndices;
  const stations = contract.stations.slice(first, last + 1);
  const centers = stations.map(s => new THREE.Vector3(s.inner.x, s.apronBottomY + radius * 0.6, s.inner.z));
  const rings = centers.map((c, i) => {
    const tangent = centers[Math.min(i + 1, centers.length - 1)].clone().sub(centers[Math.max(0, i - 1)]).normalize();
    const n = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const b = tangent.clone().cross(n).normalize();
    return Array.from({ length: 8 }, (_, k) => c.clone().addScaledVector(n, radius * Math.cos(k * Math.PI / 4)).addScaledVector(b, radius * Math.sin(k * Math.PI / 4)));
  });
  for (let i = 1; i < rings.length; i++) for (let j = 0; j < 8; j++) {
    const k = (j + 1) % 8;
    const outward = rings[i][j].clone().sub(centers[i]);
    buffer.triangle(rings[i - 1][j], rings[i][j], rings[i - 1][k], outward, 0);
    buffer.triangle(rings[i][j], rings[i][k], rings[i - 1][k], outward, 0);
  }
  for (const i of [0, rings.length - 1]) {
    const direction = centers[i].clone().sub(centers[i === 0 ? 1 : i - 1]);
    for (let j = 0; j < 8; j++) buffer.triangle(centers[i], rings[i][j], rings[i][(j + 1) % 8], direction, i + 1);
  }
  return buffer.finish();
}
