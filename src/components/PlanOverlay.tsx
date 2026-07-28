/*
[INPUT]: PositionPlan 列表与关闭/展示/播放回调；依赖 planner 的 PlannedStep/PositionPlan 类型
[OUTPUT]: 渲染走位规划紧凑提示条（路线切换、三杆压缩打法 chip、连贯概率、整链播放、关闭）
[POS]: HUD 组件层，只做展示与选择转发；场景渲染经 onShowPlan/onPlayPlan 委托 Scene3D
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useState } from 'react';
import type { ShotCandidate } from '../planner/candidates';
import type { PositionPlan } from '../planner/search';

interface PlanOverlayProps {
  plans: PositionPlan[];
  onClose: () => void;
  /** 选中路线变化时通知（打开即展示首条路线整链；卸载时传 null 清除） */
  onShowPlan: (plan: PositionPlan | null) => void;
  /** 点击播放：驱动 Scene3D 整链连续播放当前路线 */
  onPlayPlan: (plan: PositionPlan) => void;
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

export function PlanOverlay({ plans, onClose, onShowPlan, onPlayPlan }: PlanOverlayProps) {
  const [routeIdx, setRouteIdx] = useState(0);
  const plan = plans[routeIdx] ?? plans[0];

  // 选中路线 → 场景整链渲染（路线切换、初次打开都经此同步）
  useEffect(() => {
    onShowPlan(plan ?? null);
  }, [plan, onShowPlan]);
  // 卸载（关闭提示条）时清除规划渲染
  useEffect(() => () => onShowPlan(null), [onShowPlan]);

  if (!plan) return null;

  const probText =
    plan.steps.length >= 2
      ? `连贯 ${Math.round(plan.chainProb * 100)}%`
      : `本杆 ${Math.round(plan.chainProb * 100)}%`;

  return (
    <div className="plan-bar" role="dialog" aria-label="走位规划">
      {plans.length >= 2 && (
        <div className="plan-bar-routes" role="tablist">
          {plans.map((p, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === routeIdx}
              className={i === routeIdx ? 'active' : ''}
              onClick={() => setRouteIdx(i)}
            >
              {`${['①', '②', '③'][i] ?? `${i + 1}`}${Math.round(p.chainProb * 100)}%`}
            </button>
          ))}
        </div>
      )}
      <div className="plan-bar-chips">
        {plan.steps.map((s, i) => (
          <span key={i} className={`plan-chip plan-chip-${i + 1}`}>
            {`${i + 1}·${chipText(s.candidate)}`}
          </span>
        ))}
      </div>
      <span className="plan-bar-prob">{probText}</span>
      <button type="button" className="plan-bar-play" aria-label="播放整杆路线" onClick={() => onPlayPlan(plan)}>
        ▶ 播放
      </button>
      <button type="button" className="plan-bar-close" aria-label="关闭走位规划" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
