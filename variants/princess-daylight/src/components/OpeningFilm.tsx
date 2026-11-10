/*
[INPUT]: 竖屏 8 秒 WebP 与同步配乐，或 B 站横屏 8 秒 MP4（音轨在片内）
[OUTPUT]: 每次开场默认开启音乐；自然结束交还连续推镜，跳过/错误/后台立即交还球桌
[POS]: 片头呈现层，不依赖音频成功才交还球桌
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useRef, useState } from 'react';
import { RoyalIcon } from './RoyalIcon';
import poster from '../assets/opening/valley-poster.jpg?url';
import openingAsset from '../assets/opening/provenance.json';
import soundtrack from '../assets/opening/soundtrack.json';
import { filmPresentation } from '../opening-camera';

export const FILM_DURATION_MS = Math.round(openingAsset.durationSeconds * 1000);
export const OPENING_MAX_WAIT_MS = FILM_DURATION_MS + 200;
export function OpeningFilm({ src, onFinish, media = 'image', still }: { src: string; onFinish: (skipped: boolean) => void; media?: 'image' | 'video'; still?: string }) {
  const [muted, setMuted] = useState(false);
  const finish = useRef(onFinish); finish.current = onFinish;
  const closed = useRef(false), startedAt = useRef<number | null>(null);
  const context = useRef<AudioContext | null>(null), decoded = useRef<AudioBuffer | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const volume = useRef<GainNode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timers = useRef<number[]>([]), mutedRef = useRef(muted); mutedRef.current = muted;
  const musicIntent = useRef<boolean | null>(null);
  const loadingDeadline = useRef<number | null>(null);
  const [arriving, setArriving] = useState(false), [audioState, setAudioState] = useState('preparing');
  const frame = filmPresentation(media);
  const stop = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    try { source.current?.stop(); } catch { /* already ended */ }
    source.current?.disconnect(); source.current = null;
    volume.current?.disconnect(); volume.current = null;
    const ctx = context.current; context.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    decoded.current = null;
    videoRef.current?.pause();
  };
  const done = (skipped = false) => { if (closed.current) return; closed.current = true; stop(); finish.current(skipped); };
  const startSound = () => {
    const ctx = context.current, buffer = decoded.current;
    if (closed.current || mutedRef.current || source.current || !buffer || !ctx || ctx.state !== 'running' || startedAt.current === null) return;
    const offset = Math.max(0, (performance.now() - startedAt.current) / 1000);
    if (offset >= buffer.duration) return;
    const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(volume.current ?? ctx.destination);
    source.current = node; node.start(0, offset); setAudioState('playing');
  };
  const armClock = () => {
    if (closed.current || startedAt.current !== null) return;
    // 画面真正开播后按真实开播时刻计满 8 秒，慢下载不截短配乐和最后画面。
    if (loadingDeadline.current !== null) clearTimeout(loadingDeadline.current);
    loadingDeadline.current = null;
    startedAt.current = performance.now();
    timers.current.push(window.setTimeout(() => setArriving(true), Math.max(0, FILM_DURATION_MS - 350)));
    timers.current.push(window.setTimeout(() => done(false), FILM_DURATION_MS));
  };
  useEffect(() => {
    closed.current = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!src || reduce) timers.current.push(window.setTimeout(() => done(true), 0));
    // No choice screen and no dependency on successful audio decode/resume.
    loadingDeadline.current = window.setTimeout(() => done(true), OPENING_MAX_WAIT_MS);
    timers.current.push(loadingDeadline.current);
    const video = media === 'video' ? videoRef.current : null;
    if (media === 'image' && typeof AudioContext !== 'undefined') {
      try {
        const ctx = new AudioContext(); context.current = ctx;
        const gain = ctx.createGain(); gain.gain.value = mutedRef.current ? 0 : 1; gain.connect(ctx.destination); volume.current = gain;
        const bytes = Uint8Array.from(atob(soundtrack.base64), char => char.charCodeAt(0));
        void ctx.decodeAudioData(bytes.buffer).then(buffer => {
          if (closed.current || context.current !== ctx) return;
          decoded.current = buffer; setAudioState(mutedRef.current ? 'muted' : ctx.state === 'running' ? 'ready' : 'waiting-gesture'); startSound();
        }).catch(() => { if (!closed.current && context.current === ctx) setAudioState('unavailable'); });
        // Permitted hosts can play sound immediately; a blocked resume never delays the image.
        if (!mutedRef.current) void ctx.resume().then(startSound).catch(() => {});
      } catch { setAudioState('unavailable'); }
    } else if (media !== 'video') setAudioState('unavailable');
    if (!reduce && video) {
      const startPicture = () => {
        if (closed.current) return;
        video.muted = mutedRef.current;
        const played = video.play();
        void played?.then(() => {
          if (!closed.current) setAudioState(video.muted ? 'muted' : 'playing');
        }).catch(() => {
          if (closed.current) return;
          video.muted = true;
          void video.play().then(() => {
            if (!closed.current) setAudioState(mutedRef.current ? 'muted' : 'waiting-gesture');
          }).catch(() => { if (!closed.current) setAudioState('unavailable'); });
        });
      };
      if (video.readyState >= 2) startPicture();
      else video.addEventListener('loadeddata', startPicture, { once: true });
    }
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-opening-control]')) return;
      if (video && !closed.current && !mutedRef.current) {
        video.muted = false;
        void video.play().then(() => { if (!closed.current) setAudioState('playing'); }).catch(() => {});
        return;
      }
      const ctx = context.current;
      if (ctx && !closed.current && !mutedRef.current) void ctx.resume().then(startSound).catch(() => {});
    };
    const leave = () => { if (document.hidden) done(true); };
    document.addEventListener('pointerdown', unlock, true); document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', leave);
    return () => { closed.current = true; stop(); document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true); document.removeEventListener('visibilitychange', leave); };
  }, [src, media]);
  useEffect(() => {
    const ctx = context.current;
    const video = videoRef.current;
    if (closed.current) return;
    if (video && media === 'video') video.muted = muted;
    if (!ctx) return;
    volume.current?.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, .02);
    if (muted) setAudioState('muted');
    else void ctx.resume().then(() => { startSound(); if (!closed.current && source.current) setAudioState('playing'); }).catch(() => {});
  }, [muted, media]);
  const toggleMusic = () => {
    const wantsSound = musicIntent.current ?? (mutedRef.current || audioState === 'waiting-gesture'); musicIntent.current = null;
    const video = media === 'video' ? videoRef.current : null;
    if (video && !closed.current) {
      if (!wantsSound) {
        mutedRef.current = true; video.muted = true; setAudioState('muted'); setMuted(true);
        return;
      }
      mutedRef.current = false; setMuted(false); video.muted = false;
      void video.play().then(() => { if (!closed.current) setAudioState('playing'); }).catch(() => {});
      return;
    }
    const ctx = context.current;
    if (!ctx || closed.current) return;
    if (!wantsSound) {
      mutedRef.current = true; volume.current?.gain.setTargetAtTime(0, ctx.currentTime, .02); setAudioState('muted'); setMuted(true);
      return;
    }
    if (mutedRef.current) { mutedRef.current = false; setMuted(false); }
    volume.current?.gain.setTargetAtTime(1, ctx.currentTime, .02);
    void ctx.resume().then(() => { startSound(); if (!closed.current && source.current) setAudioState('playing'); }).catch(() => {});
  };
  const loaded = () => { armClock(); startSound(); };
  return <div className={`royal-opening opening-film${arriving ? ' arriving' : ''}`} data-opening-autoplay="true" data-opening-audio={audioState} data-opening-duration={FILM_DURATION_MS} data-opening-media={media} data-film-aspect={frame.imageAspect} data-film-fill-x={frame.fillWidth} data-film-fill-y={frame.fillHeight} style={{ backgroundImage: `url(${still || poster})` }}>
    {media === 'video'
      ? <video ref={videoRef} src={src} poster={still || poster} playsInline preload="auto" disablePictureInPicture onPlaying={armClock} onError={() => done(true)} />
      : <img src={src} onLoad={loaded} onError={() => done(true)} alt="" draggable={false} aria-hidden="true"/>}
    {audioState !== 'unavailable' && <button className="opening-music" data-opening-control="music" aria-pressed={!muted} onPointerDown={() => { musicIntent.current = muted || audioState === 'waiting-gesture'; }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') musicIntent.current = muted || audioState === 'waiting-gesture'; }} onClick={toggleMusic}><RoyalIcon name={muted ? 'muted' : 'sound'}/><span>{muted ? '开启音乐' : audioState === 'waiting-gesture' ? '轻触有声' : '关闭音乐'}</span></button>}
    <button className="opening-skip" aria-label="跳过开场" onClick={() => done(true)}><RoyalIcon name="skip"/><span>跳过</span></button>
  </div>;
}
