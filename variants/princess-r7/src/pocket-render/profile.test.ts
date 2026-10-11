/*
[INPUT]: 六袋 PocketGeometry 与共享 profile
[OUTPUT]: 验证 Scene3D pocket-well 的实际顶/底椭圆参数和完整球体可容纳性
[POS]: profile 纯回归；不改物理袋口宽度
[PROTOCOL]: 变更时更新此头部，然后检查 ../CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { POCKETS } from '../physics';
import {
  pocketRenderProfile,
  pocketWellContainsBallCenter,
  pocketWellCrossSectionAtY,
} from './profile';

describe('pocket render profile', () => {
  it('uses the exact physical opening and exposes the same two ellipses as pocket-well', () => {
    for (const pocket of POCKETS) {
      const profile = pocketRenderProfile(pocket);
      const top = pocketWellCrossSectionAtY(profile, profile.wellTopY);
      const bottom = pocketWellCrossSectionAtY(profile, profile.wellBottomY);
      expect(profile.visibleHoleHalfWidth).toBe(pocket.mouthHalfWidth);
      expect(profile.captureHalfWidth).toBe(pocket.dropHalfWidth);
      expect(profile.captureHalfWidth).toBeLessThan(profile.visibleHoleHalfWidth);
      expect(top.centerDepth).toBe(profile.topCenterDepth);
      expect(top.depthRadius).toBe(profile.topDepthRadius);
      expect(top.lateralRadius).toBe(profile.topLateralRadius);
      expect(bottom.centerDepth).toBe(profile.bottomCenterDepth);
      expect(bottom.depthRadius).toBe(profile.bottomDepthRadius);
      expect(bottom.lateralRadius).toBe(profile.bottomLateralRadius);
      expect(top.lateralRadius).toBe(profile.visibleHoleHalfWidth);
      expect(bottom.lateralRadius).toBe(profile.bottomHalfWidth);
      expect(Math.min(bottom.depthRadius, bottom.lateralRadius)).toBeGreaterThan(profile.ballRadius);
      expect(pocketWellContainsBallCenter(profile, profile.wellTopY, top.centerDepth, 0)).toBe(true);
      expect(pocketWellContainsBallCenter(profile, profile.wellBottomY, bottom.centerDepth, 0)).toBe(true);
    }
  });
});
