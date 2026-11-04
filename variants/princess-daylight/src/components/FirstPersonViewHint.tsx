/**
 * [INPUT]: 玩家首次进入第一视角的安全展示状态，以及既有存档适配器。
 * [OUTPUT]: 指向全局按钮的一次性短提示，6秒/离开第一视角后退出，完全穿透操作。
 * [POS]: HUD发现提示；不控制相机，不修改首局教学和球局状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { gameStorage } from '../minitool/persistent-storage';

export const VIEW_SWITCH_HINT_KEY = 'princess-billiards:view-switch-hint:v1';
function alreadySeen() {
  try { return gameStorage()?.getItem(VIEW_SWITCH_HINT_KEY) === 'done'; } catch { return false; }
}
export function FirstPersonViewHint({ active }: { active: boolean }) {
  const eligible = useRef(!alreadySeen());
  const deadline = useRef<number | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; arrow: number } | null>(null);
  useEffect(() => {
    if (!active) {
      setPosition(null);
      if (deadline.current !== null) eligible.current = false;
      return;
    }
    if (!eligible.current) return;
    const button = document.querySelector('button[aria-label="全局视角"]');
    if (!button) return;
    if (deadline.current === null) {
      deadline.current = Date.now() + 6000;
      try { gameStorage()?.setItem(VIEW_SWITCH_HINT_KEY, 'done'); } catch { /* 本次仍只展示一次。 */ }
    }
    const place = () => {
      const r = button.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 228));
      setPosition({ left, top: r.bottom + 10, arrow: r.left + r.width / 2 - left });
    };
    place(); window.addEventListener('resize', place);
    const timer = window.setTimeout(() => { eligible.current = false; setPosition(null); }, Math.max(0, deadline.current - Date.now()));
    return () => { clearTimeout(timer); window.removeEventListener('resize', place); };
  }, [active]);
  return position ? <div className="first-view-hint" role="status" style={{ left: position.left, top: position.top, '--arrow-x': `${position.arrow}px` } as CSSProperties}>点这里，切回全局视角</div> : null;
}
