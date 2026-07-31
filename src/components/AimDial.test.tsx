/*
[INPUT]: AimDial 服务端静态渲染结果与用户显式粗/精档状态
[OUTPUT]: 断言默认不自动精瞄、显式精瞄状态与键鼠/触控无障碍语义
[POS]: 方向拨轮结构门禁，不依赖浏览器 Pointer 实现或袋口几何
[PROTOCOL]: 变更时更新此头部，然后检查 components/CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AimDial } from './AimDial';

function render(precisionActive: boolean): string {
  return renderToStaticMarkup(
    <AimDial
      visible
      precisionActive={precisionActive}
      orientation="horizontal"
      onAdjust={() => {}}
      onTogglePrecision={() => {}}
    />,
  );
}

describe('AimDial 手动精瞄结构', () => {
  it('默认保持粗档，并明确提示轻点后才启用精瞄', () => {
    const markup = render(false);
    expect(markup).toContain('aim-dial coarse');
    expect(markup).toContain('data-precision-active="false"');
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('轻点启用精瞄');
    expect(markup).not.toContain('接近');
  });

  it('只在外部显式状态开启后展示精瞄档', () => {
    const markup = render(true);
    expect(markup).toContain('aim-dial fine');
    expect(markup).toContain('data-precision-active="true"');
    expect(markup).toContain('aria-valuenow="1"');
    expect(markup).toContain('精瞄已启用');
  });
});
