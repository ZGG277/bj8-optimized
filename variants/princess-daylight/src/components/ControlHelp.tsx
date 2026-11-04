/**
 * [INPUT]: 按使用频率排列的操作说明、关闭与可选重看引导回调。
 * [OUTPUT]: 可键盘关闭的帮助卡；顶部重看入口复用 Game 的实际教学状态，不删完成记录。
 * [POS]: HUD 帮助层，不重置存档或球局。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef } from 'react';
import { RoyalIcon } from './RoyalIcon';
import { containRoyalDialogTab } from './royal-dialog-focus';

export const CONTROL_HELP = [
  ['瞄准方向', '拨动底部刻度，微调球杆方向。'],
  ['蓄力出杆', '按住球杆向后拖，松手出杆；移出控件可取消。'],
  ['切换视角', '全局视角看球位，第一视角沿杆瞄准；选中的按钮会变色。'],
  ['调整杆法', '点开右侧的小白球，选择击球点。'],
  ['暂停与声音', '点左上角暂停，可开关声音或重新开局。'],
  ['赞美卡册', '点顶部卡册，按获胜顺序翻看收下的卡。'],
  ['切换场景', '点顶部山形按钮，选择城堡或湖面。'],
] as const;
export function ControlHelp({ onClose, onReplayGuide }: { onClose: () => void; onReplayGuide?: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="royal-help-mask" role="dialog" aria-modal="true" aria-labelledby="royal-help-title" onPointerDown={e => e.stopPropagation()} onKeyDown={e => { containRoyalDialogTab(e); if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
    <section className="royal-help-card"><header><h2 id="royal-help-title">操作说明</h2><button ref={close} aria-label="收起操作说明" onClick={onClose}><RoyalIcon name="close"/></button></header>
      {onReplayGuide && <button className="replay-guide" onClick={onReplayGuide}>再看操作引导</button>}
      <ol>{CONTROL_HELP.map(([title, copy]) => <li key={title}><strong>{title}</strong><p>{copy}</p></li>)}</ol>
    </section>
  </div>;
}
