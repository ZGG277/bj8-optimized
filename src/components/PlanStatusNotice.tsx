/*
[INPUT]: 走位规划 computing/failed 状态、关闭回调与逐控件学习记录
[OUTPUT]: 在路线尚未就绪或没有可靠直攻路线时提供明确的非模态反馈
[POS]: HUD 组件层，避免灯泡开关只有亮灭变化却没有结果解释
[PROTOCOL]: 文案或状态语义变化时更新 components/CLAUDE.md 与浏览器规划门禁
*/
import type { PositionPlanStatus } from '../hooks/usePositionPlan';
import { markControlLearned } from '../control-onboarding';

interface PlanStatusNoticeProps {
  status: Extract<PositionPlanStatus, 'computing' | 'failed'>;
  onClose: () => void;
}

export function PlanStatusNotice({ status, onClose }: PlanStatusNoticeProps) {
  return (
    <div className={`plan-status-notice ${status}`} role="status" aria-live="polite">
      <span className="plan-status-pulse" aria-hidden="true" />
      <span>
        {status === 'computing'
          ? '走位：正在计算可靠路线…'
          : '走位：当前没有可靠的直接进攻路线'}
      </span>
      <button type="button" className="plan-bar-close" data-control-tip="plan-status-close" aria-label="关闭走位提示" onClick={() => {
        onClose();
        markControlLearned('plan-status-close');
      }}>
        ✕
      </button>
    </div>
  );
}
