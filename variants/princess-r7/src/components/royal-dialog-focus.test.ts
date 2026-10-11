import {describe,it,expect,vi} from 'vitest';
import {containRoyalDialogTab} from './royal-dialog-focus';
describe('royal ending focus boundary',()=>{
 it('wraps forward/back and retains native navigation between controls',()=>{
  const first={focus:vi.fn()},last={focus:vi.fn()},preventDefault=vi.fn();
  const make=(target:object,shiftKey=false)=>({key:'Tab',shiftKey,target:target as EventTarget,currentTarget:{querySelectorAll:()=>[first,last] as unknown as NodeListOf<HTMLElement>},preventDefault});
  containRoyalDialogTab(make(last));expect(first.focus).toHaveBeenCalledTimes(1);
  containRoyalDialogTab(make(first,true));expect(last.focus).toHaveBeenCalledTimes(1);
  containRoyalDialogTab(make(first));expect(preventDefault).toHaveBeenCalledTimes(2);
 });
 it('keeps the single restart button focused when celebration ends',()=>{const only={focus:vi.fn()},preventDefault=vi.fn();containRoyalDialogTab({key:'Tab',shiftKey:false,target:only as unknown as EventTarget,currentTarget:{querySelectorAll:()=>[only] as unknown as NodeListOf<HTMLElement>},preventDefault});expect(only.focus).toHaveBeenCalled();expect(preventDefault).toHaveBeenCalled();});
});
