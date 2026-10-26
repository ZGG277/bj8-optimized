import { describe, it, expect } from 'vitest';
import { followFeelSpin } from './follow-feel';
describe('explicit cue-input comparison', () => {
  it('defaults to exact current semantics', () => {
    for (const x of [-1,-.4,0,.1,.8]) for (const y of [-.4,0,.4]) expect(followFeelSpin({x,y},'current')).toEqual({x,y});
  });
  it('has a bounded center-only bias and never edits sidespin', () => {
    expect(followFeelSpin({x:0,y:0},'light-follow')).toEqual({x:.03,y:0});
    for(let x=-1;x<=1;x+=.025)for(let y=-1;y<=1;y+=.025){
      const v=followFeelSpin({x,y},'light-follow');
      expect(v.y).toBe(y); expect(v.x-x).toBeGreaterThanOrEqual(0);expect(v.x-x).toBeLessThanOrEqual(.03000001);
      if(Math.hypot(x,y)>=.25)expect(v.x).toBe(x);
    }
  });
  it('is smooth at the boundary and monotonic along the vertical axis',()=>{
    let last=-Infinity; for(let x=-1;x<=1;x+=.001){const v=followFeelSpin({x,y:0},'light-follow');expect(v.x).toBeGreaterThan(last);last=v.x;}
  });
});

import { createInitialWorld, cloneWorld, strikeCueBall } from '../physics';
it('shares calibration and preserves it in planner/world clones without double application',()=>{
 const world=createInitialWorld();world.followFeel='light-follow';const clone=cloneWorld(world);
 expect(clone.followFeel).toBe('light-follow');
 strikeCueBall(world,.4,12,{x:0,y:0});strikeCueBall(clone,.4,12,{x:0,y:0});expect(clone).toEqual(world);
 const explicit=createInitialWorld();strikeCueBall(explicit,.4,12,{x:.03,y:0});expect(world.balls).toEqual(explicit.balls);
});
