/**
 * [INPUT]: 相机高度钳制、指针位移和双指距离。
 * [OUTPUT]: 单指台外滑动及双指捏合的连续高度、安全边缘判定。
 * [POS]: 不依赖 DOM 的球桌手势数学，供 useStageGesture 消费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
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

/** 双指收拢升高拉远，张开降低拉近；纯平移/旋转不改变距离。 */
export type PinchGesture = {distance:number;level:number;moved:boolean};
export function heightAfterPinch(gesture:PinchGesture,distance:number):number {
  if(!Number.isFinite(distance)||!Number.isFinite(gesture.distance)||distance<1||gesture.distance<32)return gesture.level;
  if(!gesture.moved&&Math.abs(distance-gesture.distance)>=Math.max(6,gesture.distance*.025))gesture.moved=true;
  return gesture.moved?clampViewLevel(gesture.level-Math.log2(distance/gesture.distance)):gesture.level;
}
