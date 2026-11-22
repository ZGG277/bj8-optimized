import { useEffect, useRef, useState } from 'react';
import { COMPANION_CARD_ART } from '../opponent/companion-card-art';
import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { companionFor } from '../opponent/companions';
import { portraitFor } from '../opponent/player-portraits';
import '../styles/match-welcome.css';

export function MatchWelcome({ greeting, onEnter }: { greeting: CompanionDialogue; onEnter: () => void }) {
  const companion = companionFor(greeting.companionId);
  const custom = portraitFor(companion.id).avatar;
  const art = custom || COMPANION_CARD_ART[companion.id]?.src || companion.avatar;
  const [loadedArt, setLoadedArt] = useState<string>();
  const entered = useRef(false);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  function finish() {
    if (entered.current) return;
    entered.current = true;
    enter.current();
  }
  useEffect(() => {
    if (loadedArt !== art) return;
    const timer = window.setTimeout(finish, 2800);
    return () => window.clearTimeout(timer);
  }, [loadedArt, art]);
  return <button type="button" autoFocus data-custom={custom ? true : undefined} className="royal-opening match-welcome" onClick={finish}>
    <span className="welcome-art"><img className="welcome-portrait" src={art} onLoad={() => setLoadedArt(art)} onError={() => setLoadedArt(art)} alt="" draggable={false}/></span>
    <span className="welcome-message">
      <strong>{companion.name}</strong>
      <span className="welcome-quote">{greeting.text}</span>
      <span className="welcome-enter">轻触进入球桌 <span aria-hidden="true">›</span></span>
    </span>
  </button>;
}
