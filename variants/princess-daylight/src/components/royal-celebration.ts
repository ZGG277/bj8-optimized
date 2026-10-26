import { observeMediaQuery, type MotionPreference } from '../media-query';
export const ROYAL_CELEBRATION_MS = 3200;
export const ROYAL_CELEBRATION_PARTICLES = 28;
/** All exits cancel work. Cancellation after unmount never calls React. */
export function startRoyalCelebration(onEnd: () => void, preference: MotionPreference) {
  let active = !preference.matches;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unlisten = () => {};
  const cancel = () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    unlisten();
  };
  const finish = () => { if (!active) return; cancel(); onEnd(); };
  if (active) { timer = setTimeout(finish, ROYAL_CELEBRATION_MS); unlisten = observeMediaQuery(preference, finish); }
  return { active, finish, cancel };
}
