/** A short cinematic image/particle composition. No storage, WebGL or automatic publishing. */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createVictoryMotion, VICTORY_DURATION } from '../minitool/victory-motion';

export function VictoryCelebration({ onComplete }: { onComplete: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  const finished = useRef(false);
  const finish = () => { if (!finished.current) { finished.current = true; completeRef.current(); } };
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { finish(); return; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const paintParticles = createVictoryMotion();
    let frame = 0, timer = 0, elapsed = 0, last = 0, painted = -100, width = 1, height = 1;
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (width * height)));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const paint = (time: number) => {
      const p = time / VICTORY_DURATION;
      const enter = reduced ? 1 : Math.min(1, time / 500);
      if (sceneRef.current) sceneRef.current.style.opacity = String(enter);
      if (sceneRef.current) sceneRef.current.style.transform = `scale(${reduced ? 1 : 1.02 + .1 * (1 - Math.pow(1 - p, 2))})`;
      if (titleRef.current) {
        const reveal = reduced ? 1 : Math.max(0, Math.min(1, (time - 480) / 850));
        titleRef.current.style.opacity = String(reveal);
        titleRef.current.style.transform = `translateY(${(1 - reveal) * 15}px)`;
      }
      if (!reduced) paintParticles(ctx, width, height, time);
    };
    const tick = (now: number) => {
      if (finished.current || document.hidden) return;
      if (last) elapsed += Math.min(now - last, 100); last = now;
      if (elapsed >= VICTORY_DURATION) { finish(); return; }
      if (elapsed - painted >= 1000 / 30) { paint(elapsed); painted = elapsed; }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame); clearTimeout(timer); last = 0;
      if (document.hidden || finished.current) return;
      if (reduced) { paint(1800); timer = window.setTimeout(finish, 900); }
      else frame = requestAnimationFrame(tick);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); finish(); } };
    resize(); resume();
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', resume); window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', resume); window.removeEventListener('keydown', key); };
  }, []);
  return createPortal(<div className="victory-celebration" role="dialog" aria-modal="true" aria-label="获胜庆祝">
    <div ref={sceneRef} className="victory-celebration-scene" aria-hidden="true">
      <span className="victory-obsidian">8</span>
    </div>
    <div className="victory-celebration-shade" aria-hidden="true" />
    <canvas ref={canvasRef} aria-hidden="true" />
    <div ref={titleRef} className="victory-celebration-copy"><strong>赢得漂亮</strong></div>
    <button type="button" onClick={finish} autoFocus>查看胜局卡 <span aria-hidden="true">→</span></button>
  </div>, document.body);
}
