import {useEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';
import {heightAfterSwipe,stageSafePoint,type StageGesture} from '../input/stage-gesture';

type Event = ReactPointerEvent;
type Options = {
  enabled:boolean; mode:'aim'|'orbit'|'locked'; level:number;
  hitTable:(x:number,y:number)=>boolean; onHeight:(level:number)=>void;
  down:(event:Event)=>void; move:(event:Event)=>void;
  up:(event:Event)=>void; cancel:(event:Event)=>void;
};
/** One pointer-down owns the entire gesture. Cancellations never flow through pointer-up. */
export function useStageGesture(options:Options){
  const latest=useRef(options);latest.current=options;
  const active=useRef<{gesture:StageGesture;event:Event}|null>(null);
  const blocked=useRef(new Set<number>());
  const abort=()=>{
    const session=active.current;if(!session)return;
    active.current=null;
    if(session.gesture.owner!=='height')latest.current.cancel(session.event);
    const target=session.event.currentTarget;
    if(target?.hasPointerCapture(session.gesture.id))target.releasePointerCapture(session.gesture.id);
  };
  useEffect(()=>{
    const extra=(event:PointerEvent)=>{if(!active.current&&event.isPrimary)blocked.current.clear();if(active.current&&event.pointerId!==active.current.gesture.id){blocked.current.add(event.pointerId);abort();}};
    const released=(event:PointerEvent)=>blocked.current.delete(event.pointerId);
    const hidden=()=>{if(document.hidden)abort();};
    window.addEventListener('pointerdown',extra,true);
    window.addEventListener('pointerup',released);window.addEventListener('pointercancel',released);
    window.addEventListener('resize',abort);window.addEventListener('blur',abort);
    document.addEventListener('visibilitychange',hidden);
    return()=>{abort();window.removeEventListener('pointerdown',extra,true);window.removeEventListener('pointerup',released);window.removeEventListener('pointercancel',released);window.removeEventListener('resize',abort);window.removeEventListener('blur',abort);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{if(!options.enabled)abort();},[options.enabled]);
  useEffect(()=>()=>abort(),[options.mode]);
  return {
    down:(event:Event)=>{
      const o=latest.current;
      if(!o.enabled||o.mode==='locked'||blocked.current.has(event.pointerId))return;
      if(active.current){abort();blocked.current.add(event.pointerId);return;}
      if(event.pointerType==='mouse'&&event.button!==0)return;
      const target=event.target as HTMLElement;
      if(target.tagName!=='CANVAS'&&target!==event.currentTarget)return;
      const rect=event.currentTarget.getBoundingClientRect();
      if(!stageSafePoint(event.clientX,event.clientY,rect))return;
      const owner=o.hitTable(event.clientX,event.clientY)?o.mode:'height';
      active.current={gesture:{id:event.pointerId,owner,x:event.clientX,y:event.clientY,level:o.level,travel:Math.max(160,rect.height*.5),moved:false},event:{...event,currentTarget:event.currentTarget} as Event};
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      if(owner!=='height')o.down(event);
    },
    move:(event:Event)=>{
      const s=active.current;if(!s||s.gesture.id!==event.pointerId)return;
      if(!latest.current.enabled){abort();return;}
      event.preventDefault();
      if(s.gesture.owner==='height'){
        const level=heightAfterSwipe(s.gesture,event.clientX,event.clientY);
        if(s.gesture.moved)latest.current.onHeight(level);
      }else latest.current.move(event);
    },
    finish:(event:Event,canceled=false)=>{
      const s=active.current;if(!s||s.gesture.id!==event.pointerId)return;
      active.current=null;
      if(s.gesture.owner!=='height')(canceled?latest.current.cancel:latest.current.up)(event);
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    },
  };
}
