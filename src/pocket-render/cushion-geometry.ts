/*
[INPUT]: 只读物理库边段、球半径与具名渲染剖面尺寸
[OUTPUT]: Scene3D 和袋口承托契约共用的实际库边实体；不改变鼻尖/物理尺寸
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
  const indices: number[] = [];
  const joinA = cushionJoinOutward(segment, segment.a, segments);
  const joinB = cushionJoinOutward(segment, segment.b, segments);
  const appendProfileVertex = (point: Point2, outwardOffset: number, y: number) => {
    // 共端点剖面采用相同斜接，禁止每段独立沿法线挤出而令顶面重叠闪烁。
    const outward = point === segment.a ? joinA : joinB;
    positions.push(
      point.x + outward.x * outwardOffset,
      y,
      point.z + outward.z * outwardOffset,
    );
  };

  // 侧面共享剖面顶点，使法线在鼻尖与内凹曲面之间连续过渡。
  for (const [outwardOffset, y] of CUSHION_PROFILE) {
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
