/* [INPUT]: Optional experiment camera/ripple callbacks [OUTPUT]: Disposable local exploration controls.
[POS]: Visual preview only; never writes match or physics. */
export function mountLakeExplorer(onView:(yaw:number,pitch:number,active:boolean)=>void,onRipples:(enabled:boolean)=>void) {
 const panel=document.createElement('div'); panel.dataset.lakeExplorer='true';
 panel.style.cssText='position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:1000;background:#162a30df;color:#eef5ee;border:1px solid #ffffff33;border-radius:18px;padding:9px 13px;font:12px system-ui;max-width:calc(100vw - 32px);box-sizing:border-box;white-space:nowrap';
 const button=document.createElement('button'); button.textContent='环顾湖面';
 const ripple=document.createElement('button'); ripple.textContent='暂停水波';
 const controls=document.createElement('div'); controls.hidden=true; controls.style.marginTop='8px';
 const yaw=document.createElement('input'); yaw.type='range'; yaw.min='0'; yaw.max='360'; yaw.value='180'; yaw.ariaLabel='湖面方位'; yaw.style.width='130px';
 const pitch=document.createElement('input'); pitch.type='range'; pitch.min='-85'; pitch.max='85'; pitch.value='0'; pitch.ariaLabel='抬头低头'; pitch.style.width='100px';
 controls.append('转向 ',yaw,' 仰俯 ',pitch); panel.append(button,ripple,controls);
 for(const b of [button,ripple]) b.style.cssText='background:none;color:inherit;border:0;padding:3px 10px;font:inherit;cursor:pointer';
 let active=false, waves=true;
 const update=()=>onView(Number(yaw.value)*Math.PI/180,Number(pitch.value)*Math.PI/180,active);
 button.onclick=()=>{active=!active; controls.hidden=!active; button.textContent=active?'回到球桌':'环顾湖面'; update();};
 ripple.onclick=()=>{waves=!waves;ripple.textContent=waves?'暂停水波':'恢复水波';onRipples(waves);};
 yaw.oninput=pitch.oninput=update;
 // Pointer drag on panorama turns the eye, while game input stays intact after exit.
 const shield=document.createElement('div'); shield.style.cssText='position:fixed;inset:0;z-index:999;display:none;touch-action:none';
 let drag:{x:number,y:number,a:number,p:number}|null=null;
 shield.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,a:Number(yaw.value),p:Number(pitch.value)};shield.setPointerCapture(e.pointerId);};
 shield.onpointermove=e=>{if(!drag)return;yaw.value=String((drag.a-(e.clientX-drag.x)*.3+720)%360);pitch.value=String(Math.max(-85,Math.min(85,drag.p+(e.clientY-drag.y)*.25)));update();};
 shield.onpointerup=()=>{drag=null;}; shield.onpointercancel=()=>{drag=null;};
 const click=button.onclick; button.onclick=e=>{click.call(button,e); shield.style.display=active?'block':'none';};
 document.body.append(shield,panel);
 return ()=>{panel.remove();shield.remove();};
}
