/*
[INPUT]: 提示定位纯函数及 HUD 控件服务端静态结构
[OUTPUT]: 左侧优先/视口避让定位，以及独立控件 ID 与禁用锚点回归
[POS]: 控件新手提示结构单测；真实悬停、键盘及触摸即显/松手收起由浏览器验收覆盖
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { controlTipCopy, controlTipPosition } from './ControlOnboarding';
import { ViewToolbar } from './ViewToolbar';
import { AimControls } from './AimControls';
import { AimDial } from './AimDial';
import { SpinControl } from './SpinControl';
import { ShootControl } from './ShootControl';

describe('控件提示定位与锚点', () => {
  it('右侧或底部横向控件都优先放在控件左侧', () => {
    for (const anchor of [
      { left: 330, top: 180, right: 384, bottom: 330, width: 54, height: 150 },
      { left: 210, top: 760, right: 380, bottom: 814, width: 170, height: 54 },
    ]) {
      const tip = { width: 180, height: 40 };
      const result = controlTipPosition(anchor, tip, 390, 844);
      expect(result.side).toBe('left');
      expect(result.left + tip.width).toBeLessThan(anchor.left);
      expect(result.top).toBeGreaterThanOrEqual(8);
      expect(result.top + tip.height).toBeLessThanOrEqual(836);
    }
  });

  it('左贴屏入口提示留在视口内且放到按钮上方，不挡按钮', () => {
    const anchor = { left: 12, top: 760, right: 56, bottom: 804, width: 44, height: 44 };
    const result = controlTipPosition(anchor, { width: 200, height: 40 }, 390, 844);
    expect(result).toEqual({ left: 8, top: 710, side: 'above' });
  });

  it('动态 data-control-tip-copy 覆写会立即替换当前提示文案', () => {
    expect(controlTipCopy('view-manual', '开启手动视角：拖动球桌旋转观察'))
      .toBe('开启手动视角：拖动球桌旋转观察');
    expect(controlTipCopy('view-manual', '退出手动视角：保留当前观察角度'))
      .toBe('退出手动视角：保留当前观察角度');
    expect(controlTipCopy('view-manual', undefined)).toContain('手动视角');
  });

  it('视角三个按钮与推杆各有独立 ID，禁用不移除无障碍状态', () => {
    const markup = renderToStaticMarkup(<ViewToolbar viewLevel={1} manualCameraActive={false} disabled orientation="vertical" onViewLevel={() => {}} onToggleManualCamera={() => {}} />);
    for (const id of ['view-overhead', 'view-manual', 'view-height', 'view-first-person']) {
      expect(markup).toContain(`data-control-tip="${id}"`);
    }
    expect(markup).toContain('aria-disabled="true"');
  });

  it('俯视与手动视角提供状态准确的常驻速查文字，仍保留可聚焦按钮语义', () => {
    const inactive = renderToStaticMarkup(<ViewToolbar viewLevel={0.5} manualCameraActive={false} disabled={false} orientation="vertical" onViewLevel={() => {}} onToggleManualCamera={() => {}} />);
    const active = renderToStaticMarkup(<ViewToolbar viewLevel={0.5} manualCameraActive disabled={false} orientation="vertical" onViewLevel={() => {}} onToggleManualCamera={() => {}} />);
    expect(inactive).toContain('data-control-tip-copy="俯视：俯视全台"');
    expect(inactive).toContain('data-control-tip-copy="开启手动视角：拖动球桌旋转观察"');
    expect(active).toContain('data-control-tip-copy="退出手动视角：保留当前观察角度"');
    expect(inactive).toContain('aria-label="开启手动视角"');
    expect(active).toContain('aria-label="退出手动视角"');
  });

  it('左右微调、拨轮、击球点与出杆各有精确动作锚点', () => {
    const markup = renderToStaticMarkup(<>
      <AimControls disabled={false} onAdjust={() => true} />
      <AimDial visible precisionActive={false} orientation="horizontal" onAdjust={() => true} onTogglePrecision={() => true} />
      <SpinControl spin={{ x: 0, y: 0 }} disabled={false} onSpinChange={() => {}} />
      <ShootControl disabled={false} charging={false} power={0} breaking orientation="vertical" onBegin={() => {}} onUpdate={() => {}} onRelease={() => {}} onCancel={() => {}} onTap={() => {}} />
    </>);
    for (const id of ['aim-left', 'aim-right', 'aim-dial', 'spin', 'spin-open', 'shoot']) {
      expect(markup).toContain(`data-control-tip="${id}"`);
    }
  });

  it('出杆速查随停靠方向变化，禁用时由非焦点父锚点保留只读说明', () => {
    const props = {
      charging: false, power: 0, breaking: false,
      onBegin: () => {}, onUpdate: () => {}, onRelease: () => {}, onCancel: () => {}, onTap: () => {},
    };
    const vertical = renderToStaticMarkup(<ShootControl {...props} disabled orientation="vertical" />);
    const horizontal = renderToStaticMarkup(<ShootControl {...props} disabled orientation="horizontal" />);
    expect(vertical).toContain('data-control-tip-copy="出杆：向下拉蓄力，松开出杆；横向移出取消；Enter 轻杆"');
    expect(horizontal).toContain('data-control-tip-copy="出杆：向右拉蓄力，松开出杆；纵向移出取消；Enter 轻杆"');
    expect(horizontal).toContain('aria-label="出杆：向右拉蓄力，松开出杆，回车轻杆"');
    expect(vertical).toContain('aria-disabled="true"');
    expect(vertical).toContain('tabindex="-1"');
  });
});
