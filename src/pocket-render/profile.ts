/*
[INPUT]: 共享 PocketGeometry 的真实袋口、捕获线与袋腔参数
[OUTPUT]: Scene3D 可见剖面统一尺寸；明确区分实际孔洞与球心捕获线
[POS]: 只读视觉剖面契约，禁止借由渲染放宽六袋尺寸或物理规则
[PROTOCOL]: 变更时更新此头部，然后检查 ../CLAUDE.md
*/
import { TABLE, type PocketGeometry } from '../physics';

export type PocketRenderProfile = {
  /** 实际可见孔洞半宽，逐字复用 physics mouthHalfWidth。 */
  visibleHoleHalfWidth: number;
  /** 球心捕获线半宽，必须小于实际孔洞，不可被用作孔洞渲染宽度。 */
  captureHalfWidth: number;
  /** 袋腔第一层半径；只沿深度延展，不向横向扩大孔洞。 */
  wellDepthRadius: number;
  bottomDepthRadius: number;
  bottomHalfWidth: number;
  /** 所有袋腔约束都基于共享球半径，不能用渲染硬编码替代。 */
  ballRadius: number;
  /** 以下八项与 Scene3D pocket-well 顶/底两圈逐项共用，不能各自推导。 */
  wellTopY: number;
  wellBottomY: number;
  topCenterDepth: number;
  bottomCenterDepth: number;
  topDepthRadius: number;
  topLateralRadius: number;
  bottomLateralRadius: number;
  /** 与 Scene3D pocket-well BufferGeometry 完全相同的横截面多边形边数。 */
  wellRadialSteps: number;
};

export function pocketRenderProfile(pocket: PocketGeometry): PocketRenderProfile {
  const wellDepthRadius = pocket.shelfDepth + (pocket.kind === 'corner' ? 0.016 : 0.014);
  const ballRadius = TABLE.ballRadius;
  const bottomHalfWidth = pocket.mouthHalfWidth * 0.66;
  const topCenterDepth = wellDepthRadius + 0.002;
  const bottomCenterDepth = topCenterDepth + 0.012;
  // 中袋原 0.64 缩深会小于球半径，球体无法真正落到 lower ellipse 中心。
  // 只加深袋腔深向半轴（不变更开口宽度/物理规则），留 1.5mm 视觉余量。
  const bottomDepthRadius = Math.max(wellDepthRadius * 0.64, ballRadius + 0.0015);
  return {
    visibleHoleHalfWidth: pocket.mouthHalfWidth,
    captureHalfWidth: pocket.dropHalfWidth,
    wellDepthRadius,
    bottomDepthRadius,
    bottomHalfWidth,
    ballRadius,
    wellTopY: -0.006,
    wellBottomY: -0.072,
    topCenterDepth,
    bottomCenterDepth,
    topDepthRadius: wellDepthRadius,
    topLateralRadius: pocket.mouthHalfWidth,
    bottomLateralRadius: bottomHalfWidth,
    wellRadialSteps: 36,
  };
}

export type PocketWellCrossSection = {
  y: number;
  centerDepth: number;
  depthRadius: number;
  lateralRadius: number;
};

/** 读取与 pocket-well 网格相同的、按高度线性连接的椭圆横截面。 */
export function pocketWellCrossSectionAtY(
  profile: PocketRenderProfile,
  y: number,
): PocketWellCrossSection {
  const span = Math.max(1e-6, profile.wellTopY - profile.wellBottomY);
  const progress = Math.min(1, Math.max(0, (profile.wellTopY - y) / span));
  return {
    y,
    centerDepth: profile.topCenterDepth
      + (profile.bottomCenterDepth - profile.topCenterDepth) * progress,
    depthRadius: profile.topDepthRadius
      + (profile.bottomDepthRadius - profile.topDepthRadius) * progress,
    lateralRadius: profile.topLateralRadius
      + (profile.bottomLateralRadius - profile.topLateralRadius) * progress,
  };
}

/**
 * 对实际椭圆横截面做统一缩小，给整个球体（而非球心）留出半径余量。
 * 这是保守的有限可视约束，并非刚体接触/反弹求解。
 */
export function pocketWellContainsBallCenter(
  profile: PocketRenderProfile,
  y: number,
  depth: number,
  lateral: number,
): boolean {
  const section = pocketWellCrossSectionAtY(profile, y);
  const minimumRadius = Math.min(section.depthRadius, section.lateralRadius);
  const safeScale = Math.max(0, 1 - profile.ballRadius / minimumRadius);
  if (safeScale <= 0) return false;
  const depthNorm = (depth - section.centerDepth) / (section.depthRadius * safeScale);
  const lateralNorm = lateral / (section.lateralRadius * safeScale);
  return depthNorm * depthNorm + lateralNorm * lateralNorm <= 1 + 1e-9;
}
