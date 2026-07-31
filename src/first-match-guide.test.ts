/*
[INPUT]: first-match-guide 纯步骤状态机与可控 Storage 替身
[OUTPUT]: 覆盖首局步骤推进、越级防护、完成持久化与受限存储降级
[POS]: 首次引导产品状态门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it, vi } from 'vitest';
import {
  FIRST_MATCH_GUIDE_STORAGE_KEY,
  guideStepAfterEvent,
  nextFirstMatchGuideStep,
  saveFirstMatchGuideCompleted,
  shouldRunFirstMatchGuide,
} from './first-match-guide';

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
  it('未完成时启用，完成后不再打扰', () => {
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

describe('首局引导步骤', () => {
  it('按放球、开球瞄准与出杆事实推进', () => {
    expect(guideStepAfterEvent('break-place', 'cue-placed')).toBe('break-aim');
    expect(guideStepAfterEvent('break-aim', 'aim-used')).toBe('break-power');
    expect(guideStepAfterEvent('break-power', 'shot-committed')).toBe('player-aim');
  });

  it('玩家回合按瞄准、视角、击球点与出杆依次推进', () => {
    expect(guideStepAfterEvent('player-aim', 'aim-used')).toBe('view');
    expect(guideStepAfterEvent('view', 'view-used')).toBe('spin');
    expect(guideStepAfterEvent('spin', 'spin-used')).toBe('power');
    expect(guideStepAfterEvent('power', 'shot-committed')).toBe('layout');
    expect(nextFirstMatchGuideStep('layout')).toBeNull();
  });

  it('无关操作不能越过当前步骤，开球直接出杆仍可收敛', () => {
    expect(guideStepAfterEvent('break-place', 'view-used')).toBe('break-place');
    expect(guideStepAfterEvent('view', 'spin-used')).toBe('view');
    expect(guideStepAfterEvent('break-aim', 'shot-committed')).toBe('player-aim');
    expect(guideStepAfterEvent('break-place', 'shot-committed')).toBe('player-aim');
  });
});
