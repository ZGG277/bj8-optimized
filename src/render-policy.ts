/*
[INPUT]: 视口 CSS 尺寸、设备像素比与粗指针能力
[OUTPUT]: 对外输出设备基线预算与 balanced/warm/hot 的像素比、阴影、帧率和合成档位
[POS]: 3D 渲染预算纯策略层；不依赖 Three.js、React 或浏览器全局，可单测
[PROTOCOL]: 阈值或预算变化时，同步更新本注释、render-policy.test.ts 与 src/CLAUDE.md
*/

export type RenderBudget = {
  mobile: boolean;
  pixelRatio: number;
  shadowMapSize: 1024 | 1536;
  powerPreference: WebGLPowerPreference;
  movingPresentationFps: 30 | 45;
};

export type RenderQualityTier = 'balanced' | 'warm' | 'hot';

export type AdaptiveRenderQuality = {
  tier: RenderQualityTier;
  pixelRatio: number;
  shadowMapSize: 512 | 1024 | 1536;
  movingPresentationFps: 20 | 24 | 30 | 45 | 60;
  backdropBlur: boolean;
};

export type RenderEnvironment = {
  width: number;
  height: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
};

const MOBILE_SHORT_EDGE = 600;
const MOBILE_PIXEL_RATIO_CAP = 2;
const MOBILE_MOVING_PRESENTATION_FPS = 45;
export const DESKTOP_PIXEL_RATIO_CAP = 1.75;
export const DESKTOP_MOVING_PRESENTATION_FPS = 30;
const DESKTOP_SHADOW_MAP_SIZE = 1536;

/**
 * 手机优先控制实际着色像素与阴影面积。粗指针覆盖横屏手机；短边阈值覆盖
 * 未正确暴露 pointer media feature 的内嵌浏览器。CSS 布局与交互坐标不变。
 */
export function renderBudgetFor(environment: RenderEnvironment): RenderBudget {
  const width = Math.max(1, environment.width);
  const height = Math.max(1, environment.height);
  const dpr = Number.isFinite(environment.devicePixelRatio)
    ? Math.max(1, environment.devicePixelRatio)
    : 1;
  const mobile = environment.coarsePointer || Math.min(width, height) <= MOBILE_SHORT_EDGE;

  return {
    mobile,
    pixelRatio: Math.min(dpr, mobile ? MOBILE_PIXEL_RATIO_CAP : DESKTOP_PIXEL_RATIO_CAP),
    shadowMapSize: mobile ? 1024 : DESKTOP_SHADOW_MAP_SIZE,
    powerPreference: 'low-power',
    movingPresentationFps: mobile
      ? MOBILE_MOVING_PRESENTATION_FPS
      : DESKTOP_MOVING_PRESENTATION_FPS,
  };
}

/**
 * GPU 压力升高时只降表现层成本：像素、阴影、展示帧率与毛玻璃合成。
 * 物理步长、规则与输入采样不受影响。
 */
export function adaptiveRenderQualityFor(
  budget: RenderBudget,
  tier: RenderQualityTier,
): AdaptiveRenderQuality {
  if (tier === 'hot') {
    return {
      tier,
      pixelRatio: budget.mobile ? Math.min(budget.pixelRatio, 1.25) : 1,
      shadowMapSize: 512,
      movingPresentationFps: budget.mobile ? 24 : 20,
      backdropBlur: false,
    };
  }

  if (tier === 'warm') {
    return {
      tier,
      pixelRatio: Math.min(budget.pixelRatio, budget.mobile ? 1.5 : 1.25),
      shadowMapSize: 1024,
      movingPresentationFps: budget.mobile ? 30 : 24,
      backdropBlur: false,
    };
  }

  return {
    tier,
    pixelRatio: budget.pixelRatio,
    shadowMapSize: budget.shadowMapSize,
    movingPresentationFps: budget.movingPresentationFps,
    backdropBlur: true,
  };
}
