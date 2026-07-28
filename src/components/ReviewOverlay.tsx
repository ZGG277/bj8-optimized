/*
[INPUT]: ShotReview（planner/review 判定结果）+ open 状态与开关回调
[OUTPUT]: 渲染击球复盘 UI——折叠态 .review-chip（一句话诊断 + ▶ 对比入口）/ 展开态 .review-bar（诊断 + 图例 + ✕）
[POS]: HUD 组件层，只做展示与事件转发；场景对比渲染经父组件回调委托 Scene3D.showReviewOverlay
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { ShotReview } from '../planner/review';

interface ReviewOverlayProps {
  review: ShotReview;
  /** 展开=场景叠加对比渲染中（对比条形态）；折叠=chip 形态 */
  open: boolean;
  /** 折叠态点击：展开对比（父组件负责切俯视 + showReviewOverlay） */
  onOpen: () => void;
  /** 展开态 ✕：收起对比回 chip（父组件负责清场景叠加 + 恢复视角） */
  onClose: () => void;
}

const VERDICT_LABEL: Record<ShotReview['verdict'], string> = {
  perfect: '完美复现',
  'position-miss': '走位偏差',
  'pot-miss': '未进球',
};

/**
 * 复盘讲「上一杆」、规划讲「下一杆」，两者可共存；
 * 规划引导打开时父组件不渲染本组件（提示条位置让位给 plan-bar）。
 */
export function ReviewOverlay({ review, open, onOpen, onClose }: ReviewOverlayProps) {
  if (!open) {
    return (
      <button type="button" className="review-chip" onClick={onOpen} aria-label="展开击球复盘对比">
        <span className={`review-verdict-dot ${review.verdict}`} />
        {`复盘：${review.message} · ▶ 对比`}
      </button>
    );
  }
  return (
    <div className="review-bar" role="dialog" aria-label="击球复盘">
      <span className={`review-verdict ${review.verdict}`}>{VERDICT_LABEL[review.verdict]}</span>
      <span className="review-bar-message">{review.message}</span>
      <span className="review-bar-legend">
        <span className="legend-plan">┄ 计划</span>
        <span className="legend-actual">— 实际</span>
      </span>
      <button type="button" className="plan-bar-close" aria-label="收起击球复盘" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
