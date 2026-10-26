import {afterEach,describe,it,expect,vi} from 'vitest';
import {startRoyalCelebration,ROYAL_CELEBRATION_MS} from './royal-celebration';
function motion(matches=false){return {matches,addEventListener:vi.fn(),removeEventListener:vi.fn()};}
afterEach(()=>vi.useRealTimers());
describe('finite royal celebration lifecycle',()=>{
 it('ends once after bounded duration and removes listeners',()=>{vi.useFakeTimers();const end=vi.fn(),pref=motion();startRoyalCelebration(end,pref);vi.advanceTimersByTime(ROYAL_CELEBRATION_MS);expect(end).toHaveBeenCalledTimes(1);expect(pref.removeEventListener).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);});
 it('skip/restart/unmount cancellation leaves no pending work or callbacks',()=>{vi.useFakeTimers();const end=vi.fn(),pref=motion(),run=startRoyalCelebration(end,pref);run.cancel();run.cancel();vi.runAllTimers();expect(end).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);});
 it('reduced motion does not start particles or timer',()=>{vi.useFakeTimers();const pref=motion(true),run=startRoyalCelebration(vi.fn(),pref);expect(run.active).toBe(false);expect(pref.addEventListener).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);});
 it('live motion change ends once and removes the timer',()=>{vi.useFakeTimers();const end=vi.fn(),pref=motion();startRoyalCelebration(end,pref);const change=pref.addEventListener.mock.calls[0][1] as ()=>void;change();change();expect(end).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);});
});
