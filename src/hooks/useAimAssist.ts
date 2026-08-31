/*
[INPUT]: 浏览器 localStorage 与用户开关动作
[OUTPUT]: 对外提供默认关闭、容错持久化的瞄准预测线偏好
[POS]: HUD 偏好 Hook；不控制幽灵球、拨轮或走位规划
[PROTOCOL]: 存储键或默认值变化时同步更新本文件测试与 hooks/CLAUDE.md
*/
import { useCallback, useState } from 'react';

export const AIM_ASSIST_STORAGE_KEY = 'guagua-billiards:aim-assist:v1';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

export function loadAimAssistPreference(storage?: StorageReader | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(AIM_ASSIST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveAimAssistPreference(
  enabled: boolean,
  storage?: StorageWriter | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(AIM_ASSIST_STORAGE_KEY, String(enabled));
  } catch {
    // 隐私模式或受限 iframe 中仍保留本次会话状态。
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useAimAssist() {
  const [enabled, setEnabledState] = useState(() =>
    loadAimAssistPreference(browserStorage()));

  const toggle = useCallback(() => {
    setEnabledState(current => {
      const next = !current;
      saveAimAssistPreference(next, browserStorage());
      return next;
    });
  }, []);

  return { enabled, toggle };
}
