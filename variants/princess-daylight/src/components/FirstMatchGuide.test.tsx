/*
[INPUT]: FirstMatchGuide 服务端静态渲染结果
[OUTPUT]: 断言一行提示只保留弱化跳过入口、默认拨轮微调且不回归手动下一步/完成控件
[POS]: 首局微提示结构门禁，不依赖浏览器布局
[PROTOCOL]: 变更时更新此头部，然后检查 components/CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstMatchGuide, gestureForControl } from './FirstMatchGuide';

describe('FirstMatchGuide 微提示结构', () => {
  it('lets the companion say the instruction while retaining the control gesture and skip', () => {
    const markup = renderToStaticMarkup(<FirstMatchGuide step="first-power" visible onSkip={() => {}} onInstruction={() => {}}/>);
    expect(markup).toContain('speech-delivered');
    expect(markup).not.toContain('class="guide-copy"');
    expect(markup).toContain('guide-gesture');
    expect(markup).toContain('跳过新手引导');
  });
  it('蓄力指尖落在球杆热区内，文字如何避让都不改变它', () => {
    const anchor = { left: 344, right: 388, top: 670, bottom: 790, width: 44, height: 120 };
    const hand = gestureForControl(anchor, false, true);
    expect(hand.left + 29 * .6).toBe(366);
    expect(hand.top + 26 * .6).toBeCloseTo(715.6);
    expect(hand.rotation).toBe(0);
  });
  it('横向拨轮的手和箭头以轮盘中心为旋转原点', () => {
    const anchor = { left: 70, right: 330, top: 784, bottom: 836, width: 260, height: 52 };
    const hand = gestureForControl(anchor, true, false);
    expect(hand.left + 29 * .6).toBe(200);
    expect(hand.top + 26 * .6).toBe(810);
    expect(hand.rotation).toBe(-90);
    expect(gestureForControl({ ...anchor, width: 52, height: 260 }, false, false).rotation).toBe(0);
  });
  it('没有下一步或完成按钮，只保留具名跳过入口', () => {
    const markup = renderToStaticMarkup(
      <FirstMatchGuide
        step="break-place"
        visible
        onSkip={() => {}}
      />,
    );

    expect(markup).toContain('放好白球');
    expect(markup.replace(/<[^>]*>/g, '')).toBe('放好白球');
    expect(markup).toContain('gesture-place');
    expect(markup).toContain('aria-label="跳过新手引导"');
    expect(markup).not.toContain('下一步');
    expect(markup).not.toContain('完成');
    expect(markup).not.toContain('guide-next');
  });

  it('精瞄提示默认引导拨轮微调', () => {
    const markup = renderToStaticMarkup(
      <FirstMatchGuide
        step="break-fine"
        visible
        onSkip={() => {}}
      />,
    );

    expect(markup).toContain('拨动瞄准轮微调');
    expect(markup).toContain('gesture-aim');
  });
});
