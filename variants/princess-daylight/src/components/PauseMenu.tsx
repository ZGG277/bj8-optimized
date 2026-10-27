import { useEffect, useRef, useState } from 'react';
import { containRoyalDialogTab } from './royal-dialog-focus';
import type { GameMode } from '../opponent/model';
import { FollowAuthor } from './FollowAuthor';
import { RoyalIcon } from './RoyalIcon';

export function PauseMenu({ muted, onMute, onResume, onRestart, gameMode, onModeChange, onCollection }: {
  onCollection?: () => void;
  gameMode?: GameMode; onModeChange?: (mode: GameMode) => void;
  muted: boolean; onMute: () => void; onResume: () => void; onRestart: () => void;
}) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const resume = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    resume.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="royal-pause-mask" onKeyDown={event => {
    containRoyalDialogTab(event);
    if (event.key === 'Escape') { if (confirmRestart) setConfirmRestart(false); else onResume(); }
    event.stopPropagation();
  }}>
    <section className="royal-pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <h2 id="pause-title">已暂停</h2>
      <button ref={resume} className="pause-resume" onClick={onResume} aria-label="继续这一局"><RoyalIcon name="play"/></button>
      <div className="pause-tools">
        <button className="pause-sound" aria-pressed={muted} aria-label={muted ? '开启音效' : '关闭音效'} onClick={onMute}><RoyalIcon name={muted ? 'muted' : 'sound'}/></button>
        <button className="pause-restart" aria-label="重新开局" onClick={() => setConfirmRestart(true)}><RoyalIcon name="restart"/></button>
        {onCollection && <button aria-label="查看赞美卡册" onClick={onCollection}><RoyalIcon name="cards"/></button>}
      </div>
      {onModeChange && <label className="pause-mode"><select aria-label="本局模式" value={gameMode} onChange={event => onModeChange(event.target.value as GameMode)}><option value="practice">友好陪练</option><option value="challenge">轻松挑战</option></select></label>}
      <FollowAuthor />
      {confirmRestart && <div className="pause-confirm"><p>重新开局？</p><button onClick={() => setConfirmRestart(false)}>取消</button><button onClick={onRestart}>重开</button></div>}
    </section>
  </div>;
}
