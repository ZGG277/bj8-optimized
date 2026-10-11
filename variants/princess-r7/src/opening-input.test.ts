import {describe,it,expect,vi,afterEach} from 'vitest';
import {openingInputGate} from './opening-input';
afterEach(()=>vi.useRealTimers());
describe('opening skip input lifecycle',()=>{
 for(const events of [['pointerdown','pointerup','click'],['keydown','keydown','keyup','click'],['pointerdown','pointercancel']]) it(`consumes complete ${events.join('/')} without gameplay`,()=>{
  vi.useFakeTimers();const target=new EventTarget();let active=true;const finish=vi.fn(()=>active=false),game=vi.fn();
  const dispose=openingInputGate(target,()=>active,finish);
  for(const name of new Set(events))target.addEventListener(name,game);
  for(const name of events){const e=new Event(name,{cancelable:true});target.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);}
  expect(game).not.toHaveBeenCalled();expect(active).toBe(false);
  vi.runAllTimers();target.dispatchEvent(new Event(events[0],{cancelable:true}));expect(game).toHaveBeenCalledTimes(1);
  dispose();expect(vi.getTimerCount()).toBe(0);
 });
 it('suppresses delayed synthetic click but permits the next deliberate tap',()=>{
  vi.useFakeTimers();const target=new EventTarget();let active=true;const game=vi.fn(),dispose=openingInputGate(target,()=>active,()=>active=false);target.addEventListener('click',game);
  target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event('pointerup'));vi.advanceTimersByTime(350);target.dispatchEvent(new Event('click'));expect(game).not.toHaveBeenCalled();
  target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event('pointerup'));target.dispatchEvent(new Event('click'));expect(game).toHaveBeenCalledOnce();dispose();
 });
 for(const interruption of ['visibilitychange','blur'])it(`clears missing release on ${interruption}`,()=>{
  vi.useFakeTimers();const target=new EventTarget();let active=true;const game=vi.fn(),dispose=openingInputGate(target,()=>active,()=>active=false);target.addEventListener('pointerdown',game);
  target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event(interruption));target.dispatchEvent(new Event('pointerdown'));expect(game).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);dispose();
 });
 it('cleans listeners and pending release timer without leaks across remounts',()=>{
  vi.useFakeTimers();const target=new EventTarget(),finish=vi.fn();
  for(let i=0;i<5;i++){const dispose=openingInputGate(target,()=>true,finish);target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event('pointerup'));dispose();}
  const count=finish.mock.calls.length;target.dispatchEvent(new Event('keydown'));expect(finish).toHaveBeenCalledTimes(count);expect(vi.getTimerCount()).toBe(0);
 });
 it('consumes accessibility-generated click during opening then permits next click',()=>{
  const target=new EventTarget();let active=true;const game=vi.fn();const dispose=openingInputGate(target,()=>active,()=>active=false);target.addEventListener('click',game);
  target.dispatchEvent(new Event('click'));expect(game).not.toHaveBeenCalled();target.dispatchEvent(new Event('click'));expect(game).toHaveBeenCalledOnce();dispose();
 });
});
