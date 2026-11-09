/**
 * [INPUT]: 按使用频率排列的操作说明、关闭与可选重看引导回调。
 * [OUTPUT]: 可键盘关闭的帮助卡；顶部重看入口复用 Game 的实际教学状态，不删完成记录。
 * [POS]: HUD 帮助层，不重置存档或球局。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef } from 'react';
import { RoyalIcon } from './RoyalIcon';
import type { GameMode } from '../opponent/model';
import { containRoyalDialogTab } from './royal-dialog-focus';

export const CONTROL_HELP = [
  ['瞄准方向', '拨动屏幕下方的轮盘，微调球杆方向。'],
  ['蓄力出杆', '按住球杆沿控件方向拖动，松手出杆；移出控件可取消。'],
  ['切换视角', '全局视角看球位，第一视角沿杆瞄准；选中的按钮会变色。'],
  ['调整杆法', '点开右侧的小白球，选择击球点。'],
  ['声音', '点喇叭按钮，可开关游戏声音。'],
  ['赞美卡册', '点卡册按钮，按获胜顺序翻看收下的卡。'],
  ['切换场景', '点山形按钮，选择城堡或湖面。'],
  ['移动按钮', '长按控件，再拖动调整位置。'],
] as const;
export function ControlHelp({ onClose, onReplayGuide, gameMode, onModeChange }: {
  onClose: () => void;
  onReplayGuide?: () => void;
  gameMode?: GameMode;
  onModeChange?: (mode: GameMode) => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="royal-help-mask" role="dialog" aria-modal="true" aria-labelledby="royal-help-title" onPointerDown={e => e.stopPropagation()} onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
    <section className="royal-help-card"><header><h2 id="royal-help-title">操作说明</h2><button ref={close} aria-label="收起操作说明" onClick={onClose}><RoyalIcon name="close"/></button></header>
      {onReplayGuide && <button className="replay-guide" onClick={onReplayGuide}>再看操作引导</button>}
      {onModeChange && <label className="help-mode">本局模式
        <select value={gameMode} onChange={event => onModeChange(event.target.value as GameMode)}>
          <option value="practice">友好陪练</option>
          <option value="challenge">轻松挑战</option>
        </select>
      </label>}
      <ol>{CONTROL_HELP.map(([title, copy]) => <li key={title}><strong>{title}</strong><p>{copy}</p></li>)}</ol>
    </section>
  </div>;
}
