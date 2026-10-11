import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { containRoyalDialogTab } from './royal-dialog-focus';
import princePortrait from '../assets/prince-white-horse.webp';

import { startRoyalCelebration, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';
export { ROYAL_CELEBRATION_MS, ROYAL_CELEBRATION_PARTICLES } from './royal-celebration';

/** One finite celebration, unmounted on restart. It deliberately adds no sound. */
export function RoyalFinish({ winner, onRestart }: { winner: 'player' | 'opponent' | null; onRestart: () => void }) {
  const [celebrating, setCelebrating] = useState(false);
  const cancelCelebration = useRef<(() => void) | null>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const endCelebration = () => {
    setCelebrating(false);
    if (document.activeElement?.classList.contains('royal-skip')) restartButton.current?.focus();
  };
  const stopCelebration = () => { cancelCelebration.current?.(); endCelebration(); restartButton.current?.focus(); };
  useEffect(() => {
    setCelebrating(false);
    if (winner !== 'player') return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const run = startRoyalCelebration(endCelebration, preference);
    setCelebrating(run.active); cancelCelebration.current = run.cancel;
    return () => { run.cancel(); cancelCelebration.current = null; };
  }, [winner]);
  const won = winner === 'player';
  return <div className={`finish-mask royal-finish ${won ? 'won' : 'prince-finish'}`}
    role="dialog" aria-modal="true" aria-labelledby="royal-result-title"
    onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}
    onPointerUp={e => e.stopPropagation()} onPointerCancel={e => e.stopPropagation()}
    onKeyDown={e => { containRoyalDialogTab(e); if(e.key==='Escape') stopCelebration(); e.stopPropagation(); }} onContextMenu={e => e.stopPropagation()}>
    {celebrating && <div className="royal-petals" aria-hidden="true">
      {Array.from({ length: ROYAL_CELEBRATION_PARTICLES }, (_, i) => <i key={i}
        className={i % 3 === 0 ? 'royal-ribbon' : 'royal-flower'}
        style={{ '--fall-x': `${(i * 37 + 7) % 100}%`, '--fall-delay': `${(i % 7) * .08}s`, '--fall-spin': `${i % 2 ? 210 : -160}deg`, '--petal-color': ['#eab6c3','#fff3db','#cfabc9','#d4b469'][i % 4] } as CSSProperties}>
        {i % 3 !== 0 && <svg viewBox="0 0 40 40"><g fill="currentColor"><ellipse cx="20" cy="12" rx="6" ry="10"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(72 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(144 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(216 20 20)"/><ellipse cx="20" cy="12" rx="6" ry="10" transform="rotate(288 20 20)"/></g><circle cx="20" cy="20" r="4" fill="#b98c39"/></svg>}
      </i>)}
    </div>}
    <div className="finish-content royal-result-card">
      {won ? <div className="royal-victory-emblem" aria-hidden="true">♛</div> : winner === 'opponent' ? <img className="royal-prince-portrait" src={princePortrait} alt="谢不赢与白马" width="640" height="600" /> : null}
      <h1 id="royal-result-title">{won ? '公主赢了' : winner === 'opponent' ? '再接再厉' : '本局结束'}</h1>
      <div className="finish-actions"><button type="button" ref={restartButton} autoFocus data-control-tip="new-match" onClick={() => { stopCelebration(); onRestart(); }}>再来一局</button></div>
      {celebrating && <button className="royal-skip" type="button" onClick={stopCelebration}>跳过庆祝</button>}
    </div>
  </div>;
}
