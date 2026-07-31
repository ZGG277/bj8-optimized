/*
[INPUT]: 首次引导本地存储、当前微提示与已经发生的真实交互事实
[OUTPUT]: 对外提供非阻塞首局引导状态机、有效角度变化判定与容错完成状态读写
[POS]: 纯产品状态层；不依赖 React、DOM、物理或对局规则实现
[PROTOCOL]: 提示、存储协议或转移变化时更新本注释、对应测试与 CLAUDE.md
*/

export const FIRST_MATCH_GUIDE_STORAGE_KEY =
  'guagua-billiards:first-match-guide:v1';

export const FIRST_MATCH_GUIDE_STEPS = [
  'break-place',
  'break-coarse',
  'break-fine',
  'break-power',
  'player-view',
  'player-spin',
  'player-layout',
] as const;

export type FirstMatchGuideStep = typeof FIRST_MATCH_GUIDE_STEPS[number];

export type FirstMatchGuideEvent =
  | 'cue-placed'
  | 'coarse-aim-adjusted'
  | 'fine-aim-adjusted'
  | 'shot-committed'
  | 'view-adjusted'
  | 'spin-adjusted'
  | 'layout-adjusted';

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

export function isMeaningfulGuideAimChange(
  startAngle: number,
  endAngle: number,
  minimumRadians: number,
): boolean {
  if (
    !Number.isFinite(startAngle) ||
    !Number.isFinite(endAngle) ||
    !Number.isFinite(minimumRadians) ||
    minimumRadians < 0
  ) {
    return false;
  }
  const delta = Math.atan2(
    Math.sin(endAngle - startAngle),
    Math.cos(endAngle - startAngle),
  );
  return Math.abs(delta) >= minimumRadians;
}

/**
 * 核心节奏只由放球、有效瞄准和成功出杆推进。
 * 视角/杆法/布局是非阻塞发现：可按真实操作切换，也可由下一次成功出杆直接收敛。
 */
export function guideStepAfterEvent(
  step: FirstMatchGuideStep,
  event: FirstMatchGuideEvent,
): FirstMatchGuideStep | null {
  if (event === 'shot-committed') {
    return step.startsWith('break-') ? 'player-view' : null;
  }

  if (step === 'break-place' && event === 'cue-placed') return 'break-coarse';
  if (step === 'break-coarse' && event === 'coarse-aim-adjusted') return 'break-fine';
  if (
    (step === 'break-coarse' || step === 'break-fine') &&
    event === 'fine-aim-adjusted'
  ) {
    return 'break-power';
  }
  if (step === 'player-view' && event === 'view-adjusted') return 'player-spin';
  if (
    (step === 'player-view' || step === 'player-spin') &&
    event === 'spin-adjusted'
  ) {
    return 'player-layout';
  }
  if (step.startsWith('player-') && event === 'layout-adjusted') return null;
  return step;
}
