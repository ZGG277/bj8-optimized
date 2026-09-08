/*
[INPUT]: 只读物理库边段、球半径与具名渲染剖面尺寸
[OUTPUT]: 共用库边实体、米制包呢 UV 与跨短角衬连续法线；不改变鼻尖/物理尺寸
[POS]: 纯渲染几何；从 Scene3D 原样提取现有剖面和生成器，供最终实体测试消费
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { TABLE, CUSHION_SEGMENTS, type CushionSegment, type Point2 } from '../physics';
import { cushionJoinOutward } from './cushion-join';

export const TABLE_RENDER = {
  railHeight: 0.045,
  railWidth: 0.07,
  cushionHeight: 0.038,
  cushionWidth: 0.048,
  cushionTopInset: 0.0075,
  cushionBaseRecess: 0.019,
  bevelSize: 0.003,
  bevelHeight: 0.002,
  capThickness: 0.007,
  capLift: 0.003,
  apronThickness: 0.0015,
  apronBottom: 0.0035,
  cornerTrimWidth: 0.023,
  sideTrimWidth: 0.019,
} as const;
const CUSHION_W = TABLE_RENDER.cushionWidth;
const CUSHION_H = TABLE_RENDER.cushionHeight;
const CUSHION_BASE_RECESS = TABLE_RENDER.cushionBaseRecess;
export const CUSHION_NOSE_HEIGHT = TABLE.ballRadius * 1.24;
export const CUSHION_PROFILE: ReadonlyArray<readonly [outwardOffset: number, y: number]> = [
  [CUSHION_W, 0.001],
  [CUSHION_W, CUSHION_H],
  [TABLE_RENDER.cushionTopInset, CUSHION_H],
  [0.0008, CUSHION_NOSE_HEIGHT + 0.0012],
  [0, CUSHION_NOSE_HEIGHT],
  [0.0015, CUSHION_NOSE_HEIGHT - 0.003],
  [0.0045, 0.021],
  [0.0115, 0.009],
  [CUSHION_BASE_RECESS, 0.001],
];

export function makeCushionGeometry(segment: CushionSegment, segments: readonly CushionSegment[] = CUSHION_SEGMENTS) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const joinA = cushionJoinOutward(segment, segment.a, segments);
  const joinB = cushionJoinOutward(segment, segment.b, segments);
  const length = Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z);
  let wrapDistance = 0;
  let onCap = false;
  let previousProfile = CUSHION_PROFILE[0];
  const appendProfileVertex = (point: Point2, outwardOffset: number, y: number) => {
    // 共端点剖面采用相同斜接，禁止每段独立沿法线挤出而令顶面重叠闪烁。
    const outward = point === segment.a ? joinA : joinB;
    positions.push(
      point.x + outward.x * outwardOffset,
      y,
      point.z + outward.z * outwardOffset,
    );
    // UV 以米为单位；材质纹理统一除以 160mm，鼻尖前后保持相同织纹尺度。
    uvs.push(onCap ? outwardOffset : point === segment.a ? 0 : length, onCap ? y : wrapDistance);
  };

  // 侧面共享剖面顶点，使法线在鼻尖与内凹曲面之间连续过渡。
  for (const [outwardOffset, y] of CUSHION_PROFILE) {
    wrapDistance += Math.hypot(outwardOffset - previousProfile[0], y - previousProfile[1]);
    previousProfile = [outwardOffset, y];
    appendProfileVertex(segment.a, outwardOffset, y);
    appendProfileVertex(segment.b, outwardOffset, y);
  }
  for (let index = 0; index < CUSHION_PROFILE.length; index += 1) {
    const next = (index + 1) % CUSHION_PROFILE.length;
    const a = index * 2;
    const b = a + 1;
    const nextA = next * 2;
    const nextB = nextA + 1;
    indices.push(a, nextA, nextB, a, nextB, b);
  }

  // 端盖使用独立顶点，避免短角衬的端面法线污染绒面剖面的高光。
  onCap = true;
  const capAStart = positions.length / 3;
  for (const [outwardOffset, y] of CUSHION_PROFILE) {
    appendProfileVertex(segment.a, outwardOffset, y);
  }
  const capBStart = positions.length / 3;
  for (const [outwardOffset, y] of CUSHION_PROFILE) {
    appendProfileVertex(segment.b, outwardOffset, y);
  }
  for (let index = 1; index < CUSHION_PROFILE.length - 1; index += 1) {
    indices.push(capAStart, capAStart + index + 1, capAStart + index);
    indices.push(capBStart, capBStart + index, capBStart + index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 极短圆弧段的三角面积不同，自动平均会在每段接头出现竖条高光。
  // 用同一剖面与共端点斜接方向计算侧面法线；端盖继续保留独立硬边。
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < CUSHION_PROFILE.length; i++) {
    // 顶面/背面沿用实体三角法线，仅对可见鼻尖和内凹面消除短角衬接头。
    if (i < 3 || i === CUSHION_PROFILE.length - 1) continue;
    const current = CUSHION_PROFILE[i];
    const previous = CUSHION_PROFILE[(i + CUSHION_PROFILE.length - 1) % CUSHION_PROFILE.length];
    const next = CUSHION_PROFILE[(i + 1) % CUSHION_PROFILE.length];
    const before = new THREE.Vector2(current[1] - previous[1], previous[0] - current[0]).normalize();
    const after = new THREE.Vector2(next[1] - current[1], current[0] - next[0]).normalize();
    const profileNormal = before.add(after).normalize();
    for (const [end, outward] of [joinA, joinB].entries()) {
      const lengthSq = outward.x ** 2 + outward.z ** 2;
      const normal = new THREE.Vector3(outward.x * profileNormal.x / lengthSq,
        profileNormal.y, outward.z * profileNormal.x / lengthSq).normalize();
      normals.setXYZ(i * 2 + end, normal.x, normal.y, normal.z);
    }
  }
  geometry.computeBoundingSphere();
  return geometry;
}
