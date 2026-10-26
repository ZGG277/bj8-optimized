/**
 * [INPUT]: Offline film/poster/soundtrack, mute preference and completion callback.
 * [OUTPUT]: Gesture-started, pitch-preserved original soundtrack synchronized to the 1.15x WebP.
 * [POS]: Opening presentation; every exit releases audio and timers.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useRef, useState } from 'react';
import { RoyalIcon } from './RoyalIcon';
import poster from '../assets/opening/valley-poster.jpg?url';
import openingAsset from '../assets/opening/provenance.json';
import soundtrack from '../assets/opening/soundtrack.json';

const FILM_DURATION_MS = Math.round(openingAsset.durationSeconds * 1000);

export function OpeningFilm({ src, muted = false, onFinish }: { src: string; muted?: boolean; onFinish: () => void }) {
  const closed = useRef(false);
  const preparing = useRef(false);
  const started = useRef(false);
  const timers = useRef<number[]>([]);
  const context = useRef<AudioContext | null>(null);
  const buffer = useRef<AudioBuffer | null>(null);
  const sound = useRef<AudioBufferSourceNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [audioState, setAudioState] = useState('ready');
  const finish = useRef(onFinish);
  finish.current = onFinish;
  const stop = () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current = [];
    try { sound.current?.stop(); } catch { /* Already ended. */ }
    sound.current?.disconnect();
    sound.current = null;
    const ctx = context.current;
    context.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    buffer.current = null;
  };
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    stop();
    finish.current();
  };
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => {
    closed.current = false;
    if (!src || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) later(done, 0);
    const leave = () => { if (document.hidden) done(); };
    document.addEventListener('visibilitychange', leave);
    return () => {
      closed.current = true;
      stop();
      document.removeEventListener('visibilitychange', leave);
    };
  }, [src]);
  const begin = () => {
    if (preparing.current || closed.current) return;
    preparing.current = true;
    setLoading(true);
    // Resume inside the tap, before any decode; no autoplay assumptions.
    let revealed = false;
    const reveal = () => { if (!revealed && !closed.current) { revealed = true; setPlaying(true); setLoading(false); } };
    later(done, FILM_DURATION_MS + 4000);
    later(reveal, 2000); // A failed audio decoder must not trap the opening.
    if (muted || typeof AudioContext === 'undefined') { setAudioState(muted ? 'muted' : 'unavailable'); reveal(); return; }
    try {
      const ctx = new AudioContext();
      context.current = ctx;
      const resumed = ctx.resume();
      const bytes = Uint8Array.from(atob(soundtrack.base64), char => char.charCodeAt(0));
      void Promise.all([resumed, ctx.decodeAudioData(bytes.buffer)]).then(([, decoded]) => {
        if (closed.current || revealed) return;
        buffer.current = decoded;
        reveal();
      }).catch(() => { if (!closed.current) { setAudioState('unavailable'); reveal(); } });
    } catch { setAudioState('unavailable'); reveal(); }
  };
  const loaded = () => {
    if (!playing || started.current || closed.current) return;
    started.current = true;
    const ctx = context.current;
    if (ctx?.state === 'running' && buffer.current) {
      const node = ctx.createBufferSource();
      node.buffer = buffer.current;
      node.connect(ctx.destination);
      sound.current = node;
      node.start();
      setAudioState('playing');
    }
    later(() => { if (!closed.current) setArriving(true); }, FILM_DURATION_MS - 350);
    later(done, FILM_DURATION_MS);
  };
  return <div className={`royal-opening opening-film${arriving ? ' arriving' : ''}`} data-opening-audio={audioState} style={{ backgroundImage: `url(${poster})` }}>
    <img src={playing ? src : poster} onLoad={loaded} onError={done} alt="" draggable={false} aria-hidden="true"/>
    {!playing && <button className="opening-start" data-opening-start="true" disabled={loading} onClick={begin} aria-label={muted ? '播放开场' : '播放开场和原声'}><RoyalIcon name="play"/><span>{loading ? '正在进入…' : '进入城堡'}</span></button>}
    <button className="opening-skip" aria-label="跳过开场" onClick={done}><RoyalIcon name="skip"/></button>
  </div>;
}
