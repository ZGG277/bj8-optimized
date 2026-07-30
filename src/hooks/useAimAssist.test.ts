/*
[INPUT]: useAimAssist 纯存储函数与模拟 Storage
[OUTPUT]: 首次默认关闭、合法偏好恢复与受损存储回退断言
[POS]: 瞄准辅助偏好回归测试
[PROTOCOL]: 存储键或默认值变化时同步更新本文件
*/
import { describe, expect, it } from 'vitest';
import {
  AIM_ASSIST_STORAGE_KEY,
  loadAimAssistPreference,
  saveAimAssistPreference,
} from './useAimAssist';

describe('aim assist preference', () => {
  it('defaults to off and restores an explicit choice', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    expect(loadAimAssistPreference(storage)).toBe(false);
    saveAimAssistPreference(true, storage);
    expect(data.get(AIM_ASSIST_STORAGE_KEY)).toBe('true');
    expect(loadAimAssistPreference(storage)).toBe(true);
  });

  it('falls back to off when storage is unavailable', () => {
    expect(loadAimAssistPreference({
      getItem: () => { throw new Error('blocked'); },
    })).toBe(false);
  });
});
