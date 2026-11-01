/*
[INPUT]: 依赖 audio 合成音效与 physics PhysicsEvent 类型
[OUTPUT]: 对外提供 selectPhysicsAudioEvents 与 audioRef / playStrike / playPhysicsEvents / playVictory / resetEvents
[POS]: 音效协调层，只消费物理事件与出杆动作；不关心对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useCallback, useEffect, useState } from 'react';
import { BilliardsAudio } from '../audio';
import { gameStorage } from '../minitool/persistent-storage';
import type { PhysicsEvent } from '../physics';

export function selectPhysicsAudioEvents(events: PhysicsEvent[]): PhysicsEvent[] {
  let collision: Extract<PhysicsEvent, { type: 'ball-collision' }> | null = null;
  let cushion: Extract<PhysicsEvent, { type: 'cushion' }> | null = null;
  const pockets: PhysicsEvent[] = [];
  for (const event of events) {
    if (event.type === 'ball-collision' && (!collision || event.speed > collision.speed)) collision = event;
    else if (event.type === 'cushion' && (!cushion || event.speed > cushion.speed)) cushion = event;
    else if (event.type === 'pocket') pockets.push(event);
  }
  return [...(collision ? [collision] : []), ...(cushion ? [cushion] : []), ...pockets];
}

export function useAudioManager(paused = false, ambience = false) {
  const [muted, setMuted] = useState(() => { try { return gameStorage()?.getItem('princess-billiards:muted:v1') === 'true'; } catch { return false; } });
  const audioRef = useRef<BilliardsAudio | null>(null);
  const playedEventsRef = useRef(0);

  useEffect(() => {
    const audio = new BilliardsAudio(); audioRef.current = audio;
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      audio.dispose(); audioRef.current = null;
    };
  }, []);
  useEffect(() => { audioRef.current?.setMuted(muted); }, [muted]);
  useEffect(() => { audioRef.current?.setAmbience(ambience); }, [ambience]);
  useEffect(() => {
    const update = () => audioRef.current?.setSuspended(paused || document.hidden);
    update(); document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [paused]);
  const toggleMuted = useCallback(() => {
    const next = !muted;
    audioRef.current?.setMuted(next);
    setMuted(next);
    try { gameStorage()?.setItem('princess-billiards:muted:v1', String(next)); } catch { /* This page still respects the choice. */ }
  }, [muted]);

  /** 每个展示批次保留最强球碰/碰库，落袋逐个播放；事件下标保证不重复消费。 */
  const playPhysicsEvents = useCallback((events: PhysicsEvent[]) => {
    const pending = events.slice(playedEventsRef.current);
    for (const ev of selectPhysicsAudioEvents(pending)) {
      if (ev.type === 'ball-collision') audioRef.current?.ballCollision(Math.min(1, ev.speed / 5));
      else if (ev.type === 'cushion') audioRef.current?.cushion(Math.min(1, ev.speed / 5));
      else if (ev.type === 'pocket') audioRef.current?.pocket(Math.min(1, ev.speed / 4));
    }
    playedEventsRef.current = events.length;
  }, []);

  /** 播放击球音效 */
  const playStrike = useCallback((power: number) => {
    audioRef.current?.strike(power);
  }, []);

  const playVictory = useCallback(() => {
    audioRef.current?.victory();
  }, []);

  /** 新一杆开始时重置事件计数器 */
  const resetEvents = useCallback(() => {
    playedEventsRef.current = 0;
  }, []);

  return { audioRef, playPhysicsEvents, playStrike, playVictory, resetEvents, muted, toggleMuted };
}
