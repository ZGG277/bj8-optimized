/*
[INPUT]: 只读物理库边段、球半径与具名渲染剖面尺寸
[OUTPUT]: 球径同比抬高的库边剖面，防止鼻尖高过库顶；共用库边实体、米制包呢 UV、动态承托与跨短角衬连续法线；开口仍同源
[POS]: 纯渲染几何；消费共享物理段和球半径，供Scene3D与最终实体测试共同使用
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { TABLE, CUSHION_SEGMENTS, type CushionSegment, type Point2 } from '../physics';
import { BALL_SCALE } from '../physics/size-contract';
import { cushionJoinOutward } from './cushion-join';
import { cushionClothCoordinates } from './cloth-coordinates';
import { cushionOffsetPoint } from './cushion-offset';

export const TABLE_RENDER = {
  railHeight: 0.045,
  railWidth: 0.07,
  cushionHeight: 0.038 * BALL_SCALE,
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
  [CUSHION_W, 0.001 * BALL_SCALE],
  [CUSHION_W, CUSHION_H],
  [TABLE_RENDER.cushionTopInset, CUSHION_H],
  [0.0008, CUSHION_NOSE_HEIGHT + 0.0012 * BALL_SCALE],
  [0, CUSHION_NOSE_HEIGHT],
  [0.0015, CUSHION_NOSE_HEIGHT - 0.003 * BALL_SCALE],
  [0.0045, 0.021 * BALL_SCALE],
  [0.0115, 0.009 * BALL_SCALE],
  [CUSHION_BASE_RECESS, 0.001 * BALL_SCALE],
];

export function makeCushionGeometry(segment: CushionSegment, segments: readonly CushionSegment[] = CUSHION_SEGMENTS) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const joinA = cushionJoinOutward(segment, segment.a, segments);
  const joinB = cushionJoinOutward(segment, segment.b, segments);
  const clothU = cushionClothCoordinates(segments).get(segment.id)!;
  let wrapDistance = 0;
  let onCap = false;
  let previousProfile = CUSHION_PROFILE[0];
  const appendProfileVertex = (point: Point2, outwardOffset: number, y: number) => {
    // 共端点剖面采用相同斜接，禁止每段独立沿法线挤出而令顶面重叠闪烁。
    const edge = cushionOffsetPoint(segment, point, outwardOffset, segments);
    positions.push(edge.x, y, edge.z);
    // UV 以米为单位；材质纹理统一除以 160mm，鼻尖前后保持相同织纹尺度。
    uvs.push(onCap ? outwardOffset : clothU[point === segment.a ? 0 : 1], onCap ? y : wrapDistance);
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
  // The undercut profile is concave. A fan from its rear foot crosses the
  // recess and exposes sliver triangles at grazing pocket views.
  const capFaces = THREE.ShapeUtils.triangulateShape(CUSHION_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const exposed = (p: Point2) => !segments.some(s => s !== segment &&
    [s.a, s.b].some(q => Math.hypot(p.x - q.x, p.z - q.z) < 1e-8));
  for (const [a, b, c] of capFaces) {
    if (exposed(segment.a)) indices.push(capAStart + a, capAStart + c, capAStart + b);
    if (exposed(segment.b)) indices.push(capBStart + a, capBStart + b, capBStart + c);
  }
  // Clipped offset loops collapse whole stations; omit zero-area triangles.
  const valid: number[] = [], pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    pa.fromArray(positions, indices[i] * 3); pb.fromArray(positions, indices[i+1] * 3); pc.fromArray(positions, indices[i+2] * 3);
    if (pb.sub(pa).cross(pc.sub(pa)).lengthSq() > 1e-20) valid.push(...indices.slice(i, i+3));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(valid);
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

/**
 * Rebuild the thin cloth support from current cushion footprints. The old GLB
 * contains a baked 100/102mm opening and must never define a second pocket size.
 * Top remains 0.4mm below cloth; no added physical collision or draw call.
 */
export function createTableUnderlapGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const segment of CUSHION_SEGMENTS) {
    const a = cushionJoinOutward(segment, segment.a, CUSHION_SEGMENTS);
    const b = cushionJoinOutward(segment, segment.b, CUSHION_SEGMENTS);
    const point = (p: Point2, _n: Point2, offset: number): Point2 => ({
      ...cushionOffsetPoint(segment, p, offset, CUSHION_SEGMENTS),
    });
    const corners = [point(segment.a, a, -.001), point(segment.b, b, -.001),
      point(segment.b, b, TABLE_RENDER.cushionWidth), point(segment.a, a, TABLE_RENDER.cushionWidth)];
    const base = positions.length / 3;
    for (const y of [-.038, -.0004]) for (const p of corners) positions.push(p.x, y, p.z);
    const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [4, 5, 1, 0], [5, 6, 2, 1], [6, 7, 3, 2], [7, 4, 0, 3]];
    // XZ winding sets opposite outward-facing top/bottom caps.
    const footprintArea = corners.reduce((sum, p, i) => {
      const q = corners[(i + 1) % corners.length]; return sum + p.x * q.z - q.x * p.z;
    }, 0);
    const joined = (p: Point2) => CUSHION_SEGMENTS.some(s => s !== segment && [s.a,s.b].some(q=>Math.hypot(p.x-q.x,p.z-q.z)<1e-8));
    for (const [faceIndex, face] of faces.entries()) {
      if ((faceIndex===3 && joined(segment.b)) || (faceIndex===5 && joined(segment.a))) continue;
      const [i, j, k, l] = footprintArea > 0 ? face : face.slice().reverse();
      indices.push(base + i, base + j, base + k, base + i, base + k, base + l);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const valid:number[]=[];
  for(let i=0;i<indices.length;i+=3){const v=indices.slice(i,i+3).map(n=>new THREE.Vector3().fromArray(positions,n*3));
    if(v[1].sub(v[0]).cross(v[2].sub(v[0])).lengthSq()>1e-20)valid.push(...indices.slice(i,i+3));}
  geometry.setIndex(valid);
  const flat = geometry.toNonIndexed(); geometry.dispose();
  flat.computeVertexNormals(); flat.computeBoundingSphere();
  return flat;
}
