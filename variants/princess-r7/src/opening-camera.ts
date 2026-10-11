/** Opening presentation only. Pure poses also drive offline camera evidence. */
import { CAMERA_FOV_DEGREES, projectFramingPoint, type CameraSafetyInsets, type FramingPose } from './camera-framing';
import { TABLE, POCKETS } from './physics';
import { tableFrameEnvelope } from './pocket-render/frame-geometry';
import { pocketSeamContract } from './pocket-render/seam-contract';
import { pocketRenderProfile } from './pocket-render/profile';
const envelope = tableFrameEnvelope(POCKETS.map(p => pocketSeamContract(p, pocketRenderProfile(p))));
// Include rounded apron, gold piping, balls and the complete feet, not only the felt plane.
export const OPENING_BOUNDS = { x: Math.max(envelope.halfWidth + .06, TABLE.width / 2 + .12), z: Math.max(envelope.halfLength + .06, TABLE.length / 2 + .12), bottom: -.86, top: .12 };
export const OPENING_DURATION = 2.8;
/** HUD paint is hidden during the furniture reveal; retain a modest edge gutter. */
export const OPENING_SAFETY: CameraSafetyInsets = {top:.045,right:.045,bottom:.045,left:.045};
export const openingBoundsPoints = () => [-1,1].flatMap(x => [-1,1].flatMap(z => [OPENING_BOUNDS.bottom,OPENING_BOUNDS.top].map(y => ({x:x*OPENING_BOUNDS.x,y,z:z*OPENING_BOUNDS.z}))));
const ease = (v:number) => { const t=Math.max(0,Math.min(1,v)); return t*t*t*(t*(t*6-15)+10); };
function mix(a:FramingPose,b:FramingPose,t:number):FramingPose { const point=(p:typeof a.position,q:typeof a.position)=>({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t});return {position:point(a.position,b.position),lookAt:point(a.lookAt,b.lookAt)}; }
export function openingTablePose(aspect:number,safety:CameraSafetyInsets):FramingPose {
  aspect=Math.max(.25,Math.min(4,Number.isFinite(aspect)?aspect:1));
  const yaw=aspect<1?.30:1.05, elevation=26*Math.PI/180;
  const lookAt={x:0,y:-.34,z:0};
  const pose=(distance:number):FramingPose=>({lookAt,position:{x:-Math.sin(yaw)*Math.cos(elevation)*distance,y:lookAt.y+Math.sin(elevation)*distance,z:Math.cos(yaw)*Math.cos(elevation)*distance}});
  const marginX=Math.min(.4,Math.max(safety.left,safety.right,.045)+.025),marginY=Math.min(.4,Math.max(safety.top,safety.bottom,.045)+.025);
  let lo=1,hi=32;
  for(let i=0;i<40;i++){const d=(lo+hi)/2,p=pose(d);const fits=openingBoundsPoints().every(point=>{const s=projectFramingPoint(point,p,aspect);return s&&Math.abs(s.x)<=1-2*marginX&&Math.abs(s.y)<=1-2*marginY;});if(fits)hi=d;else lo=d;}
  return pose(hi);
}
export function openingCameraPose(elapsed:number,aspect:number,_gameplaySafety:CameraSafetyInsets,gameplay:FramingPose):FramingPose {
  if(elapsed>=OPENING_DURATION)return gameplay;
  const close=openingTablePose(aspect,OPENING_SAFETY);
  const far={lookAt:close.lookAt,position:{x:close.lookAt.x+(close.position.x-close.lookAt.x)*1.75,y:close.lookAt.y+(close.position.y-close.lookAt.y)*1.75,z:close.lookAt.z+(close.position.z-close.lookAt.z)*1.75}};
  if(elapsed<1.5)return mix(far,close,ease(elapsed/1.5));
  if(elapsed<1.95)return close;
  return mix(close,gameplay,ease((elapsed-1.95)/(OPENING_DURATION-1.95)));
}
/** Fixtures remain lit; only their mesh is omitted while the camera rises through them. */
export const openingHidesFixtures = (elapsed:number|null) => elapsed !== null && elapsed >= 1.95 && elapsed < OPENING_DURATION;
export { CAMERA_FOV_DEGREES };
