/*
[INPUT]: PlanStatusNotice 的 computing/failed 服务端静态渲染
[OUTPUT]: 锁定走位开关计算中与无可靠路线两种可见反馈及关闭入口
[POS]: 走位按钮不再“点击无反应”的最小 UI 回归门禁
[PROTOCOL]: 状态文案或关闭语义变化时同步更新 PlanStatusNotice.tsx
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlanStatusNotice } from './PlanStatusNotice';

describe('PlanStatusNotice', () => {
  it('计算中立即给出反馈', () => {
    const markup = renderToStaticMarkup(
      <PlanStatusNotice status="computing" onClose={() => {}} />,
    );
    expect(markup).toContain('走位：正在计算可靠路线…');
    expect(markup).toContain('aria-label="关闭走位提示"');
  });

  it('没有可靠直攻路线时明确说明', () => {
    const markup = renderToStaticMarkup(
      <PlanStatusNotice status="failed" onClose={() => {}} />,
    );
    expect(markup).toContain('走位：当前没有可靠的直接进攻路线');
  });
});
