/*
[INPUT]: useAimAssist 纯存储函数与模拟 Storage
[OUTPUT]: 首次默认开启、显式 true/false 偏好恢复与受损存储回退断言
[POS]: 瞄准辅助偏好回归测试
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  AIM_ASSIST_STORAGE_KEY,
  loadAimAssistPreference,
  saveAimAssistPreference,
} from './useAimAssist';

describe('aim assist preference', () => {
  it('defaults to on and restores an explicit off/on choice', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    expect(loadAimAssistPreference(storage)).toBe(true);
    saveAimAssistPreference(false, storage);
    expect(data.get(AIM_ASSIST_STORAGE_KEY)).toBe('false');
    expect(loadAimAssistPreference(storage)).toBe(false);
    saveAimAssistPreference(true, storage);
    expect(loadAimAssistPreference(storage)).toBe(true);
  });

  it('falls back to on when storage is unavailable or contains damaged data', () => {
    expect(loadAimAssistPreference({
      getItem: () => { throw new Error('blocked'); },
    })).toBe(true);
    expect(loadAimAssistPreference({
      getItem: () => '{broken',
    })).toBe(true);
  });
});
