/*
[INPUT]: 首次引导本地存储、当前引导步骤与真实交互事件
[OUTPUT]: 对外提供首局引导步骤状态机，以及容错的完成状态读写
[POS]: 纯产品状态层；不依赖 React、DOM、物理或对局规则实现
[PROTOCOL]: 步骤、存储协议或转移变化时更新本注释、对应测试与 CLAUDE.md
*/

export const FIRST_MATCH_GUIDE_STORAGE_KEY =
  'guagua-billiards:first-match-guide:v1';

export const FIRST_MATCH_GUIDE_STEPS = [
  'break-place',
  'break-aim',
  'break-power',
  'player-aim',
  'view',
  'spin',
  'power',
  'layout',
] as const;

export type FirstMatchGuideStep = typeof FIRST_MATCH_GUIDE_STEPS[number];

export type FirstMatchGuideEvent =
  | 'cue-placed'
  | 'aim-used'
  | 'shot-committed'
  | 'view-used'
  | 'spin-used';

export function shouldRunFirstMatchGuide(
  storage: Storage | null,
  recordedPlayerShots = 0,
): boolean {
  if (Number.isFinite(recordedPlayerShots) && recordedPlayerShots > 0) {
    return false;
  }
  if (!storage) return true;
  try {
    return storage.getItem(FIRST_MATCH_GUIDE_STORAGE_KEY) !== 'done';
  } catch {
    return true;
  }
}

export function saveFirstMatchGuideCompleted(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(FIRST_MATCH_GUIDE_STORAGE_KEY, 'done');
  } catch {
    // 隐私模式或受限 WebView 禁止持久化时，本次会话仍可正常完成。
  }
}

export function nextFirstMatchGuideStep(
  step: FirstMatchGuideStep,
): FirstMatchGuideStep | null {
  const index = FIRST_MATCH_GUIDE_STEPS.indexOf(step);
  return FIRST_MATCH_GUIDE_STEPS[index + 1] ?? null;
}

/**
 * 真实操作只跨过它已经证明掌握的步骤；不匹配的事件保持当前提示。
 * 出杆是强事实：即使用户没点“下一步”，也直接结束本轮瞄准/蓄力教学。
 */
export function guideStepAfterEvent(
  step: FirstMatchGuideStep,
  event: FirstMatchGuideEvent,
): FirstMatchGuideStep {
  if (event === 'cue-placed' && step === 'break-place') return 'break-aim';
  if (event === 'aim-used' && step === 'break-aim') return 'break-power';
  if (event === 'aim-used' && step === 'player-aim') return 'view';
  if (
    event === 'shot-committed' &&
    (
      step === 'break-place' ||
      step === 'break-aim' ||
      step === 'break-power'
    )
  ) {
    return 'player-aim';
  }
  if (event === 'shot-committed' && step === 'power') return 'layout';
  if (event === 'view-used' && step === 'view') return 'spin';
  if (event === 'spin-used' && step === 'spin') return 'power';
  return step;
}
