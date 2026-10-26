/**
 * [INPUT]: 球桌输入路由与可控指针事件。
 * [OUTPUT]: 单指归属、双指晋升/排空/端点反向与取消的回归。
 * [POS]: 无DOM的输入仲裁测试，不替代真机触摸。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const harness=vi.hoisted(()=>({refs:[] as {current:any}[],index:0,effects:[] as (()=>void|(()=>void))[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useRef:(value:unknown)=>harness.refs[harness.index++]??(harness.refs[harness.index-1]={current:value}),useEffect:(effect:()=>void)=>harness.effects.push(effect)}));
import {useStageGesture} from './useStageGesture';
import {heightAfterSwipe,heightAfterPinch,stageSafePoint} from '../input/stage-gesture';
let windowTarget:EventTarget,documentTarget:EventTarget;
beforeEach(()=>{harness.refs=[];harness.index=0;harness.effects=[];windowTarget=new EventTarget();documentTarget=new EventTarget();vi.stubGlobal('window',windowTarget);vi.stubGlobal('document',documentTarget);});
afterEach(()=>vi.unstubAllGlobals());
function setup(){
 const captures=new Set<number>();const target={tagName:'CANVAS',getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}),setPointerCapture:(id:number)=>captures.add(id),hasPointerCapture:(id:number)=>captures.has(id),releasePointerCapture:(id:number)=>captures.delete(id)};
 const o={enabled:true,mode:'aim' as const,level:.4,hitTable:vi.fn((x:number)=>x>100&&x<300),onHeight:vi.fn(),pinchStart:vi.fn(),down:vi.fn(),move:vi.fn(),up:vi.fn(),cancel:vi.fn()};
 const hook=useStageGesture(o);harness.effects.forEach(effect=>effect());
 const e=(x:number,y:number,id=1)=>({clientX:x,clientY:y,pointerId:id,pointerType:'touch',button:0,currentTarget:target,target,preventDefault:vi.fn()}) as any;
 return {o,hook,e,captures};
}
describe('actual stage pointer router',()=>{
 it('outside to inside stays height and cannot aim or shoot',()=>{const {o,hook,e}=setup();hook.down(e(50,400));hook.move(e(200,200));hook.finish(e(200,200));expect(o.onHeight).toHaveBeenLastCalledWith(.4+200/422);expect(o.down).not.toHaveBeenCalled();expect(o.move).not.toHaveBeenCalled();expect(o.up).not.toHaveBeenCalled();expect(o.hitTable).toHaveBeenCalledOnce();});
 it('inside to outside stays table ownership',()=>{const {o,hook,e}=setup();hook.down(e(200,400));hook.move(e(50,200));hook.finish(e(50,200));expect(o.down).toHaveBeenCalledOnce();expect(o.move).toHaveBeenCalledOnce();expect(o.up).toHaveBeenCalledOnce();expect(o.onHeight).not.toHaveBeenCalled();});
 it('second pointer cancels table ownership even if it targets another control',()=>{const {o,hook,e,captures}=setup();hook.down(e(200,400));const second=new Event('pointerdown');Object.assign(second,{pointerId:2});windowTarget.dispatchEvent(second);hook.down(e(50,400,2));hook.move(e(50,100,1));hook.finish(e(50,100,1));expect(o.cancel).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();expect(o.onHeight).not.toHaveBeenCalled();expect(captures.size).toBe(0);});
 for(const interruption of ['resize','blur'])it(`${interruption} abandons gesture without commit`,()=>{const {o,hook,e}=setup();hook.down(e(200,400));windowTarget.dispatchEvent(new Event(interruption));hook.finish(e(200,400));expect(o.cancel).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();});
 it('pointer cancel never calls up and fresh gesture works',()=>{const {o,hook,e}=setup();hook.down(e(200,400));hook.finish(e(200,400),true);hook.down(e(50,400,2));hook.move(e(50,100,2));hook.finish(e(50,100,2));expect(o.cancel).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();expect(o.onHeight).toHaveBeenCalledOnce();});
 it('same mouse pointer works after blur without receiving an old pointer-up',()=>{const {o,hook,e}=setup();hook.down(e(200,400));windowTarget.dispatchEvent(new Event('blur'));hook.down(e(50,400));hook.move(e(50,200));hook.finish(e(50,200));expect(o.cancel).toHaveBeenCalledOnce();expect(o.onHeight).toHaveBeenCalledOnce();});
 it('lost capture cancels and never commits',()=>{const {o,hook,e}=setup();hook.down(e(200,400));hook.finish(e(200,400),true);hook.finish(e(200,400));expect(o.cancel).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();});
 it('disabled while dragging abandons without pointer-up',()=>{const {o,hook,e}=setup();hook.down(e(200,400));o.enabled=false;hook.move(e(200,300));hook.finish(e(200,300));expect(o.cancel).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();});
 it('mode lifecycle cleanup cancels prior owner rather than routing it to new mode',()=>{const {o,hook,e}=setup();hook.down(e(200,400));const cleanup=harness.effects[harness.effects.length-1]();if(typeof cleanup==='function')cleanup();hook.move(e(200,300));hook.finish(e(200,300));expect(o.cancel).toHaveBeenCalledOnce();expect(o.move).not.toHaveBeenCalled();expect(o.up).not.toHaveBeenCalled();});
 it('ignores UI targets, safe edge and nonprimary mouse',()=>{const {o,hook,e}=setup();hook.down({...e(50,400),target:{tagName:'BUTTON'}});hook.down(e(5,400));hook.down({...e(50,400),pointerType:'mouse',button:2});hook.move(e(50,200));expect(o.hitTable).not.toHaveBeenCalled();expect(o.onHeight).not.toHaveBeenCalled();});
 it('horizontal-only and small motions leave height stable; clamps both endpoints',()=>{const gesture={id:1,owner:'height' as const,x:50,y:400,level:.4,travel:422,moved:false};expect(heightAfterSwipe(gesture,200,401)).toBe(.4);expect(heightAfterSwipe(gesture,50,395)).toBe(.4);expect(heightAfterSwipe(gesture,50,-1000)).toBe(1);expect(heightAfterSwipe(gesture,50,2000)).toBe(0);expect(stageSafePoint(380,400,{left:0,top:0,width:390,height:844})).toBe(false);});
});

describe('双指视角仲裁',()=>{
 it('收拢升高、张开放大，阈值抖动/异常值不改变高度',()=>{
  const g={distance:200,level:.4,moved:false};expect(heightAfterPinch(g,198)).toBe(.4);expect(heightAfterPinch(g,100)).toBe(1);expect(heightAfterPinch(g,400)).toBe(0);
  expect(heightAfterPinch(g,NaN)).toBe(.4);expect(heightAfterPinch({distance:0,level:.4,moved:false},100)).toBe(.4);
 });
 it('同台第二指晋升时回滚第一指，结束不能提交或遗留拖动',()=>{
  const {o,hook,e,captures}=setup();hook.down(e(140,400));hook.down(e(260,400,2));
  expect(o.pinchStart).toHaveBeenCalledOnce();expect(o.up).not.toHaveBeenCalled();
  hook.move(e(200,400,2));expect(o.onHeight).toHaveBeenLastCalledWith(1);
  hook.finish(e(200,400,2));hook.move(e(170,350));hook.finish(e(170,350));
  expect(o.move).not.toHaveBeenCalled();expect(o.up).not.toHaveBeenCalled();expect(captures.size).toBe(0);
 });
 it('纯双指平移不变高，任意抬手顺序均吞掉剩余触摸',()=>{
  for(const first of [1,2]){const {o,hook,e}=setup();hook.down(e(150,400));hook.down(e(250,400,2));hook.move(e(150,400));expect(o.onHeight).not.toHaveBeenCalled();hook.finish(e(150,400,first));hook.move(e(200,200,3-first));hook.finish(e(200,200,3-first));expect(o.up).not.toHaveBeenCalled();}
 });
 it('取消、第三指和失焦均不会把多指末尾转成瞄准',()=>{
  const {o,hook,e}=setup();hook.down(e(150,400));hook.down(e(250,400,2));hook.finish(e(250,400,2),true);hook.finish(e(150,400));expect(o.up).not.toHaveBeenCalled();
  windowTarget.dispatchEvent(new Event('blur'));hook.down(e(150,400,3));hook.down(e(250,400,4));hook.down(e(210,400,5));hook.finish(e(250,400,4));hook.finish(e(150,400,3));expect(o.up).not.toHaveBeenCalled();
 });
});

it('到达俯视端点后反向立即响应，没有越界死区',()=>{
 const {o,hook,e}=setup();hook.down(e(110,400));hook.down(e(310,400,2));hook.move(e(150,400,2));expect(o.onHeight).toHaveBeenLastCalledWith(1);
 hook.move(e(160,400,2));expect(o.onHeight.mock.calls[o.onHeight.mock.calls.length-1][0]).toBeLessThan(1);
});
it('排空期间落下的新手指也必须抬起，才能恢复单指',()=>{
 const {o,hook,e}=setup();hook.down(e(150,400));hook.down(e(250,400,2));hook.finish(e(150,400));
 const down=new Event('pointerdown');Object.assign(down,{pointerId:3});windowTarget.dispatchEvent(down);hook.down(e(180,400,3));
 const up=new Event('pointerup');Object.assign(up,{pointerId:2});windowTarget.dispatchEvent(up);hook.down(e(200,400,4));hook.finish(e(200,400,4));expect(o.up).not.toHaveBeenCalled();
});
