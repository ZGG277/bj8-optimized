/*
[INPUT]: AimControls 服务端静态渲染结果
[OUTPUT]: 断言可选方向键微调入口、球杆中线与禁用语义
[POS]: 方向键瞄准控件结构门禁，不依赖浏览器 Pointer 实现
[PROTOCOL]: 变更时更新此头部，然后检查 components/CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AIM_BUTTON_FINE_STEP_RAD,
  AIM_BUTTON_HOLD_DELAY_MS,
  AIM_BUTTON_HOLD_REPEAT_MS,
  AimControls,
} from './AimControls';

describe('AimControls 可选方向键微调结构', () => {
  it('提供球杆两侧的左右按钮', () => {
    const markup = renderToStaticMarkup(
      <AimControls disabled={false} onAdjust={() => {}} />,
    );
    expect(markup).toContain('aria-label="球杆方向微调"');
    expect(markup).toContain('aria-label="瞄准向左微调"');
    expect(markup).toContain('aria-label="瞄准向右微调"');
    expect(markup.match(/data-control-content-hold="aim-button"/g)).toHaveLength(2);
    expect(markup).toContain('aim-controls-cue');
    expect(markup).not.toContain('disabled');
  });

  it('点击使用固定精瞄步长，长按以低速节奏连续提交', () => {
    expect(AIM_BUTTON_FINE_STEP_RAD).toBe(0.004);
    expect(AIM_BUTTON_HOLD_DELAY_MS).toBeGreaterThanOrEqual(300);
    expect(AIM_BUTTON_HOLD_REPEAT_MS).toBeGreaterThanOrEqual(120);
    expect(AIM_BUTTON_FINE_STEP_RAD * 1000 / AIM_BUTTON_HOLD_REPEAT_MS)
      .toBeLessThan(0.04);
  });

  it('禁用态同时禁用两个按钮', () => {
    const markup = renderToStaticMarkup(
      <AimControls disabled onAdjust={() => {}} />,
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});
