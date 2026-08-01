/*
[INPUT]: 依赖 render-policy 纯预算函数与 vitest
[OUTPUT]: 回归手机像素/阴影/GPU 预算与桌面清晰度上限
[POS]: 渲染节能策略单元测试，不创建 WebGL 上下文
[PROTOCOL]: 预算阈值变化时同步更新本文件与 render-policy.ts 头部
*/
import { describe, expect, it } from 'vitest';
import { renderBudgetFor } from './render-policy';

describe('renderBudgetFor', () => {
  it('390×844 高 DPR 手机限制实际像素与阴影预算', () => {
    expect(renderBudgetFor({
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      coarsePointer: true,
    })).toEqual({
      mobile: true,
      pixelRatio: 1.25,
      shadowMapSize: 1024,
      powerPreference: 'low-power',
      movingPresentationFps: 30,
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
    expect(budget.pixelRatio).toBe(1.25);
  });

  it('桌面保留 2× 清晰度与 2048 阴影', () => {
    expect(renderBudgetFor({
      width: 1280,
      height: 800,
      devicePixelRatio: 2.5,
      coarsePointer: false,
    })).toMatchObject({
      mobile: false,
      pixelRatio: 2,
      shadowMapSize: 2048,
      powerPreference: 'high-performance',
      movingPresentationFps: 60,
    });
  });
});
