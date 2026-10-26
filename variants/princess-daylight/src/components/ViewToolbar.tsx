/*
[INPUT]: 相机高度、观战锁定、手动环绕与回调。
[OUTPUT]: 紧凑全台/环绕/第一视角图标及键盘高度调整，无长滑轨。
[POS]: 触摸捏合的单指与键盘替代入口，不持有相机状态。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {markControlLearned,type ControlTipId} from '../control-onboarding';
import {FIRST_PERSON_VIEW,OVERHEAD_VIEW,clampViewLevel} from '../camera-view';
type Props={viewLevel:number;manualCameraActive:boolean;disabled:boolean;orientation:'horizontal'|'vertical';onViewLevel:(level:number)=>void;onToggleManualCamera:()=>void};
export function ViewToolbar({viewLevel,manualCameraActive,disabled,orientation,onViewLevel,onToggleManualCamera}:Props){
  const set=(level:number,tip:ControlTipId)=>{if(disabled)return;onViewLevel(level);markControlLearned(tip);};
  return <div className={`view-switcher view-shortcuts is-${orientation}`} aria-disabled={disabled} onClick={e=>e.stopPropagation()}
    onKeyDown={e=>{const delta=['ArrowUp','ArrowRight'].includes(e.key) ? .05 : ['ArrowDown','ArrowLeft'].includes(e.key)?-.05:0;if(delta){e.preventDefault();set(clampViewLevel(viewLevel+delta),'view-height');}}}>
    <button type="button" className="view-mode-button" aria-label="切换俯视视角" data-control-tip="view-overhead" data-control-tip-copy="俯视：俯视全台" aria-pressed={viewLevel>=.995} disabled={disabled} onClick={()=>set(OVERHEAD_VIEW,'view-overhead')}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 7h16M4 17h16"/><circle cx="12" cy="12" r="1.8"/></svg>
    </button>
    <button type="button" className="view-mode-button" data-control-tip="view-manual" data-control-tip-copy={manualCameraActive?'退出手动视角：保留当前观察角度':'开启手动视角：拖动球桌旋转观察'} aria-label={manualCameraActive?'退出手动视角':'开启手动视角'} aria-pressed={manualCameraActive} disabled={disabled} onClick={()=>{if(!disabled){onToggleManualCamera();markControlLearned('view-manual');}}}>
      <span className="manual-camera-icon" aria-hidden="true"><i/></span>
    </button>
    <button type="button" className="view-mode-button" aria-label="切换第一人称视角" data-control-tip="view-first-person" aria-pressed={viewLevel<=.005} disabled={disabled} onClick={()=>set(FIRST_PERSON_VIEW,'view-first-person')}>
      <span className="view-icon view-icon-eye" aria-hidden="true"><i/></span>
    </button>
  </div>;
}
