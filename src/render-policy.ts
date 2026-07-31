/*
[INPUT]: 视口 CSS 尺寸、设备像素比与粗指针能力
[OUTPUT]: 对外输出 WebGL 像素比、阴影贴图尺寸与 GPU 功耗偏好
[POS]: 3D 渲染预算纯策略层；不依赖 Three.js、React 或浏览器全局，可单测
[PROTOCOL]: 阈值或预算变化时，同步更新本注释、render-policy.test.ts 与 src/CLAUDE.md
*/

export type RenderBudget = {
  mobile: boolean;
  pixelRatio: number;
  shadowMapSize: 1024 | 2048;
  powerPreference: WebGLPowerPreference;
};

export type RenderEnvironment = {
  width: number;
  height: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
};

const MOBILE_SHORT_EDGE = 600;
const MOBILE_PIXEL_RATIO_CAP = 1.25;
const DESKTOP_PIXEL_RATIO_CAP = 2;

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
    shadowMapSize: mobile ? 1024 : 2048,
    powerPreference: mobile ? 'low-power' : 'high-performance',
  };
}

