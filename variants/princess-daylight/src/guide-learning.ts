import type { FirstMatchGuideEvent, FirstMatchGuideStep } from './first-match-guide';
import type { SaveStore } from './minitool/persistent-storage';

export const GUIDE_LEARNING_KEY = 'princess-billiards:guide-learning:v1';
export const GUIDE_ACTIONS = ['power', 'ghost', 'aim', 'place', 'view', 'spin', 'layout'] as const;
export type GuideAction = typeof GUIDE_ACTIONS[number];
export const actionForStep = (step: FirstMatchGuideStep): GuideAction | null => {
  if (step.includes('power')) return 'power';
  if (step === 'free-place' || step === 'break-place') return 'place';
  if (step === 'ghost-place') return 'ghost';
  if (step === 'aim-direction' || step === 'break-fine' || step === 'break-coarse') return 'aim';
  if (step.startsWith('player-')) return step.slice(7) as GuideAction;
  return null;
};
export const actionForEvent = (event: FirstMatchGuideEvent): GuideAction | null => ({
  'shot-committed': 'power', 'ghost-placed': 'ghost', 'cue-placed': 'place',
  'fine-aim-adjusted': 'aim', 'coarse-aim-adjusted': 'aim',
  'view-adjusted': 'view', 'spin-adjusted': 'spin', 'layout-adjusted': 'layout',
  'player-ready': null,
} as const)[event];

/** Count completed, valid gestures; a stream of pointer moves counts only once. */
export function createGuideLearning(storage: SaveStore | null) {
  const counts: Record<GuideAction, number> = { power:0, ghost:0, aim:0, place:0, view:0, spin:0, layout:0 };
  try {
    const saved: unknown = JSON.parse(storage?.getItem(GUIDE_LEARNING_KEY) ?? '{}');
    if (saved && typeof saved === 'object') for (const key of GUIDE_ACTIONS) {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) counts[key] = Math.max(0, Math.min(2, Math.floor(value)));
    }
    // Existing users who already dismissed/completed the old lesson keep that preference.
    if (!storage?.getItem(GUIDE_LEARNING_KEY) && storage?.getItem('princess-billiards:first-match-guide:v1') === 'done') {
      for (const key of ['power', 'ghost', 'aim'] as const) counts[key] = 2;
    }
  } catch { /* A blocked save keeps this session usable. */ }
  const lastGesture = new Map<GuideAction, number>();
  return {
    learned: (action: GuideAction) => counts[action] >= 2,
    count: (action: GuideAction) => counts[action],
    record(action: GuideAction, gesture: number) {
      if (counts[action] >= 2 || lastGesture.get(action) === gesture) return false;
      lastGesture.set(action, gesture);
      counts[action] += 1;
      try { storage?.setItem(GUIDE_LEARNING_KEY, JSON.stringify(counts)); } catch { /* Keep memory progress. */ }
      return true;
    },
  };
}
