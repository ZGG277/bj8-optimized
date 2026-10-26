import { describe, expect, it } from 'vitest';
import { assessCompletedMatch, createPlayerSkillProfile, loadPlayerSkillProfile, savePlayerSkillProfile } from './model';
import { createFriendlyOpponentProfile, friendlyTurnTactics } from './friendly-style';
import { positionAfterPot } from './position-observation';
import { createInitialWorld } from '../physics';

describe('princess-favored adaptation',()=>{
 it('evaluates accuracy and position on completed matches while tracking outcomes separately',()=>{
  const start=createPlayerSkillProfile();
  const shots=[{tolerance:.01,pocketed:true,foul:false,position:'success' as const,assisted:false}];
  const win=assessCompletedMatch(start,shots,true),loss=assessCompletedMatch(start,shots,false);
  expect(win.level).toBe(loss.level);expect(win.executionLevel).toBe(loss.executionLevel);
  expect(win.positionAttempts).toBe(1);expect(win.positionSuccesses).toBe(1);
  expect(win.matchesEvaluated).toBe(1);expect(win.recentResults).toEqual([true]);expect(loss.recentResults).toEqual([false]);
  expect(start.totalPlayerShots).toBe(0);
 });
 it('relaxes after losses, remains below the player and disables defensive play at every level',()=>{
  for(const mode of ['practice','challenge'] as const)for(const level of [0,25,50,75,100]){
   const p={...createPlayerSkillProfile(),level,executionLevel:level,confidence:1,totalPlayerShots:30};
   const normal=createFriendlyOpponentProfile(p,mode);
   const relieved=createFriendlyOpponentProfile({...p,recentResults:[false,false]},mode);
   expect(normal.effectiveLevel).toBeLessThanOrEqual(level);
   expect(relieved.effectiveLevel).toBeLessThanOrEqual(normal.effectiveLevel);
   expect(relieved.tactical.opportunityChance!).toBeGreaterThan(normal.tactical.opportunityChance!);
   expect(normal.tactical.allowSafety).toBe(false);expect(normal.tactical.followUpWeight).toBe(0);
   const turn=friendlyTurnTactics(normal,5,1,2);
   expect(turn.opportunityChance).toBeGreaterThan(normal.tactical.opportunityChance!);
   expect(turn.opportunityChance).toBeLessThan(1);expect(turn.allowSafety).toBe(false);
   expect(normal.tactical.opportunityChance).not.toBe(turn.opportunityChance);
  }
 });
 it('persists bounded outcomes without erasing old skill data and counts no-shot endings',()=>{
  let p=createPlayerSkillProfile();for(let i=0;i<10;i++)p=assessCompletedMatch(p,[],i%2===0);
  expect(p.matchesEvaluated).toBe(10);expect(p.totalPlayerShots).toBe(0);expect(p.recentResults).toHaveLength(6);
  const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  savePlayerSkillProfile(p,storage);expect(loadPlayerSkillProfile(storage)).toEqual(p);
 });
 it('evaluates ordinary position without requiring the planning helper',()=>{
  const w=createInitialWorld();for(const b of w.balls){b.active=[0,1].includes(b.number);if(b.number===0){b.x=.2;b.z=0;}if(b.number===1){b.x=.5;b.z=0;}}
  expect(positionAfterPot(w,[1])).toBe('success');expect(positionAfterPot(w,[])).toBe('unknown');
  w.balls.find(b=>b.number===0)!.active=false;expect(positionAfterPot(w,[1])).toBe('miss');
 });
});
