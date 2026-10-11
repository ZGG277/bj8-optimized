/** Swallow a complete skip gesture before gameplay receives any part of it. */
export function openingInputGate(target: EventTarget, active: () => boolean, finish: () => void, focusTarget: EventTarget = target) {
  let skipping=false, ignoreClick=false, timer:ReturnType<typeof setTimeout>|null=null;
  const clear=()=>{skipping=false;ignoreClick=false;if(timer!==null)clearTimeout(timer);timer=null;};
  const suppress=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const down=(event:Event)=>{
    if(!active()&&!skipping){clear();return;} // A new deliberate gesture may proceed.
    suppress(event);skipping=true;finish();
  };
  const release=(event:Event)=>{
    if(!skipping)return;suppress(event);skipping=false;ignoreClick=true;
    if(timer!==null)clearTimeout(timer);
    // Retain suppression for delayed touch/keyboard synthetic clicks. A new down clears it.
    timer=setTimeout(clear,750);
  };
  const click=(event:Event)=>{if(skipping||ignoreClick||active()){suppress(event);finish();ignoreClick=false;}};
  const listeners:[string,EventListener][]=[['pointerdown',down],['keydown',down],['pointerup',release],['pointercancel',release],['keyup',release],['click',click],['visibilitychange',clear]];
  for(const [name,listener]of listeners)target.addEventListener(name,listener,{capture:true});
  focusTarget.addEventListener('blur',clear,{capture:true});
  return ()=>{for(const [name,listener]of listeners)target.removeEventListener(name,listener,{capture:true});focusTarget.removeEventListener('blur',clear,{capture:true});clear();};
}
