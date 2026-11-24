import {describe,it,expect,vi} from 'vitest';
import {containRoyalDialogTab} from './royal-dialog-focus';
describe('royal ending focus boundary',()=>{
 it('wraps forward/back and retains native navigation between controls',()=>{
  const first={focus:vi.fn(),closest:()=>null},last={focus:vi.fn(),closest:()=>null},preventDefault=vi.fn();
  const make=(target:object,shiftKey=false)=>({key:'Tab',shiftKey,target:target as EventTarget,currentTarget:{querySelectorAll:()=>[first,last] as unknown as NodeListOf<HTMLElement>},preventDefault});
  containRoyalDialogTab(make(last));expect(first.focus).toHaveBeenCalledTimes(1);
  containRoyalDialogTab(make(first,true));expect(last.focus).toHaveBeenCalledTimes(1);
  containRoyalDialogTab(make(first));expect(preventDefault).toHaveBeenCalledTimes(2);
 });
 it('keeps the single restart button focused when celebration ends',()=>{const only={focus:vi.fn(),closest:()=>null},preventDefault=vi.fn();containRoyalDialogTab({key:'Tab',shiftKey:false,target:only as unknown as EventTarget,currentTarget:{querySelectorAll:()=>[only] as unknown as NodeListOf<HTMLElement>},preventDefault});expect(only.focus).toHaveBeenCalled();expect(preventDefault).toHaveBeenCalled();});
 it('skips undisclosed controls while keeping the disclosure summary in the tab loop', () => {
  const first = { focus: vi.fn(), closest: () => null };
  const details: { firstElementChild?: object } = {};
  const summary = { focus: vi.fn(), closest: () => details };
  const hidden = { focus: vi.fn(), closest: () => details };
  details.firstElementChild = summary;
  const preventDefault = vi.fn();
  const currentTarget = { querySelectorAll: () => [first, summary, hidden] as unknown as NodeListOf<HTMLElement> };
  containRoyalDialogTab({ key: 'Tab', shiftKey: true, target: first as unknown as EventTarget, currentTarget, preventDefault });
  expect(summary.focus).toHaveBeenCalledOnce();
  expect(hidden.focus).not.toHaveBeenCalled();
 });
});
