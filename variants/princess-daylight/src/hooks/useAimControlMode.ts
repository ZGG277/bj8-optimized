import { useCallback, useEffect, useState } from 'react';
import { gameStorage, type SaveStore } from '../minitool/persistent-storage';

export const TOY_DESKTOP_AIM_KEY = 'princess-billiards:toy-desktop-aim:v1';
const DESKTOP_POINTER = '(hover: hover) and (pointer: fine)';

export function loadToyDesktopDial(storage: Pick<SaveStore, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(TOY_DESKTOP_AIM_KEY) === 'dial';
  } catch {
    return false;
  }
}

export function saveToyDesktopDial(dial: boolean, storage: Pick<SaveStore, 'setItem'> | null): void {
  try {
    storage?.setItem(TOY_DESKTOP_AIM_KEY, dial ? 'dial' : 'arrows');
  } catch {
    // The active tab keeps the choice when browser storage is unavailable.
  }
}

function desktopPointerQuery(): MediaQueryList | null {
  if (import.meta.env.VITE_BILIBILI_TOY !== '1' || typeof window === 'undefined') return null;
  return window.matchMedia?.(DESKTOP_POINTER) ?? null;
}

/** The PC choice is independent of the touch/default game controls. */
export function useAimControlMode() {
  const [desktop, setDesktop] = useState(() => desktopPointerQuery()?.matches ?? false);
  const [desktopDial, setDesktopDial] = useState(() =>
    import.meta.env.VITE_BILIBILI_TOY === '1' && loadToyDesktopDial(gameStorage()));
  const [touchDial, setTouchDial] = useState(true);

  useEffect(() => {
    const query = desktopPointerQuery();
    if (!query) return;
    const sync = () => setDesktop(query.matches);
    sync();
    if (query.addEventListener) {
      query.addEventListener('change', sync);
      return () => query.removeEventListener('change', sync);
    }
    query.addListener?.(sync);
    return () => query.removeListener?.(sync);
  }, []);

  const aimDialEnabled = desktop ? desktopDial : touchDial;
  const toggleAimDial = useCallback(() => {
    const next = !aimDialEnabled;
    if (desktop) {
      setDesktopDial(next);
      saveToyDesktopDial(next, gameStorage());
    } else {
      setTouchDial(next);
    }
  }, [aimDialEnabled, desktop]);

  return { aimDialEnabled, toggleAimDial };
}
