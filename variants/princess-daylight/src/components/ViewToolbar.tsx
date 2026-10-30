/*
[INPUT]: 相机高度、观战锁定、手动环绕与回调。
[OUTPUT]: 仅全局/第一两个可见按钮，按当前视角类别互斥选中。
[POS]: 触摸捏合的单指与键盘替代入口，不持有相机状态。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {markControlLearned,type ControlTipId} from '../control-onboarding';
import {FIRST_PERSON_VIEW,OVERHEAD_VIEW,clampViewLevel,isGlobalCameraView} from '../camera-view';
type Props={viewLevel:number;manualCameraActive:boolean;disabled:boolean;orientation:'horizontal'|'vertical';onViewLevel:(level:number)=>void;onToggleManualCamera:()=>void};
export function ViewToolbar({viewLevel,disabled,orientation,onViewLevel}:Props){
  const set=(level:number,tip:ControlTipId)=>{if(disabled)return;onViewLevel(level);markControlLearned(tip);};
  return <div className={`view-switcher view-shortcuts is-${orientation}`} aria-disabled={disabled} onClick={e=>e.stopPropagation()}
    onKeyDown={e=>{const delta=['ArrowUp','ArrowRight'].includes(e.key) ? .05 : ['ArrowDown','ArrowLeft'].includes(e.key)?-.05:0;if(delta){e.preventDefault();set(clampViewLevel(viewLevel+delta),'view-height');}}}>
    <button type="button" className={`view-mode-button ${isGlobalCameraView(viewLevel)?'is-active':''}`} aria-label="全局视角" data-control-tip="view-overhead" data-control-tip-copy="俯视：俯视全台" aria-pressed={isGlobalCameraView(viewLevel)} disabled={disabled} onClick={()=>set(OVERHEAD_VIEW,'view-overhead')}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 7h16M4 17h16"/><circle cx="12" cy="12" r="1.8"/></svg><span>全局视角</span>
    </button>
    <button type="button" className={`view-mode-button ${!isGlobalCameraView(viewLevel)?'is-active':''}`} aria-label="第一视角" data-control-tip="view-first-person" aria-pressed={!isGlobalCameraView(viewLevel)} disabled={disabled} onClick={()=>set(FIRST_PERSON_VIEW,'view-first-person')}>
      <span className="view-icon view-icon-eye" aria-hidden="true"><i/></span><span>第一视角</span>
    </button>
  </div>;
}
