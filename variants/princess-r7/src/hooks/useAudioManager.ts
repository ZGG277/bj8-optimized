/*
[INPUT]: 依赖 audio 合成音效与 physics PhysicsEvent 类型
[OUTPUT]: 对外提供 audioRef / playStrike / playPhysicsEvents / playVictory / resetEvents
[POS]: 音效协调层，只消费物理事件与出杆动作；不关心对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useCallback } from 'react';
import { BilliardsAudio } from '../audio';
import type { PhysicsEvent } from '../physics';

export function useAudioManager() {
  const audioRef = useRef<BilliardsAudio | null>(null);
  const playedEventsRef = useRef(0);

  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new BilliardsAudio();
  }

  /** 播放物理事件音效（按事件顺序，不重复不漏） */
  const playPhysicsEvents = useCallback((events: PhysicsEvent[]) => {
    for (let i = playedEventsRef.current; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'ball-collision') audioRef.current?.ballCollision(Math.min(1, ev.speed / 5));
      else if (ev.type === 'cushion') audioRef.current?.cushion(Math.min(1, ev.speed / 5));
      else if (ev.type === 'pocket') audioRef.current?.pocket();
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

  return { audioRef, playPhysicsEvents, playStrike, playVictory, resetEvents };
}
