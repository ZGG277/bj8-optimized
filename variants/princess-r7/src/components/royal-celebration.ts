export const ROYAL_CELEBRATION_MS = 3200;
export const ROYAL_CELEBRATION_PARTICLES = 28;
/** All exits cancel work. Cancellation after unmount never calls React. */
export function startRoyalCelebration(onEnd: () => void, preference: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>) {
  let active = !preference.matches;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    preference.removeEventListener('change', finish);
  };
  const finish = () => { if (!active) return; cancel(); onEnd(); };
  if (active) { timer = setTimeout(finish, ROYAL_CELEBRATION_MS); preference.addEventListener('change', finish); }
  return { active, finish, cancel };
}
