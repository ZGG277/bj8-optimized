/*
[INPUT]: 只读 PocketGeometry/profile、实际 jaw 顶部剖面与共端点斜接
[OUTPUT]: 有真实端座的护口站点、同源木框裁口及两侧承托段；世界坐标统一到最终顶点
[POS]: 整个袋口接合区的唯一边界契约；不改物理口宽、台呢或 profile
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { CUSHION_SEGMENTS, pocketLocalToWorld, worldToPocketLocal, type Point2, type PocketGeometry, type CushionSegment } from '../physics';
import type { PocketRenderProfile } from './profile';
import { cushionJoinOutward } from './cushion-join';
import { TABLE_RENDER } from './cushion-geometry';

export type PocketSurfaceStation = {
  inner: Point2;
  outer: Point2;
  outward: Point2;
  seatY: number;
  topY: number;
  apronBottomY: number;
  /** Actual jaw-top station, not a negative-depth decorative extension. */
  supported: boolean;
};
export type PocketSurfaceContract = {
  pocketIndex: number;
  width: number;
  thickness: number;
  stations: readonly PocketSurfaceStation[];
  /** Runs from the left rail back edge, around the pocket, to the right rail back edge. */
  frameOpening: readonly Point2[];
  jawEndIndices: readonly [number, number];
  seatSegments: readonly [readonly CushionSegment[], readonly CushionSegment[]];
};

const REAR_HALF_STEPS = 20;
const add = (p: Point2, v: Point2, k: number): Point2 => ({ x: p.x + v.x * k, z: p.z + v.z * k });
const length = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z);

export function pocketSeamContract(pocket: PocketGeometry, profile: PocketRenderProfile): PocketSurfaceContract {
  const width = pocket.kind === 'corner' ? TABLE_RENDER.cornerTrimWidth : TABLE_RENDER.sideTrimWidth;
  const thickness = TABLE_RENDER.capThickness;
  const half = pocket.jawSegments.length / 2;
  const paths = [pocket.jawSegments.slice(0, half), pocket.jawSegments.slice(half)];
  const jawData = paths.map(segments => {
    const nodes = [segments[0].a, ...segments.map(s => s.b)];
    const offsets = nodes.map((p, i) => cushionJoinOutward(segments[Math.min(i, segments.length - 1)], p, CUSHION_SEGMENTS));
    // A lap at least one cap thickness long, following existing jaw stations exactly.
    let first = nodes.length - 1;
    let lap = 0;
    while (first > 0 && lap < thickness) {
      lap += length(nodes[first], nodes[first - 1]);
      first--;
    }
    const seat = nodes.slice(first).map((p, i): PocketSurfaceStation => {
      const offset = offsets[i + first];
      const n = Math.hypot(offset.x, offset.z);
      return {
        inner: add(p, offset, TABLE_RENDER.cushionTopInset),
        outer: add(p, offset, TABLE_RENDER.cushionTopInset + width),
        outward: { x: offset.x / n, z: offset.z / n },
        seatY: TABLE_RENDER.cushionHeight,
        topY: TABLE_RENDER.cushionHeight + thickness,
        apronBottomY: TABLE_RENDER.cushionHeight,
        supported: true,
      };
    });
    return { seat, back: nodes.map((p, i) => add(p, offsets[i], TABLE_RENDER.cushionWidth)), segments: segments.slice(first) };
  });
  const rear = jawData.map(({ seat }) => {
    const end = seat[seat.length - 1];
    const local = worldToPocketLocal(pocket, end.inner);
    const n = end.outward;
    let tangent = { x: -n.z, z: n.x };
    if (tangent.x * pocket.outward.x + tangent.z * pocket.outward.z < 0) tangent = { x: -tangent.x, z: -tangent.z };
    const depthDerivative = tangent.x * pocket.outward.x + tangent.z * pocket.outward.z;
    const backDepth = profile.topCenterDepth + profile.topDepthRadius;
    const reach = (backDepth - local.depth) / depthDerivative;
    const control = add(end.inner, tangent, reach);
    const back = pocketLocalToWorld(pocket, backDepth, 0);
    const p0 = new THREE.Vector3(end.inner.x, 0, end.inner.z);
    const p1 = new THREE.Vector3(control.x, 0, control.z);
    const p2 = new THREE.Vector3(back.x, 0, back.z);
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const cavity = pocketLocalToWorld(pocket, profile.topCenterDepth, 0);
    return Array.from({ length: REAR_HALF_STEPS + 1 }, (_, i): PocketSurfaceStation => {
      if (i === 0) return end;
      const t = i / REAR_HALF_STEPS;
      const point = curve.getPoint(t);
      const derivative = p1.clone().sub(p0).multiplyScalar(1 - t).add(p2.clone().sub(p1).multiplyScalar(t)).normalize();
      let outward = { x: -derivative.z, z: derivative.x };
      if (outward.x * (point.x - cavity.x) + outward.z * (point.z - cavity.z) < 0) outward = { x: -outward.x, z: -outward.z };
      const seatY = THREE.MathUtils.lerp(TABLE_RENDER.cushionHeight, TABLE_RENDER.railHeight + TABLE_RENDER.capLift - thickness, THREE.MathUtils.smoothstep(t, 0, 1));
      const apronBlend = THREE.MathUtils.smoothstep(point.distanceTo(p0), 0, thickness);
      return {
        inner: { x: point.x, z: point.z },
        outer: add(point, outward, width),
        outward, seatY, topY: seatY + thickness,
        apronBottomY: THREE.MathUtils.lerp(TABLE_RENDER.cushionHeight, TABLE_RENDER.apronBottom, apronBlend),
        supported: false,
      };
    });
  });
  const left = jawData[0].seat;
  const right = jawData[1].seat;
  const stations = [...left, ...rear[0].slice(1), ...rear[1].slice(0, -1).reverse(), ...right.slice(0, -1).reverse()];
  const jawEndIndices = [left.length - 1, stations.length - right.length] as const;
  const frameOpening = [
    ...jawData[0].back,
    ...stations.slice(jawEndIndices[0], jawEndIndices[1] + 1).map(s => s.outer),
    ...jawData[1].back.slice().reverse(),
  ];
  return { pocketIndex: pocket.index, width, thickness, stations, frameOpening, jawEndIndices, seatSegments: [jawData[0].segments, jawData[1].segments] };
}
