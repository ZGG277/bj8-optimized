/*
[INPUT]: 显式控件成功事实与可选 Storage；不依赖 React、DOM 或对局规则
[OUTPUT]: 稳定控件提示表、逐控件已学会存储、完局后瞄准/出杆/母球提示关闭规则与共享成功记录入口
[POS]: 控件新手提示领域层；展示由 ControlOnboarding 订阅，成功事实由实际动作拥有者提交
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { gameStorage } from './minitool/persistent-storage';
export const CONTROL_TIPS = {
  'view-overhead': '俯视：俯视全台',
  'view-manual': '手动视角：拖动球桌旋转观察',
  'view-height': '双指收拢拉远，张开放大',
  'view-first-person': '沿球杆方向看目标球',
  'assist-menu': '打开瞄准、走位与复盘开关',
  'assist-aim': '显示或隐藏预测瞄准线',
  'assist-plan': '计算下一杆的进球与走位',
  'assist-review': '显示上一杆的击球复盘',
  'assist-input': '切换拨轮或左右方向键',
  'aim-dial': '拨动调整方向，轻点切换粗精瞄',
  'aim-left': '向左微调，按住可连续调整',
  'aim-right': '向右微调，按住可连续调整',
  'spin': '点选母球，调整高低杆与左右塞',
  'spin-open': '展开母球击球点调节盘',
  'spin-close': '收起击球点调节盘',
  'shoot': '出杆：向下拉蓄力，松开出杆；横向移出取消；Enter 轻杆',
  'theme-menu': '选择喜欢的球房视觉主题',
  'theme-celadon': '切换为天青玉质的青瓷球房',
  'theme-noir': '切换为黑金配色的决赛之夜',
  'theme-neon': '切换为电光配色的霓虹球房',
  'plan-step-1': '查看第一杆的进球与走位路线',
  'plan-step-2': '查看第二杆的进球与走位路线',
  'plan-step-3': '查看第三杆的进球与走位路线',
  'plan-close': '关闭走位规划路线',
  'plan-status-close': '关闭本次走位计算或提示',
  'review-open': '对比计划路线与实际球路',
  'review-close': '收起计划与实际球路对比',
  'new-match': '重新摆球，开始下一局',
  'guide-skip': '跳过首局步骤，仍可悬停查看控件提示',
  'start-practice': '开始陪练，按自己的节奏练球',
  'start-challenge': '开始挑战，和对手正式对局',
} as const;

export type ControlTipId = keyof typeof CONTROL_TIPS;
export const COMPLETED_MATCH_STORAGE_KEY = 'princess-billiards:completed-match:v1';
export const MATCH_CONTROL_TIP_IDS: readonly ControlTipId[] = ['aim-dial', 'aim-left', 'aim-right', 'shoot', 'spin', 'spin-open', 'spin-close'];
export const CONTROL_LEARNING_STORAGE_KEY = 'princess-billiards:learned-controls:v1';
type LearningStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 首局内保留基础操作速查；完整打过一局后，出杆服从完局关闭规则，
 * 两项视角说明继续可查。
 */
export const PERSISTENT_CONTROL_TIP_IDS = ['view-overhead', 'view-manual', 'shoot'] as const;
const persistentControlTipIdSet = new Set<ControlTipId>(PERSISTENT_CONTROL_TIP_IDS);

export function shouldShowControlTip(id: ControlTipId, learned: boolean, completedMatch = false, touch = false): boolean {
  if (completedMatch && MATCH_CONTROL_TIP_IDS.includes(id)) return false;
  return touch || !learned || persistentControlTipIdSet.has(id);
}

export function isControlTipId(value: string | undefined): value is ControlTipId {
  return value !== undefined && Object.prototype.hasOwnProperty.call(CONTROL_TIPS, value);
}

function readLearned(storage: LearningStorage | null): Set<ControlTipId> {
  try {
    const values: unknown = JSON.parse(storage?.getItem(CONTROL_LEARNING_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(values)
      ? values.filter((id): id is ControlTipId => typeof id === 'string' && isControlTipId(id))
      : []);
  } catch {
    return new Set();
  }
}

/** 只有调用 mark 才学习；存储拒绝读写时保留本页内存态，不阻断产品动作。 */
export function createControlLearningStore(getStorage: () => LearningStorage | null) {
  let learned: Set<ControlTipId> | null = null;
  let completedMatch: boolean | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  const storage = () => {
    try { return getStorage(); } catch { return null; }
  };
  const snapshot = () => learned ??= readLearned(storage());
  const readCompleted = () => {
    try { return storage()?.getItem(COMPLETED_MATCH_STORAGE_KEY) === 'done'; } catch { return false; }
  };
  const hasCompletedMatch = () => completedMatch ??= readCompleted();
  return {
    has: (id: ControlTipId) => snapshot().has(id),
    hasCompletedMatch,
    completeMatch() {
      if (hasCompletedMatch()) return;
      completedMatch = true;
      try { storage()?.setItem(COMPLETED_MATCH_STORAGE_KEY, 'done'); } catch { /* 本页仍生效。 */ }
      revision += 1;
      listeners.forEach(listener => listener());
    },
    getRevision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    mark(id: ControlTipId) {
      if (!isControlTipId(id) || snapshot().has(id)) return;
      // 合并其他标签页已经学会的控件，避免覆盖各自的进度。
      learned = new Set([...snapshot(), ...readLearned(storage()), id]);
      try {
        storage()?.setItem(CONTROL_LEARNING_STORAGE_KEY, JSON.stringify([...learned]));
      } catch { /* 受限存储只退化为当前页面记忆。 */ }
      revision += 1;
      listeners.forEach(listener => listener());
    },
    refresh() {
      const next = new Set([...snapshot(), ...readLearned(storage())]);
      const completed = hasCompletedMatch() || readCompleted();
      if (next.size === snapshot().size && completed === completedMatch) return;
      completedMatch = completed;
      learned = next;
      revision += 1;
      listeners.forEach(listener => listener());
    },
  };
}

export const controlLearning = createControlLearningStore(() =>
  typeof window === 'undefined' ? null : gameStorage());
export const markControlLearned = controlLearning.mark;
