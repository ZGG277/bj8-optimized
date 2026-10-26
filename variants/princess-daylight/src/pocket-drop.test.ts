/*
[INPUT]: 共享 PocketGeometry、TABLE.ballRadius 与 pocket-well 实际椭圆剖面
[OUTPUT]: 验证入口连续、真实重力、恒尺寸、真实 omega 与逐高度球体截面不穿 well
[POS]: pocket-drop 的纯回归；不模拟或改写物理规则
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { POCKETS, TABLE, pocketLocalToWorld, worldToPocketLocal } from './physics';
import { createPocketDropTrajectory } from './pocket-drop';
import { pocketRenderProfile, pocketWellCrossSectionAtY } from './pocket-render/profile';

describe('pocket drop trajectory', () => {
  const pocket = POCKETS[0];
  const make = (depth: number, lateral: number, vx: number, vz: number, omega = [0, 0, 0]) => {
    const entry = pocketLocalToWorld(pocket, depth, lateral);
    return createPocketDropTrajectory({
      pocket,
      entryX: entry.x,
      entryZ: entry.z,
      entryVx: vx,
      entryVz: vz,
      entryWx: omega[0],
      entryWy: omega[1],
      entryWz: omega[2],
    });
  };

  it('keeps a finite, true-size ball throughout the descent', () => {
    const trajectory = make(0, 0, 2.5, 1.2);
    for (let t = 0; t <= trajectory.duration; t += trajectory.duration / 12) {
      const sample = trajectory.sample(t);
      expect(sample.scale).toBe(1);
      expect(Number.isFinite(sample.x)).toBe(true);
      expect(Number.isFinite(sample.y)).toBe(true);
      expect(Number.isFinite(sample.z)).toBe(true);
    }
  });

  it('preserves slow, fast, and edge event entries exactly at t=0', () => {
    const cases = [
      make(0, 0, pocket.outward.x * 0.25, pocket.outward.z * 0.25),
      make(0, 0, pocket.outward.x * 4, pocket.outward.z * 4),
      make(0, pocket.dropHalfWidth * 0.98, pocket.outward.x * 1.1, pocket.outward.z * 1.1),
    ];
    for (const trajectory of cases) {
      const start = trajectory.sample(0);
      const next = trajectory.sample(1e-6);
      expect(start.scale).toBe(1);
      expect(next.scale).toBe(1);
      expect(Math.hypot(next.x - start.x, next.z - start.z)).toBeLessThan(0.0001);
      expect(Math.abs(next.y - TABLE.ballRadius)).toBeLessThan(1e-9);
    }
  });

  it('preserves entry horizontal velocity to first order during the guide-in stage', () => {
    const outwardSpeed = 1.4;
    const lateralSpeed = 0.32;
    const trajectory = make(
      0,
      0,
      pocket.outward.x * outwardSpeed + pocket.tangent.x * lateralSpeed,
      pocket.outward.z * outwardSpeed + pocket.tangent.z * lateralSpeed,
    );
    const dt = 1e-6;
    const start = worldToPocketLocal(pocket, trajectory.sample(0));
    const next = worldToPocketLocal(pocket, trajectory.sample(dt));
    expect((next.depth - start.depth) / dt).toBeCloseTo(outwardSpeed, 2);
    expect((next.lateral - start.lateral) / dt).toBeCloseTo(lateralSpeed, 2);
  });

  it('holds table height through guide-in, then falls with explicit 9.81 m/s² gravity', () => {
    const trajectory = make(0, 0, pocket.outward.x, pocket.outward.z);
    const fallT = Math.min(0.02, (trajectory.duration - trajectory.entryDuration) / 3);
    const yGuide = trajectory.sample(trajectory.entryDuration).y;
    const y1 = trajectory.sample(trajectory.entryDuration + fallT).y;
    const y2 = trajectory.sample(trajectory.entryDuration + fallT * 2).y;
    expect(yGuide).toBe(TABLE.ballRadius);
    expect(yGuide - y1).toBeCloseTo(0.5 * 9.81 * fallT * fallT, 10);
    expect(y1 - y2).toBeCloseTo(1.5 * 9.81 * fallT * fallT, 10);
  });

  it.each(POCKETS)('keeps every post-entry sphere slice 0.5mm inside actual 36-edge well %i', (testedPocket) => {
    const testedProfile = pocketRenderProfile(testedPocket);
    const entry = pocketLocalToWorld(testedPocket, 0, testedPocket.dropHalfWidth * 0.96);
    const trajectory = createPocketDropTrajectory({
      pocket: testedPocket,
      entryX: entry.x,
      entryZ: entry.z,
      entryVx: testedPocket.outward.x * 2.2 - testedPocket.tangent.x * 0.28,
      entryVz: testedPocket.outward.z * 2.2 - testedPocket.tangent.z * 0.28,
    });
    for (let t = trajectory.entryDuration; t <= trajectory.duration; t += trajectory.duration / 24) {
      const sample = trajectory.sample(t);
      const local = worldToPocketLocal(testedPocket, sample);
      for (let slice = 0; slice <= 24; slice += 1) {
        const sliceY = sample.y - testedProfile.ballRadius + (2 * testedProfile.ballRadius * slice) / 24;
        if (sliceY < testedProfile.wellBottomY || sliceY > testedProfile.wellTopY) continue;
        const radius = Math.sqrt(Math.max(0, testedProfile.ballRadius ** 2 - (sliceY - sample.y) ** 2));
        const section = pocketWellCrossSectionAtY(testedProfile, sliceY);
        const vertices = Array.from({ length: testedProfile.wellRadialSteps }, (_, index) => {
          const angle = (index / testedProfile.wellRadialSteps) * Math.PI * 2;
          return {
            depth: section.centerDepth + Math.sin(angle) * section.depthRadius,
            lateral: Math.cos(angle) * section.lateralRadius,
          };
        });
        // 圆完全落在凸 36 边形内，当且仅当球心到每一条边的距离都至少为圆半径。
        const edgeSigns: number[] = [];
        for (let index = 0; index < vertices.length; index += 1) {
          const a = vertices[index];
          const b = vertices[(index + 1) % vertices.length];
          const edgeDepth = b.depth - a.depth;
          const edgeLateral = b.lateral - a.lateral;
          const edgeLength = Math.hypot(edgeDepth, edgeLateral);
          const cross = edgeDepth * (local.lateral - a.lateral) - edgeLateral * (local.depth - a.depth);
          edgeSigns.push(cross);
          const signedDistance = Math.abs(cross) / edgeLength;
          expect(signedDistance).toBeGreaterThanOrEqual(radius + 0.0005);
        }
        expect(edgeSigns.every(sign => sign >= -1e-9) || edgeSigns.every(sign => sign <= 1e-9)).toBe(true);
      }
    }
  });

  it('uses real omega and leaves a real zero-spin entry still', () => {
    const zero = make(0, 0, pocket.outward.x, pocket.outward.z);
    const spun = make(0, 0, pocket.outward.x, pocket.outward.z, [3, 4, 0]);
    expect(zero.sample(0).spinRate).toBe(0);
    expect(zero.sample(0).spinAxis).toEqual({ x: 0, y: 0, z: 0 });
    expect(spun.sample(0).spinRate).toBe(5);
    expect(spun.sample(0).spinAxis).toEqual({ x: 0.6, y: 0.8, z: 0 });
  });
});
