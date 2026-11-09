/*
[INPUT]: 已选定台词与本局陪练
[OUTPUT]: 小头像、单句、无可交互卡片与犯规避让的结构验证
[POS]: 台词组件契约回归；真实像素和手势由浏览器验收
[PROTOCOL]: 变更时更新此头部，然后检查CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanionMoment } from './CompanionMoment';
import { COMPANIONS } from '../opponent/companions';

describe('compact opponent speech', () => {
  it('uses the actual small avatar and a single line, with no large card portrait or name panel', () => {
    const c = COMPANIONS[1];
    const html = renderToStaticMarkup(<CompanionMoment dialogue={{ id: 1, sceneId: 'P_ONE', text: '漂亮，接着来', companionId: c.id }} onShown={() => {}}/>);
    expect(html).toContain(c.avatar); expect(html).toContain('width="28" height="28"');
    expect(html).toContain('<p>漂亮，接着来</p>');expect(html).not.toContain('<small>');
    expect(html).toContain('role="status"'); expect(html).toContain(`aria-label="${c.name}说"`);
  });
  it('can move below the separate factual foul sentence without changing its words', () => {
    const html = renderToStaticMarkup(<CompanionMoment dialogue={{ id: 2, sceneId: 'P_SCRATCH', text: '下一杆，重新来' }} afterFoul onShown={() => {}}/>);
    expect(html).toContain('data-after-foul="true"'); expect(html).toContain('下一杆，重新来');
  });
});
