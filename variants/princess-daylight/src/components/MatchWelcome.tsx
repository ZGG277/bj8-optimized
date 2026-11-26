import { useEffect, useRef, useState } from 'react';
import { COMPANION_CARD_ART, CORE_WELCOME_ART } from '../opponent/companion-card-art';
import type { CompanionDialogue } from '../opponent/companion-dialogue';
import { customCompanionFor } from '../opponent/companion-preferences';
import { companionFor } from '../opponent/companions';
import { portraitFor } from '../opponent/player-portraits';
import '../styles/match-welcome.css';

export function MatchWelcome({ greeting, onEnter, onArtSettled, onChoose, pickerOpen = false, waiting = false }: {
  greeting: CompanionDialogue;
  onEnter: () => void;
  onArtSettled?: () => void;
  onChoose: () => void;
  pickerOpen?: boolean;
  waiting?: boolean;
}) {
  const companion = companionFor(greeting.companionId);
  const welcomeArt = CORE_WELCOME_ART[companion.id];
  const custom = welcomeArt ? undefined :
    customCompanionFor(companion.id) ? companion.avatar : portraitFor(companion.id).avatar;
  const art = welcomeArt || custom || COMPANION_CARD_ART[companion.id]?.src || companion.avatar;
  const [settledArt, setSettledArt] = useState<{ src: string; visible: boolean }>();
  const artSettled = settledArt?.src === art;
  const enter = useRef(onEnter);
  enter.current = onEnter;
  useEffect(() => {
    if (artSettled) onArtSettled?.();
  }, [artSettled, art, onArtSettled]);
  useEffect(() => {
    if (!artSettled || pickerOpen || waiting) return;
    const timer = window.setTimeout(() => enter.current(), 2800);
    return () => window.clearTimeout(timer);
  }, [artSettled, art, pickerOpen, waiting]);
  return <section data-featured={welcomeArt ? true : undefined} data-custom={custom ? true : undefined}
    data-art-ready={artSettled && settledArt?.visible ? true : undefined}
    className="royal-opening match-welcome" aria-hidden={pickerOpen || undefined} onClick={pickerOpen ? undefined : onEnter}>
    {!artSettled && <span className="boot-spinner welcome-spinner" aria-hidden="true"/>}
    <span className="welcome-art"><img className="welcome-portrait" src={art}
      onLoad={() => setSettledArt({ src: art, visible: true })}
      onError={() => setSettledArt({ src: art, visible: false })} alt="" draggable={false}/></span>
    <span className="welcome-message">
      <strong>{companion.name}</strong>
      <span className="welcome-quote">{greeting.text}</span>
      <button type="button" className="welcome-change" aria-haspopup="dialog" disabled={pickerOpen}
        onClick={event => { event.stopPropagation(); onChoose(); }}>
        换一位球友 <span aria-hidden="true">›</span>
      </button>
      {waiting && <span className="welcome-waiting" role="status">球桌准备中…</span>}
    </span>
  </section>;
}
