/*
[INPUT]: ShootControl 出杆提交走廊纯判定函数
[OUTPUT]: 回归顺蓄力方向可越边满力、横向/反向移出则取消
[POS]: 出杆误触取消几何回归，不依赖 DOM
[PROTOCOL]: 取消走廊或容错距离变化时同步更新 ShootControl.tsx 与 components/CLAUDE.md
*/
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CHARGE_ESCAPE_PADDING_PX,
  isChargePointerInCommitCorridor,
  ShootControl,
} from './ShootControl';

const gesture = {
  startX: 100,
  startY: 100,
  rect: { left: 80, right: 120, top: 70, bottom: 170 },
};

describe('isChargePointerInCommitCorridor', () => {
  it('竖向蓄力向下越过控件底部仍可提交满力', () => {
    expect(isChargePointerInCommitCorridor(gesture, 'vertical', 100, 400)).toBe(true);
  });

  it('竖向蓄力缓慢横向移出容错走廊则取消', () => {
    expect(isChargePointerInCommitCorridor(
      gesture,
      'vertical',
      gesture.rect.left - CHARGE_ESCAPE_PADDING_PX - 1,
      130,
    )).toBe(false);
  });

  it('底部横向蓄力向右越边有效，向上移出则取消', () => {
    expect(isChargePointerInCommitCorridor(gesture, 'horizontal', 400, 100)).toBe(true);
    expect(isChargePointerInCommitCorridor(
      gesture,
      'horizontal',
      130,
      gesture.rect.top - CHARGE_ESCAPE_PADDING_PX - 1,
    )).toBe(false);
  });

  it('手指轻微偏离仍在 24px 容错内', () => {
    expect(isChargePointerInCommitCorridor(
      gesture,
      'vertical',
      gesture.rect.right + CHARGE_ESCAPE_PADDING_PX,
      130,
    )).toBe(true);
  });
});

function shootHarness() {
  const callbacks = {
    onBegin: vi.fn(), onUpdate: vi.fn(), onRelease: vi.fn(), onCancel: vi.fn(), onTap: vi.fn(),
  };
  let pad: any;
  function Harness() {
    pad = ShootControl({
      disabled: false, charging: false, power: 0, breaking: false, orientation: 'vertical', ...callbacks,
    }).props.children.props;
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return { pad, callbacks };
}

function pointer(x: number, y: number, pointerId = 1) {
  return {
    clientX: x, clientY: y, pointerId, pointerType: 'touch', button: 0, isPrimary: pointerId === 1,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    currentTarget: {
      getBoundingClientRect: () => gesture.rect,
      setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
    },
  } as any;
}

describe('出杆手势出口', () => {
  it('松手坐标新于最后 move 时仍进入最终力度', () => {
    const { pad, callbacks } = shootHarness();
    pad.onPointerDown(pointer(100, 100));
    pad.onPointerMove(pointer(100, 140));
    pad.onPointerUp(pointer(100, 180));
    expect(callbacks.onUpdate).toHaveBeenCalledWith(140);
    expect(callbacks.onRelease).toHaveBeenCalledWith(180);
  });

  it('第二指和右键不能覆盖或开始当前手势', () => {
    const { pad, callbacks } = shootHarness();
    pad.onPointerDown(pointer(100, 100));
    pad.onPointerDown(pointer(105, 120, 2));
    pad.onPointerUp(pointer(105, 180, 2));
    expect(callbacks.onBegin).toHaveBeenCalledOnce();
    expect(callbacks.onRelease).not.toHaveBeenCalled();
    pad.onPointerUp(pointer(100, 160));
    expect(callbacks.onRelease).toHaveBeenCalledWith(160);
    pad.onPointerDown({ ...pointer(100, 100), pointerType: 'mouse', button: 2 });
    expect(callbacks.onBegin).toHaveBeenCalledOnce();
  });

  it('Enter 自动重复不会连续出杆', () => {
    const { pad, callbacks } = shootHarness();
    pad.onKeyDown({ key: 'Enter', repeat: true, preventDefault: vi.fn() });
    pad.onKeyDown({ key: 'Enter', repeat: false, preventDefault: vi.fn() });
    expect(callbacks.onTap).toHaveBeenCalledOnce();
  });
});
