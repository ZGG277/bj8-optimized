/*
[INPUT]: 六袋共享裁口边界、只读台面尺寸与木帮外轮廓/倒角参数
[OUTPUT]: 同源孔边的实体木框；保留外圆角和外倒角，皮圈接口不再二次偏移
[POS]: 渲染装配纯几何；没有独立袋型曲线或扩口常量
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { TABLE, type Point2 } from '../physics';
import type { PocketSurfaceContract } from './seam-contract';
import { TABLE_RENDER } from './cushion-geometry';

const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);
const area = (points: readonly Point2[]) => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length]; return sum + p.x * q.z - q.x * p.z;
}, 0) / 2;

export function tableFrameOpening(contracts: readonly PocketSurfaceContract[]): Point2[] {
  const byId = new Map(contracts.map(c => [c.pocketIndex, c]));
  const first = byId.get(1)!.frameOpening;
  let previous = first[0].z < first[first.length - 1].z ? first[0] : first[first.length - 1];
  const result: Point2[] = [];
  for (const index of [1, 3, 5, 4, 2, 0]) {
    const path = byId.get(index)!.frameOpening;
    const ordered = distance(previous, path[0]) <= distance(previous, path[path.length - 1]) ? path : path.slice().reverse();
    for (const p of ordered) if (!result.length || distance(result[result.length - 1], p) > 1e-10) result.push(p);
    previous = result[result.length - 1];
  }
  return result;
}

export function createTableFrameGeometry(contracts: readonly PocketSurfaceContract[]): THREE.BufferGeometry {
  const halfW = TABLE.width / 2 + TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth;
  const halfL = TABLE.length / 2 + TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth;
  const radius = TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth - TABLE_RENDER.bevelSize;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + radius, -halfL);
  shape.lineTo(halfW - radius, -halfL);
  shape.quadraticCurveTo(halfW, -halfL, halfW, -halfL + radius);
  shape.lineTo(halfW, halfL - radius);
  shape.quadraticCurveTo(halfW, halfL, halfW - radius, halfL);
  shape.lineTo(-halfW + radius, halfL);
  shape.quadraticCurveTo(-halfW, halfL, -halfW, halfL - radius);
  shape.lineTo(-halfW, -halfL + radius);
  shape.quadraticCurveTo(-halfW, -halfL, -halfW + radius, -halfL);
  const outer = shape.getPoints(12).slice(0, -1).map(p => ({ x: p.x, z: -p.y }));
  const hole = tableFrameOpening(contracts);
  const outerSign = Math.sign(area(outer));
  const directions = outer.map((p, i) => {
    const before = outer[(i + outer.length - 1) % outer.length], after = outer[(i + 1) % outer.length];
    const a = new THREE.Vector2(p.x - before.x, p.z - before.z).normalize();
    const b = new THREE.Vector2(after.x - p.x, after.z - p.z).normalize();
    const denominator = 1 + a.dot(b);
    return { x: outerSign * (a.y + b.y) / denominator, z: -outerSign * (a.x + b.x) / denominator };
  });
  // The old outer bevel has two quarter-round steps. The interface with leather stays fixed.
  const b = TABLE_RENDER.bevelSize, h = TABLE_RENDER.bevelHeight, top = TABLE_RENDER.railHeight;
  const layers = [[-h, 0], [-h / Math.SQRT2, b / Math.SQRT2], [0, b], [top, b], [top + h / Math.SQRT2, b / Math.SQRT2], [top + h, 0]];
  const positions: number[] = [], uvs: number[] = [];
  const append = (p: THREE.Vector3) => { positions.push(p.x, p.y, p.z); uvs.push(p.x, -p.z); };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, expected: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-24) return;
    for (const p of n.dot(expected) >= 0 ? [a, b, c] : [a, c, b]) append(p);
  };
  const rings = layers.map(([y, offset]) => outer.map((p, i) => new THREE.Vector3(p.x + directions[i].x * offset, y, p.z + directions[i].z * offset)));
  for (let layer = 1; layer < rings.length; layer++) for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const normal = new THREE.Vector3(directions[i].x + directions[j].x, 0, directions[i].z + directions[j].z);
    triangle(rings[layer - 1][i], rings[layer][i], rings[layer - 1][j], normal);
    triangle(rings[layer][i], rings[layer][j], rings[layer - 1][j], normal);
  }
  const flatOuter = outer.map(p => new THREE.Vector2(p.x, -p.z));
  const flatHole = hole.map(p => new THREE.Vector2(p.x, -p.z));
  const faces = THREE.ShapeUtils.triangulateShape(flatOuter, [flatHole]);
  const points = [...outer, ...hole];
  for (const y of [-h, top + h]) {
    for (const face of faces) {
      const v = face.map(i => new THREE.Vector3(points[i].x, y, points[i].z));
      triangle(v[0], v[1], v[2], new THREE.Vector3(0, y < 0 ? -1 : 1, 0));
    }
  }
  const holeSign = Math.sign(area(hole));
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i], b = hole[(i + 1) % hole.length];
    const n = new THREE.Vector3(-(b.z - a.z) * holeSign, 0, (b.x - a.x) * holeSign);
    const loA = new THREE.Vector3(a.x, -h, a.z), hiA = new THREE.Vector3(a.x, top + h, a.z);
    const loB = new THREE.Vector3(b.x, -h, b.z), hiB = new THREE.Vector3(b.x, top + h, b.z);
    triangle(loA, hiA, loB, n); triangle(hiA, hiB, loB, n);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
