/*
[INPUT]: 依赖 render-policy 纯预算函数与 vitest
[OUTPUT]: 回归手机像素/阴影/GPU 预算与桌面清晰度上限
[POS]: 渲染节能策略单元测试，不创建 WebGL 上下文
[PROTOCOL]: 预算阈值变化时同步更新本文件与 render-policy.ts 头部
*/
import { describe, expect, it, vi } from 'vitest';
import { adaptiveRenderQualityFor, cappedPixelRatio, renderBudgetFor } from './render-policy';

describe('minitool clarity within the existing pixel budget', () => {
  it('uses 2x on Retina phones, including resize, while warm/hot still shed load', () => {
    vi.stubEnv('VITE_MINITOOL', '1');
    try {
      for (const [width, height] of [[390, 844], [844, 390]]) {
        const budget = renderBudgetFor({ width, height, devicePixelRatio: 3, coarsePointer: true });
        expect(budget.pixelRatio).toBe(2);
        expect(budget.movingPresentationFps).toBe(30);
        expect(cappedPixelRatio(width, height, budget.pixelRatio, false)).toBe(2);
        expect(adaptiveRenderQualityFor(budget, 'warm').pixelRatio).toBe(1.5);
        expect(adaptiveRenderQualityFor(budget, 'hot').pixelRatio).toBe(1);
      }
    } finally { vi.unstubAllEnvs(); }
  });

  it('never exceeds the unchanged total-pixel ceiling on larger viewports', () => {
    for (const [width, height] of [[390, 844], [1440, 900], [3840, 2160]]) {
      for (const low of [false, true]) {
        const ratio = cappedPixelRatio(width, height, 3, low);
        expect(width * height * ratio * ratio).toBeLessThanOrEqual((low ? 1000000 : 2000000) + .001);
        expect(ratio).toBeLessThanOrEqual(low ? 1 : 2);
      }
    }
    expect(cappedPixelRatio(390, 844, 1, false)).toBe(1);
  });
});

describe('renderBudgetFor', () => {
  it('390×844 高 DPR 手机以 2× 清晰度配合 45Hz 控制功耗', () => {
    expect(renderBudgetFor({
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      coarsePointer: true,
    })).toEqual({
      mobile: true,
      pixelRatio: 2,
      shadowMapSize: 1024,
      powerPreference: 'low-power',
      movingPresentationFps: 45,
    });
  });

  it('粗指针横屏仍按手机预算，不因长边超过阈值误判', () => {
    const budget = renderBudgetFor({
      width: 844,
      height: 390,
      devicePixelRatio: 2.75,
      coarsePointer: true,
    });
    expect(budget.mobile).toBe(true);
    expect(budget.pixelRatio).toBe(2);
  });

  it('桌面用 1.75× 与 1536 阴影、低功耗、30/20Hz 档', () => {
    expect(renderBudgetFor({
      width: 1280,
      height: 800,
      devicePixelRatio: 2.5,
      coarsePointer: false,
    })).toMatchObject({
      mobile: false,
      pixelRatio: 1.75,
      shadowMapSize: 1536,
      powerPreference: 'low-power',
      movingPresentationFps: 30,
    });
  });

  it('高压时逐级降低像素、阴影、帧率与毛玻璃合成', () => {
    const budget = renderBudgetFor({
      width: 1440,
      height: 900,
      devicePixelRatio: 2,
      coarsePointer: false,
    });

    expect(adaptiveRenderQualityFor(budget, 'balanced')).toMatchObject({
      pixelRatio: 1.75,
      shadowMapSize: 1536,
      movingPresentationFps: 30,
      backdropBlur: true,
    });
    expect(adaptiveRenderQualityFor(budget, 'warm')).toMatchObject({
      pixelRatio: 1.25,
      shadowMapSize: 1024,
      movingPresentationFps: 24,
      backdropBlur: false,
    });
    expect(adaptiveRenderQualityFor(budget, 'hot')).toMatchObject({
      pixelRatio: 1,
      shadowMapSize: 512,
      movingPresentationFps: 20,
      backdropBlur: false,
    });
  });

  it('手机温控优先降展示频率，极端高压也保留 1.25× 可读清晰度', () => {
    const budget = renderBudgetFor({
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      coarsePointer: true,
    });

    expect(adaptiveRenderQualityFor(budget, 'balanced')).toMatchObject({
      pixelRatio: 2,
      movingPresentationFps: 45,
    });
    expect(adaptiveRenderQualityFor(budget, 'warm')).toMatchObject({
      pixelRatio: 1.5,
      movingPresentationFps: 30,
    });
    expect(adaptiveRenderQualityFor(budget, 'hot')).toMatchObject({
      pixelRatio: 1.25,
      movingPresentationFps: 24,
    });
  });
});
