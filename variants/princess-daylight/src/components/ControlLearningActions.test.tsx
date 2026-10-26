/*
[INPUT]: AimControls/AimDial 的真实事件处理器、可控成功回执与计时器
[OUTPUT]: 边界钳制无变化不学习、成功松手才学习、取消/禁用不学习、持续调整回执累积回归
[POS]: 逐控件学习动作门禁；通过 SSR 捕获处理器，不启动浏览器或物理循环
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { Children, isValidElement, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markControlLearned } from '../control-onboarding';
import { AimControls, AIM_BUTTON_HOLD_DELAY_MS, AIM_BUTTON_HOLD_REPEAT_MS } from './AimControls';
import { AimDial } from './AimDial';

vi.mock('../control-onboarding', async importOriginal => ({
  ...await importOriginal<typeof import('../control-onboarding')>(),
  markControlLearned: vi.fn(),
}));

type ControlProps = HTMLAttributes<HTMLElement> & { 'data-control-tip'?: string; children?: ReactNode };
function control(node: ReactNode, id: string): ReactElement<ControlProps> {
  if (isValidElement<ControlProps>(node)) {
    if (node.props['data-control-tip'] === id) return node;
    for (const child of Children.toArray(node.props.children)) {
      try { return control(child, id); } catch { /* 继续寻找兄弟控件。 */ }
    }
  }
  throw new Error(`missing control: ${id}`);
}

function mount<T extends ReactNode>(render: () => T): T {
  let tree!: T;
  function Harness() { tree = render(); return null; }
  renderToStaticMarkup(<Harness />);
  return tree;
}

function pointer(x: number, y = 100) {
  return {
    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, pressure: 0.5,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() },
  } as unknown as React.PointerEvent<HTMLElement>;
}
function key(keyName: string) {
  return { key: keyName, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('方向键只学习真实成功', () => {
  it.each([false, true])('Pointer 真实变化=%s，只在松手时决定学习', changed => {
    const onAdjust = vi.fn(() => changed);
    const button = control(mount(() => AimControls({ disabled: false, onAdjust })), 'aim-left').props;
    button.onPointerDown?.(pointer(100));
    expect(markControlLearned).not.toHaveBeenCalled();
    button.onPointerUp?.(pointer(100));
    expect(markControlLearned).toHaveBeenCalledTimes(changed ? 1 : 0);
  });

  it('取消/禁用不学习，Keyboard 也检查真实变化', () => {
    const onAdjust = vi.fn(() => true);
    const button = control(mount(() => AimControls({ disabled: false, onAdjust })), 'aim-right').props;
    button.onPointerDown?.(pointer(100));
    button.onPointerCancel?.(pointer(100));
    button.onPointerUp?.(pointer(100));
    expect(markControlLearned).not.toHaveBeenCalled();
    onAdjust.mockReturnValue(false);
    button.onClick?.({ detail: 0 } as React.MouseEvent<HTMLElement>);
    expect(markControlLearned).not.toHaveBeenCalled();
    onAdjust.mockReturnValue(true);
    button.onClick?.({ detail: 0 } as React.MouseEvent<HTMLElement>);
    expect(markControlLearned).toHaveBeenCalledWith('aim-right');
    vi.mocked(markControlLearned).mockClear();
    const disabled = control(mount(() => AimControls({ disabled: true, onAdjust })), 'aim-right').props;
    disabled.onPointerDown?.(pointer(100));
    disabled.onPointerUp?.(pointer(100));
    disabled.onClick?.({ detail: 0 } as React.MouseEvent<HTMLElement>);
    expect(markControlLearned).not.toHaveBeenCalled();
  });

  it('长按仍执行每次调整，并保留任意一次成功回执', () => {
    const onAdjust = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValue(false);
    const button = control(mount(() => AimControls({ disabled: false, onAdjust })), 'aim-left').props;
    button.onPointerDown?.(pointer(100));
    vi.advanceTimersByTime(AIM_BUTTON_HOLD_DELAY_MS + AIM_BUTTON_HOLD_REPEAT_MS * 2);
    expect(onAdjust).toHaveBeenCalledTimes(4);
    expect(markControlLearned).not.toHaveBeenCalled();
    button.onPointerUp?.(pointer(100));
    expect(markControlLearned).toHaveBeenCalledWith('aim-left');
  });
});

describe('拨轮只学习真实成功', () => {
  function dial(onAdjust = vi.fn(() => false), onTogglePrecision = vi.fn(() => false)) {
    const tree = mount(() => AimDial({ visible: true, precisionActive: false, orientation: 'horizontal', onAdjust, onTogglePrecision }));
    return { props: control(tree, 'aim-dial').props, onAdjust, onTogglePrecision };
  }

  it.each([false, true])('一次拖动真实变化=%s，不以原始行程判断成功', changed => {
    const { props, onAdjust } = dial(vi.fn(() => changed));
    props.onPointerDown?.(pointer(100));
    props.onPointerMove?.(pointer(140));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(markControlLearned).not.toHaveBeenCalled();
    props.onPointerUp?.(pointer(140));
    expect(markControlLearned).toHaveBeenCalledTimes(changed ? 1 : 0);
  });

  it('取消不学习；后续无变化不会清掉本手势先前的真实成功', () => {
    const { props, onAdjust } = dial(vi.fn(() => true));
    props.onPointerDown?.(pointer(100));
    props.onPointerMove?.(pointer(140));
    props.onPointerCancel?.(pointer(140));
    props.onPointerUp?.(pointer(140));
    expect(markControlLearned).not.toHaveBeenCalled();
    props.onPointerDown?.(pointer(100));
    props.onPointerMove?.(pointer(120));
    onAdjust.mockReturnValue(false);
    props.onPointerMove?.(pointer(140));
    props.onPointerUp?.(pointer(140));
    expect(markControlLearned).toHaveBeenCalledWith('aim-dial');
  });

  it('轻点与键盘切档/拨动各自检查真实回执', () => {
    const { props, onAdjust, onTogglePrecision } = dial();
    props.onPointerDown?.(pointer(100));
    props.onPointerUp?.(pointer(100));
    props.onKeyDown?.(key('Enter'));
    props.onKeyDown?.(key('ArrowRight'));
    expect(markControlLearned).not.toHaveBeenCalled();
    onTogglePrecision.mockReturnValue(true);
    props.onKeyDown?.(key(' '));
    expect(markControlLearned).toHaveBeenCalledTimes(1);
    onAdjust.mockReturnValue(true);
    props.onKeyDown?.(key('ArrowRight'));
    expect(markControlLearned).toHaveBeenCalledTimes(2);
  });
});
