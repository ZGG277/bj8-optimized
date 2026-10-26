/*
[INPUT]: 袋腔局部采样点与低面数绳索半径
[OUTPUT]: 单一 BufferGeometry 合并的圆柱绳网，替代 WebGL 普通细线
[POS]: 袋口表现工具；不含 PocketGeometry 规则或物理判定
[PROTOCOL]: 变更时更新此头部，然后检查 ../CLAUDE.md
*/
import * as THREE from 'three';

export type RopeSegment = readonly [THREE.Vector3, THREE.Vector3];

/**
 * 将每段菱形绳索合进一块四棱柱 BufferGeometry。四边截面在近景有真实厚度，
 * 每袋仍只产生一个 Mesh/draw call；交叉点相互覆盖，省去昂贵的单绳对象。
 */
export function createMergedRopeGeometry(
  segments: readonly RopeSegment[],
  radius = 0.00072,
  radialSegments = 4,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [start, end] of segments) {
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (!Number.isFinite(length) || length < 1e-7) continue;
    axis.multiplyScalar(1 / length);
    const reference = Math.abs(axis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(axis, reference).normalize();
    const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
    const base = positions.length / 3;
    for (const point of [start, end]) {
      for (let side = 0; side < radialSegments; side += 1) {
        const angle = side / radialSegments * Math.PI * 2;
        const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius)
          .addScaledVector(binormal, Math.sin(angle) * radius);
        positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);
      }
    }
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      indices.push(base + side, base + radialSegments + side, base + radialSegments + next);
      indices.push(base + side, base + radialSegments + next, base + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
