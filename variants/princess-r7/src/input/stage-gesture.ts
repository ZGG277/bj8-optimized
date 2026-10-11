import { clampViewLevel } from '../camera-view';
export type StageOwner = 'aim' | 'orbit' | 'height';
export type StageGesture = { id:number; owner:StageOwner; x:number; y:number; level:number; travel:number; moved:boolean };
/** Up raises the existing continuous camera height; a half-screen stroke spans its full range. */
export function heightAfterSwipe(gesture:StageGesture,x:number,y:number):number {
  if (!gesture.moved && Math.abs(y-gesture.y)>=8 && Math.abs(y-gesture.y)>Math.abs(x-gesture.x)) gesture.moved=true;
  return gesture.moved ? clampViewLevel(gesture.level+(gesture.y-y)/gesture.travel) : gesture.level;
}
export function stageSafePoint(x:number,y:number,rect:{left:number;top:number;width:number;height:number}):boolean {
  return Number.isFinite(x)&&Number.isFinite(y)&&x>=rect.left+20&&x<=rect.left+rect.width-20&&y>=rect.top+20&&y<=rect.top+rect.height-20;
}
