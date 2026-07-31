/*
[INPUT]: FirstMatchGuide 服务端静态渲染结果
[OUTPUT]: 断言一行提示只保留弱化跳过入口、精瞄需显式切档且不回归手动下一步/完成控件
[POS]: 首局微提示结构门禁，不依赖浏览器布局
[PROTOCOL]: 变更时更新此头部，然后检查 components/CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstMatchGuide } from './FirstMatchGuide';

describe('FirstMatchGuide 微提示结构', () => {
  it('没有下一步或完成按钮，只保留具名跳过入口', () => {
    const markup = renderToStaticMarkup(
      <FirstMatchGuide
        step="break-place"
        visible
        onSkip={() => {}}
      />,
    );

    expect(markup).toContain('放好白球');
    expect(markup).toContain('aria-label="跳过新手引导"');
    expect(markup).not.toContain('下一步');
    expect(markup).not.toContain('完成');
    expect(markup).not.toContain('guide-next');
  });

  it('精瞄提示要求用户先显式轻点拨轮再微调', () => {
    const markup = renderToStaticMarkup(
      <FirstMatchGuide
        step="break-fine"
        visible
        onSkip={() => {}}
      />,
    );

    expect(markup).toContain('轻点拨轮·再拨精瞄');
  });
});
