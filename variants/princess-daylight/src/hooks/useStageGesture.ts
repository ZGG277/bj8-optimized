/**
 * [INPUT]: 单指球桌交互、双指前回滚及连续相机高度回调。
 * [OUTPUT]: 单指/双指/排空路由；双指释放不提交瞄准或摆球。
 * [POS]: 球桌输入仲裁层，仅同一 viewport 的触点可以晋升捏合。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {useEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';
import {heightAfterSwipe,heightAfterPinch,stageSafePoint,type StageGesture,type PinchGesture} from '../input/stage-gesture';
type Event = ReactPointerEvent;
type Options = {
  enabled:boolean; mode:'aim'|'orbit'|'locked'; level:number;
  hitTable:(x:number,y:number)=>boolean; onHeight:(level:number)=>void;
  down:(event:Event)=>void; move:(event:Event)=>void;
  up:(event:Event)=>void; cancel:(event:Event)=>void;
  pinchStart?:(event:Event)=>void;
};
export function useStageGesture(options:Options){
  const latest=useRef(options);latest.current=options;
  const active=useRef<{gesture:StageGesture;event:Event}|null>(null);
  const points=useRef(new Map<number,{x:number;y:number}>());
  const pinch=useRef<PinchGesture|null>(null);
  const blocked=useRef(new Set<number>());
  const stage=useRef<HTMLElement|null>(null);
  const draining=useRef(false);
  const release=(id:number)=>{const target=stage.current;if(target?.hasPointerCapture(id))target.releasePointerCapture(id);};
  const abort=()=>{
    const session=active.current;active.current=null;pinch.current=null;
    for(const id of points.current.keys())blocked.current.add(id);
    points.current.clear();draining.current=blocked.current.size>0;
    if(session&&session.gesture.owner!=='height')latest.current.cancel(session.event);
    for(const id of blocked.current)release(id);
  };
  const validTarget=(event:{target:EventTarget|null;clientX:number;clientY:number})=>{
    const target=stage.current,hit=event.target as HTMLElement|null;
    return !!target&&(hit===target||hit?.tagName==='CANVAS'&&target.contains(hit))&&stageSafePoint(event.clientX,event.clientY,target.getBoundingClientRect());
  };
  useEffect(()=>{
    const extra=(event:PointerEvent)=>{
      if(draining.current){blocked.current.add(event.pointerId);return;}
      if(!active.current&&!pinch.current&&!draining.current&&event.isPrimary)blocked.current.clear();
      if((active.current||pinch.current)&&!points.current.has(event.pointerId)){
        if(!pinch.current&&event.pointerType==='touch'&&validTarget(event))return;
        blocked.current.add(event.pointerId);abort();
      }
    };
    const released=(event:PointerEvent)=>{blocked.current.delete(event.pointerId);if(!blocked.current.size)draining.current=false;};
    const interrupted=()=>{abort();blocked.current.clear();draining.current=false;};
    const hidden=()=>{if(document.hidden)interrupted();};
    window.addEventListener('pointerdown',extra,true);
    window.addEventListener('pointerup',released);window.addEventListener('pointercancel',released);
    window.addEventListener('resize',interrupted);window.addEventListener('blur',interrupted);
    document.addEventListener('visibilitychange',hidden);
    return()=>{abort();window.removeEventListener('pointerdown',extra,true);window.removeEventListener('pointerup',released);window.removeEventListener('pointercancel',released);window.removeEventListener('resize',interrupted);window.removeEventListener('blur',interrupted);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{if(!options.enabled)abort();},[options.enabled]);
  useEffect(()=>()=>abort(),[options.mode]);
  return {
    down:(event:Event)=>{
      const o=latest.current;
      if(!o.enabled||o.mode==='locked'||blocked.current.has(event.pointerId)||draining.current)return;
      if(event.pointerType==='mouse'&&event.button!==0)return;
      const target=event.target as HTMLElement;
      if(target.tagName!=='CANVAS'&&target!==event.currentTarget)return;
      const rect=event.currentTarget.getBoundingClientRect();
      if(!stageSafePoint(event.clientX,event.clientY,rect))return;
      if(active.current){
        if(event.pointerType!=='touch'||active.current.event.pointerType!=='touch'){abort();return;}
        const session=active.current;active.current=null;
        points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
        const [a,b]=[...points.current.values()];
        // 专用回滚不释放首指 capture，避免内部 lostcapture 取消新捏合。
        if(session.gesture.owner!=='height') (o.pinchStart??o.cancel)(session.event);
        pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),level:o.level,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();return;
      }
      if(pinch.current){blocked.current.add(event.pointerId);abort();return;}
      stage.current=event.currentTarget as HTMLElement;
      const owner=o.hitTable(event.clientX,event.clientY)?o.mode:'height';
      points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      active.current={gesture:{id:event.pointerId,owner,x:event.clientX,y:event.clientY,level:o.level,travel:Math.max(160,rect.height*.5),moved:false},event:{...event,currentTarget:event.currentTarget} as Event};
      event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
      if(owner!=='height')o.down(event);
    },
    move:(event:Event)=>{
      if(!latest.current.enabled){abort();return;}
      if(!points.current.has(event.pointerId))return;
      points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});event.preventDefault();
      if(pinch.current){
        const [a,b]=[...points.current.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
        if(pinch.current.distance<32){if(distance>=32)pinch.current={distance,level:latest.current.level,moved:false};return;}
        const level=heightAfterPinch(pinch.current,distance);
        if(pinch.current.moved){
          latest.current.onHeight(level);
          // 到端点即重设基准，反向捏合无需穿过已经越界的距离。
          if(level===0||level===1)pinch.current={distance,level,moved:true};
        }
        return;
      }
      const s=active.current;if(!s||s.gesture.id!==event.pointerId)return;
      if(s.gesture.owner==='height'){
        const level=heightAfterSwipe(s.gesture,event.clientX,event.clientY);
        if(s.gesture.moved)latest.current.onHeight(level);
      }else latest.current.move(event);
    },
    finish:(event:Event,canceled=false)=>{
      if(pinch.current){
        // 任一指结束就排空余下全部触点，绝不把最后一指交回瞄准。
        for(const id of points.current.keys())if(id!==event.pointerId)blocked.current.add(id);
        const ids=[...points.current.keys()];points.current.clear();pinch.current=null;draining.current=blocked.current.size>0;
        for(const id of ids)release(id);event.preventDefault();return;
      }
      const s=active.current;if(!s||s.gesture.id!==event.pointerId)return;
      active.current=null;points.current.delete(event.pointerId);
      if(s.gesture.owner!=='height')(canceled?latest.current.cancel:latest.current.up)(event);
      release(event.pointerId);
    },
  };
}
