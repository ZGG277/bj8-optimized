/**
 * [INPUT]: 开场状态、退出回调与捕获阶段输入。
 * [OUTPUT]: 吞掉完整跳过手势，明确的音乐控件仍可点击且不会跳过画面。
 * [POS]: 开场/球桌输入隔离边界，不自行改变声音或对局。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
export function openingInputGate(target: EventTarget, active: () => boolean, finish: () => void, focusTarget: EventTarget = target) {
  let skipping=false, ignoreClick=false, timer:ReturnType<typeof setTimeout>|null=null;
  const clear=()=>{skipping=false;ignoreClick=false;if(timer!==null)clearTimeout(timer);timer=null;};
  const suppress=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const isControl=(event:Event)=>typeof Element !== 'undefined' && event.target instanceof Element && !!(event.target.closest('[data-opening-start]') || event.target.closest('[data-opening-control]'));
  const down=(event:Event)=>{
    if(isControl(event))return;
    if(!active()&&!skipping){clear();return;} // A new deliberate gesture may proceed.
    suppress(event);skipping=true;finish();
  };
  const release=(event:Event)=>{
    if(isControl(event)||!skipping)return;suppress(event);skipping=false;ignoreClick=true;
    if(timer!==null)clearTimeout(timer);
    // Retain suppression for delayed touch/keyboard synthetic clicks. A new down clears it.
    timer=setTimeout(clear,750);
  };
  const click=(event:Event)=>{if(isControl(event))return;if(skipping||ignoreClick||active()){suppress(event);finish();ignoreClick=false;}};
  const listeners:[string,EventListener][]=[['pointerdown',down],['keydown',down],['pointerup',release],['pointercancel',release],['keyup',release],['click',click],['visibilitychange',clear]];
  for(const [name,listener]of listeners)target.addEventListener(name,listener,{capture:true});
  focusTarget.addEventListener('blur',clear,{capture:true});
  return ()=>{for(const [name,listener]of listeners)target.removeEventListener(name,listener,{capture:true});focusTarget.removeEventListener('blur',clear,{capture:true});clear();};
}
