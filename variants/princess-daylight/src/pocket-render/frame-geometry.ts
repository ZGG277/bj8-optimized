/*
[INPUT]: 六袋共享裁口边界、只读台面尺寸与木帮外轮廓/倒角参数
[OUTPUT]: 同源孔边的实体木框；由真实袋后缘留足承托的圆润外缘和可供相机使用的实际包络
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
const ROUND_WIDTH = 0.008;
/** Keep an actual rail behind every enlarged cavity, including the rounded corners. */
export const FRAME_MINIMUM_BORDER = 0.010;

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

export function frameContours(contracts: readonly PocketSurfaceContract[]) {
  const halfW = TABLE.width / 2 + TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth;
  const halfL = TABLE.length / 2 + TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth;
  const radius = TABLE_RENDER.cushionWidth + TABLE_RENDER.railWidth - TABLE_RENDER.bevelSize;
  // Numeric sampling keeps envelope queries independent of Three.js objects.
  const outer: Point2[] = [{ x: -halfW + radius, z: halfL }];
  const corner = (start: Point2, control: Point2, end: Point2) => {
    outer.push(start);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      outer.push({ x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        z: u * u * start.z + 2 * u * t * control.z + t * t * end.z });
    }
  };
  corner({ x: halfW - radius, z: halfL }, { x: halfW, z: halfL }, { x: halfW, z: halfL - radius });
  corner({ x: halfW, z: -halfL + radius }, { x: halfW, z: -halfL }, { x: halfW - radius, z: -halfL });
  corner({ x: -halfW + radius, z: -halfL }, { x: -halfW, z: -halfL }, { x: -halfW, z: -halfL + radius });
  corner({ x: -halfW, z: halfL - radius }, { x: -halfW, z: halfL }, { x: -halfW + radius, z: halfL });
  outer.pop(); // Closing point is already the first station.
  const hole = tableFrameOpening(contracts).filter((p, i, a) => i === 0 || distance(p, a[i - 1]) > 1e-8);
  const outerSign = Math.sign(area(outer));
  const directions = outer.map((p, i) => {
    const before = outer[(i + outer.length - 1) % outer.length], after = outer[(i + 1) % outer.length];
    const al = distance(before, p), bl = distance(p, after);
    const a = { x: (p.x - before.x) / al, z: (p.z - before.z) / al };
    const b = { x: (after.x - p.x) / bl, z: (after.z - p.z) / bl };
    const denominator = 1 + a.x * b.x + a.z * b.z;
    return { x: outerSign * (a.z + b.z) / denominator, z: -outerSign * (a.x + b.x) / denominator };
  });
  // The narrowest outer contour is the top/bottom cap, inside the roundover.
  // A convex edge's signed clearance detects pockets outside the old frame as
  // well as those too close to its rounded corners. A parallel offset expands
  // every edge by exactly the deficit; the pocket seam itself never moves.
  const capOffset = TABLE_RENDER.bevelSize - ROUND_WIDTH;
  const cap = outer.map((p, i) => ({ x: p.x + directions[i].x * capOffset, z: p.z + directions[i].z * capOffset }));
  let minimumClearance = Infinity;
  for (let i = 0; i < cap.length; i++) {
    const a = cap[i], b = cap[(i + 1) % cap.length];
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    for (const p of hole) minimumClearance = Math.min(minimumClearance,
      outerSign * (dx * (p.z - a.z) - dz * (p.x - a.x)) / length);
  }
  const expansion = Math.max(0, FRAME_MINIMUM_BORDER - minimumClearance);
  return { outer, hole, directions, expansion, halfW, halfL };
}

/** Full mesh envelope, including the outer roundover; camera fitting can share it. */
export function tableFrameEnvelope(contracts: readonly PocketSurfaceContract[]) {
  const { halfW, halfL, expansion } = frameContours(contracts);
  return { halfWidth: halfW + TABLE_RENDER.bevelSize + expansion,
    halfLength: halfL + TABLE_RENDER.bevelSize + expansion, expansion };
}

export function createTableFrameGeometry(contracts: readonly PocketSurfaceContract[], vertical?: { bottom: number; top: number; radius: number }): THREE.BufferGeometry {
  const { outer, hole, directions, expansion } = frameContours(contracts);
  // Six-segment 8×6mm roundover. Heights and the full leather interface stay fixed.
  const b = TABLE_RENDER.bevelSize, h = TABLE_RENDER.bevelHeight, top = TABLE_RENDER.railHeight;
  const roundWidth = vertical?.radius ?? ROUND_WIDTH, roundHeight = vertical?.radius ?? 0.006, roundSteps = 6;
  const bottomY = vertical?.bottom ?? -h, topY = vertical?.top ?? top + h;
  const layers: number[][] = [];
  for (let i = 0; i <= roundSteps; i++) {
    const angle = i / roundSteps * Math.PI / 2;
    layers.push([bottomY + roundHeight * (1 - Math.cos(angle)), b - roundWidth + roundWidth * Math.sin(angle)]);
  }
  for (let i = 0; i <= roundSteps; i++) {
    const angle = i / roundSteps * Math.PI / 2;
    layers.push([topY - roundHeight + roundHeight * Math.sin(angle), b - roundWidth + roundWidth * Math.cos(angle)]);
  }
  const positions: number[] = [], uvs: number[] = [];
  let outerVertexCount = 0;
  const append = (p: THREE.Vector3) => { positions.push(p.x, p.y, p.z); uvs.push(p.x, -p.z); };
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, expected: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-24) return;
    for (const p of n.dot(expected) >= 0 ? [a, b, c] : [a, c, b]) append(p);
  };
  const rings = layers.map(([y, offset]) => outer.map((p, i) => new THREE.Vector3(p.x + directions[i].x * (offset + expansion), y, p.z + directions[i].z * (offset + expansion))));
  for (let layer = 1; layer < rings.length; layer++) for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const normal = new THREE.Vector3(directions[i].x + directions[j].x, 0, directions[i].z + directions[j].z);
    triangle(rings[layer - 1][i], rings[layer][i], rings[layer - 1][j], normal);
    triangle(rings[layer][i], rings[layer][j], rings[layer - 1][j], normal);
  }
  outerVertexCount = positions.length / 3;
  const capOuter = rings[0].map(p => ({ x: p.x, z: p.z }));
  const flatOuter = capOuter.map(p => new THREE.Vector2(p.x, -p.z));
  const flatHole = hole.map(p => new THREE.Vector2(p.x, -p.z));
  const faces = THREE.ShapeUtils.triangulateShape(flatOuter, [flatHole]);
  const points = [...capOuter, ...hole];
  for (const y of [bottomY, topY]) {
    for (const face of faces) {
      const v = face.map(i => new THREE.Vector3(points[i].x, y, points[i].z));
      triangle(v[0], v[1], v[2], new THREE.Vector3(0, y === bottomY ? -1 : 1, 0));
    }
  }
  const holeSign = Math.sign(area(hole));
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i], b = hole[(i + 1) % hole.length];
    const n = new THREE.Vector3(-(b.z - a.z) * holeSign, 0, (b.x - a.x) * holeSign);
    const loA = new THREE.Vector3(a.x, bottomY, a.z), hiA = new THREE.Vector3(a.x, topY, a.z);
    const loB = new THREE.Vector3(b.x, bottomY, b.z), hiB = new THREE.Vector3(b.x, topY, b.z);
    triangle(loA, hiA, loB, n); triangle(hiA, hiB, loB, n);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const normalSums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < outerVertexCount; i++) {
    const key = positions.slice(i * 3, i * 3 + 3).map(v => v.toFixed(8)).join(',');
    const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
    if (normalSums.has(key)) normalSums.get(key)!.add(normal); else normalSums.set(key, normal);
  }
  for (let i = 0; i < outerVertexCount; i++) {
    const key = positions.slice(i * 3, i * 3 + 3).map(v => v.toFixed(8)).join(',');
    const normal = normalSums.get(key)!.clone().normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingSphere();
  return geometry;
}
