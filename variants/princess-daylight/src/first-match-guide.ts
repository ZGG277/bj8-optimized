/*
[INPUT]: 首次引导本地存储、当前微提示与已经发生的真实交互事实
[OUTPUT]: 对外提供非阻塞首局引导状态机、有效角度变化判定与容错完成状态读写
[POS]: 纯产品状态层；不依赖 React、DOM、物理或对局规则实现
[PROTOCOL]: 提示、存储协议或转移变化时更新本注释、对应测试与 CLAUDE.md
*/

export const FIRST_MATCH_GUIDE_STORAGE_KEY =
  'princess-billiards:first-match-guide:v1';
export const GUIDE_PROGRESS_KEY = 'princess-billiards:first-match-progress:v1';

export const FIRST_MATCH_GUIDE_STEPS = [
  'first-power', 'first-rolling', 'turn-wait', 'free-place', 'ghost-place', 'aim-direction', 'next-power',
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
  | 'ghost-placed'
  | 'player-ready'
  | 'cue-placed'
  | 'coarse-aim-adjusted'
  | 'fine-aim-adjusted'
  | 'shot-committed'
  | 'view-adjusted'
  | 'spin-adjusted'
  | 'layout-adjusted';

export function shouldRunFirstMatchGuide(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  recordedPlayerShots = 0,
): boolean {
  if (Number.isFinite(recordedPlayerShots) && recordedPlayerShots > 0) {
    try { return storage?.getItem(FIRST_MATCH_GUIDE_STORAGE_KEY) !== 'done' && Boolean(storage?.getItem(GUIDE_PROGRESS_KEY)); } catch { return false; }
  }
  if (!storage) return true;
  try {
    return storage.getItem(FIRST_MATCH_GUIDE_STORAGE_KEY) !== 'done';
  } catch {
    return true;
  }
}

export function saveFirstMatchGuideCompleted(storage: Pick<Storage, 'getItem' | 'setItem'> | null): void {
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
  if (step === 'first-power') return event === 'shot-committed' ? 'first-rolling' : step;
  if (step === 'first-rolling') return step;
  if (step === 'turn-wait') return event === 'player-ready' ? 'ghost-place' : step;
  if (step === 'free-place') return event === 'cue-placed' ? 'ghost-place' : step;
  if (step === 'ghost-place') return event === 'ghost-placed' ? 'aim-direction' : step;
  if (step === 'aim-direction') return event === 'fine-aim-adjusted' || event === 'coarse-aim-adjusted' ? 'next-power' : step;
  if (step === 'next-power') return event === 'shot-committed' ? null : step;
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

/** Pure tutorial observations; never change a match or manufacture a miss. */
export function guideAfterSettlement(step: FirstMatchGuideStep | null, next: { phase: string; actor: string; messageKey: string }, _pocketed: number[]) {
  if (step !== 'first-rolling' && step !== 'turn-wait') return step;
  if (next.phase === 'finished') return null;
  if (next.actor === 'opponent') return 'turn-wait' as const;
  if (next.phase === 'placing') return 'free-place' as const;
  if (next.phase === 'aiming') return 'ghost-place' as const;
  return step;
}

export function firstTurnCopy(next: { actor: string; messageKey: string }, pocketed: number[]) {
  if (next.messageKey === 'foul') return '这杆犯规，轮到对手啦，公主稍等一下';
  if (next.actor === 'opponent' && pocketed.filter(n => n !== 0).length === 0) return '这杆没进，轮到对手啦，公主稍等一下';
  return '轮到对手啦，公主稍等一下';
}
