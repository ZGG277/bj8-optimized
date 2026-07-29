/*
[INPUT]: 按概率排序的 PositionPlan 列表与关闭/分杆展示回调
[OUTPUT]: 只展示最高概率方案；默认第1杆，用户点击第2/3杆后才切换对应路线
[POS]: HUD 组件层，只做展示与分杆选择；场景渲染经 onShowStep 委托 Scene3D
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useState } from 'react';
import { useDraggableOverlay } from '../hooks/useDraggableOverlay';
import type { ShotCandidate } from '../planner/candidates';
import type { PositionPlan } from '../planner/search';

interface PlanOverlayProps {
  plans: PositionPlan[];
  onClose: () => void;
  /** 打开默认第1杆；用户点第2/3杆后只渲染对应一步；卸载时传 null 清除 */
  onShowStep: (plan: PositionPlan | null, stepIndex: number) => void;
}

/**
 * 压缩打法提示：spin.x 垂直（+高杆/-低杆，阈值 ±0.2 与 buildNote 一致）、
 * spin.y 水平（+右塞/-左塞，physics.ts 注释语义）；power 分档 <45 小力 / >65 发力 / 其余中力。
 */
function chipText(cand: ShotCandidate): string {
  const vertical = cand.spin.x >= 0.2 ? '高杆' : cand.spin.x <= -0.2 ? '低杆' : '中杆';
  const side = cand.spin.y >= 0.2 ? '右塞' : cand.spin.y <= -0.2 ? '左塞' : '';
  const power = cand.power < 45 ? '小力' : cand.power > 65 ? '发力' : '中力';
  return `${vertical}${side}${power}`;
}

export function PlanOverlay({ plans, onClose, onShowStep }: PlanOverlayProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const drag = useDraggableOverlay();
  // planner 已按 score/成功率排序；只给用户最高置信度方案，避免路线选择焦虑。
  const plan = plans[0];
  const safeStepIdx = plan ? Math.min(stepIdx, Math.max(0, plan.steps.length - 1)) : 0;
  const step = plan?.steps[safeStepIdx];

  // 默认只上屏第1杆；切换按钮才显示后续杆。
  useEffect(() => {
    onShowStep(plan ?? null, safeStepIdx);
  }, [plan, safeStepIdx, onShowStep]);
  // 卸载（关闭提示条）时清除规划渲染
  useEffect(() => () => onShowStep(null, 0), [onShowStep]);

  if (!plan || !step) return null;

  return (
    <div ref={drag.elementRef} className="plan-bar" style={drag.style} role="dialog" aria-label="走位规划">
      <span className="overlay-drag-handle" aria-label="拖动走位提示" {...drag.dragHandleProps}>⠿</span>
      <div className="plan-step-tabs" role="tablist" aria-label="分杆路线">
        {plan.steps.map((candidateStep, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeStepIdx}
              className={i === safeStepIdx ? 'active' : ''}
              onClick={() => setStepIdx(i)}
            >
              {`第${i + 1}球 · ${candidateStep.candidate.target}号`}
            </button>
        ))}
      </div>
      <div className="plan-bar-chips">
        <span className={`plan-chip plan-chip-${safeStepIdx + 1}`}>
          {chipText(step.candidate)}
        </span>
      </div>
      <span className="plan-bar-prob">{`本杆 ${Math.round(step.prob * 100)}%`}</span>
      <button type="button" className="plan-bar-close" aria-label="关闭走位规划" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
