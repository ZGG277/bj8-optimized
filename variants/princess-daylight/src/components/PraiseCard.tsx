import { useEffect, useState } from 'react';
import { renderMatchCard } from '../minitool/match-card';

/** One canonical card face for settlement, chronological collection and sharing. */
export function PraiseCard({ art, name, text, onImage }: { art: string; name: string; text: string; onImage?: (image: string) => void }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let active = true;
    setImage('');
    void renderMatchCard(art, name, text).then(value => { if (active) { setImage(value); onImage?.(value); } }).catch(() => {});
    return () => { active = false; };
  }, [art, name, text, onImage]);
  return image ? <img className="praise-card-face" src={image} alt={`${name} · ${text}`} width="720" height="960" draggable={false} data-card-text={text}/>
    : <div className="praise-card-face praise-card-placeholder" data-card-text={text}><img src={art} alt={name}/><p>{name}</p><strong>{text}</strong></div>;
}
