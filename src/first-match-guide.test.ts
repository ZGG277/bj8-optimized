/*
[INPUT]: first-match-guide 纯状态机、有效角度判定与可控 Storage 替身
[OUTPUT]: 覆盖真实动作推进、误触防护、直接出杆收敛、可选发现及持久化
[POS]: 首次引导产品状态门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it, vi } from 'vitest';
import {
  FIRST_MATCH_GUIDE_STORAGE_KEY,
  guideStepAfterEvent,
  isMeaningfulGuideAimChange,
  saveFirstMatchGuideCompleted,
  shouldRunFirstMatchGuide,
} from './first-match-guide';
import { positionForAnchor } from './components/FirstMatchGuide';

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({
      x,
      y,
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
    }),
  };
}

function memoryStorage(initial?: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('首局引导持久化', () => {
  it('未完成时启用，完成或跳过后不再打扰', () => {
    const storage = memoryStorage();
    expect(shouldRunFirstMatchGuide(storage)).toBe(true);
    saveFirstMatchGuideCompleted(storage);
    expect(storage.getItem(FIRST_MATCH_GUIDE_STORAGE_KEY)).toBe('done');
    expect(shouldRunFirstMatchGuide(storage)).toBe(false);
  });

  it('已有真实出杆记录的老用户即使没有引导 key 也不启用', () => {
    expect(shouldRunFirstMatchGuide(memoryStorage(), 1)).toBe(false);
    expect(shouldRunFirstMatchGuide(memoryStorage(), 18)).toBe(false);
  });

  it('本地存储不可用时安全回退为本次可引导', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    } as unknown as Storage;
    expect(shouldRunFirstMatchGuide(storage)).toBe(true);
    expect(() => saveFirstMatchGuideCompleted(storage)).not.toThrow();
  });
});

describe('真实动作判定', () => {
  it('点击、误触和极小抖动不算粗瞄，真实角度拖动才算', () => {
    expect(isMeaningfulGuideAimChange(0.4, 0.4, 0.003)).toBe(false);
    expect(isMeaningfulGuideAimChange(0.4, 0.401, 0.003)).toBe(false);
    expect(isMeaningfulGuideAimChange(0.4, 0.43, 0.003)).toBe(true);
  });

  it('跨越 -pi/pi 时仍按最短角度判断', () => {
    expect(isMeaningfulGuideAimChange(Math.PI - 0.01, -Math.PI + 0.02, 0.003)).toBe(true);
  });
});

describe('首局微提示状态机', () => {
  it('开球只按放球、粗瞄、拨轮与成功出杆事实推进', () => {
    expect(guideStepAfterEvent('break-place', 'cue-placed')).toBe('break-coarse');
    expect(guideStepAfterEvent('break-coarse', 'coarse-aim-adjusted')).toBe('break-fine');
    expect(guideStepAfterEvent('break-fine', 'fine-aim-adjusted')).toBe('break-power');
    expect(guideStepAfterEvent('break-power', 'shot-committed')).toBe('player-view');
  });

  it('误触或与当前提示无关的操作不推进', () => {
    expect(guideStepAfterEvent('break-place', 'coarse-aim-adjusted')).toBe('break-place');
    expect(guideStepAfterEvent('break-coarse', 'view-adjusted')).toBe('break-coarse');
    expect(guideStepAfterEvent('break-fine', 'spin-adjusted')).toBe('break-fine');
  });

  it('先拨轮也是有效瞄准，可从粗瞄提示直接进入蓄力', () => {
    expect(guideStepAfterEvent('break-coarse', 'fine-aim-adjusted')).toBe('break-power');
  });

  it('视角、杆法、布局为可选发现，直接出杆从任何玩家提示完成', () => {
    expect(guideStepAfterEvent('player-view', 'view-adjusted')).toBe('player-spin');
    expect(guideStepAfterEvent('player-view', 'spin-adjusted')).toBe('player-layout');
    expect(guideStepAfterEvent('player-spin', 'spin-adjusted')).toBe('player-layout');
    expect(guideStepAfterEvent('player-layout', 'layout-adjusted')).toBeNull();
    expect(guideStepAfterEvent('player-view', 'shot-committed')).toBeNull();
    expect(guideStepAfterEvent('player-spin', 'shot-committed')).toBeNull();
    expect(guideStepAfterEvent('player-layout', 'shot-committed')).toBeNull();
  });

  it('快速直接出杆从任一开球提示安全收敛到非阻塞发现', () => {
    expect(guideStepAfterEvent('break-place', 'shot-committed')).toBe('player-view');
    expect(guideStepAfterEvent('break-coarse', 'shot-committed')).toBe('player-view');
    expect(guideStepAfterEvent('break-fine', 'shot-committed')).toBe('player-view');
  });

  it('390×844 移动端桌面锚定提示避让主题按钮，不与左下角控件重叠', () => {
    const anchor = rect(0, 0, 390, 844);
    const hint = rect(0, 0, 84, 44);
    const themeButton = rect(6, 800, 38, 38);
    const position = positionForAnchor(anchor, hint, true, {
      mobile: true,
      viewportWidth: 390,
      viewportHeight: 844,
      avoidRects: [themeButton],
    });

    expect(position.left).toBe(12);
    expect(position.top).toBe(718);
    expect(position.top + hint.height).toBeLessThanOrEqual(themeButton.top);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top + hint.height).toBeLessThanOrEqual(844 - 8);
  });
});
