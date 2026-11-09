import { describe, expect, it } from 'vitest';
import { assessCompletedMatch, createPlayerSkillProfile, loadPlayerSkillProfile, savePlayerSkillProfile } from './model';
import { createFriendlyOpponentProfile, friendlyTurnTactics } from './friendly-style';
import { observePlayerShot, positionAfterPot } from './position-observation';
import { createInitialWorld } from '../physics';
import { createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import { generateCandidates } from '../planner/candidates';

describe('princess-favored adaptation',()=>{
 it('evaluates accuracy and position on completed matches while tracking outcomes separately',()=>{
  const start=createPlayerSkillProfile();
  const shots=[{tolerance:.01,pocketed:true,foul:false,position:'success' as const,assisted:false}];
  const win=assessCompletedMatch(start,shots,true),loss=assessCompletedMatch(start,shots,false);
  expect(win.level).toBe(loss.level);expect(win.executionLevel).toBe(loss.executionLevel);
  expect(win.positionAttempts).toBe(1);expect(win.positionSuccesses).toBe(1);
  expect(win.matchesEvaluated).toBe(1);expect(win.recentResults).toEqual([true]);expect(loss.recentResults).toEqual([false]);
  expect(win.recentAssessments).toEqual([{accuracyAttempts:1,accuracySuccesses:1,routeAttempts:1,routeSuccesses:1}]);
  expect(start.totalPlayerShots).toBe(0);
 });
 it('locks in stronger opposition without making a loss an input to skill',()=>{
  for(const mode of ['practice','challenge'] as const)for(const level of [0,25,50,75,100]){
   const p={...createPlayerSkillProfile(),level,executionLevel:level,confidence:1,totalPlayerShots:30};
   const normal=createFriendlyOpponentProfile(p,mode);
   expect(normal.effectiveLevel).toBe(Math.min(100,level+(mode==='practice'?8:12)));
   expect(createFriendlyOpponentProfile({...p,recentResults:[false,false]},mode)).toEqual(normal);
   expect(normal.tactical.allowSafety).toBe(false);
   const turn=friendlyTurnTactics(normal,5,1,2,0);
   expect(turn.opportunityChance).toBeGreaterThan(normal.tactical.opportunityChance!);
   expect(turn.opportunityChance).toBeLessThan(1);
  }
 });
 it('responds to sustained precision and route planning and resists a single bad rack',()=>{
  const player={...createPlayerSkillProfile(),level:40,confidence:.6};
  const profile=(successes:number,positionSuccesses:number)=>createFriendlyOpponentProfile({
   ...player,accuracyTotals:{attempts:80,successes},positionAttempts:40,positionSuccesses,
  },'practice');
  const baseline=profile(40,20), precise=profile(60,20), planned=profile(40,32);
  for(const improved of [precise,planned]){
   expect(improved.effectiveLevel).toBeGreaterThan(baseline.effectiveLevel);
   expect(improved.tactical.opportunityChance!).toBeLessThan(baseline.tactical.opportunityChance!);
   expect(improved.tactical.followUpWeight).toBeGreaterThan(baseline.tactical.followUpWeight);
  }

  const hits=Array.from({length:8},()=>({tolerance:.009,pocketed:true,foul:false,position:'success' as const,assisted:false}));
  const misses=hits.map(shot=>({...shot,pocketed:false,position:'unknown' as const}));
  let history=createPlayerSkillProfile();
  for(let rack=0;rack<12;rack++)history=assessCompletedMatch(history,hits,true);
  const cold=createFriendlyOpponentProfile(createPlayerSkillProfile(),'practice');
  const established=createFriendlyOpponentProfile(history,'practice');
  expect(established.effectiveLevel).toBeGreaterThan(cold.effectiveLevel+5);
  expect(history.accuracyTotals).toEqual({attempts:96,successes:96});
  expect(history.positionAttempts).toBe(96);
  const offDay=assessCompletedMatch(history,misses,false);
  const next=createFriendlyOpponentProfile(offDay,'practice');
  expect(Math.abs(next.effectiveLevel-established.effectiveLevel)).toBeLessThan(2);
  expect(offDay.accuracyTotals).toEqual({attempts:104,successes:96});
 });
 it('seeds the lifetime total from only the verified racks in an older save',()=>{
  const old={...createPlayerSkillProfile(),qualifiedShots:90,positionAttempts:30,positionSuccesses:19,
   recentAssessments:[{accuracyAttempts:7,accuracySuccesses:3,routeAttempts:4,routeSuccesses:2}]};
  const storage={getItem:()=>JSON.stringify(old)};
  const next=assessCompletedMatch(loadPlayerSkillProfile(storage),[
   {tolerance:.009,pocketed:true,foul:false,position:'success',assisted:false},
  ],true);
  expect(next.accuracyTotals).toEqual({attempts:8,successes:4});
  expect(next.qualifiedShots).toBe(91);
  expect(next.positionAttempts).toBe(31);
  expect(next.positionSuccesses).toBe(20);
 });
 it('requires a normal shot after three deliberate give-backs even while ahead',()=>{
  const profile=createFriendlyOpponentProfile(createPlayerSkillProfile(),'practice');
  expect(friendlyTurnTactics(profile,6,1,2,2).opportunityChance).toBeGreaterThan(0);
  const next=friendlyTurnTactics(profile,6,1,2,3);
  expect(next).toMatchObject({opportunityChance:0,alternativeChance:0,allowSafety:false});
  expect(friendlyTurnTactics(profile,6,1,0,0).opportunityChance).toBeGreaterThan(0);
 });
 it('persists bounded outcomes without erasing old skill data and counts no-shot endings',()=>{
  let p=createPlayerSkillProfile();for(let i=0;i<10;i++)p=assessCompletedMatch(p,[],i%2===0);
  expect(p.matchesEvaluated).toBe(10);expect(p.totalPlayerShots).toBe(0);expect(p.recentResults).toHaveLength(6);
  expect(p.recentAssessments).toHaveLength(6);
  expect(p.recentAssessments?.[0]).toMatchObject({accuracyAttempts:0,routeAttempts:0});
  const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  savePlayerSkillProfile(p,storage);expect(loadPlayerSkillProfile(storage)).toEqual(p);
 });
 it('evaluates ordinary position without requiring the planning helper',()=>{
  const w=createInitialWorld();for(const b of w.balls){b.active=[0,1].includes(b.number);if(b.number===0){b.x=.2;b.z=0;}if(b.number===1){b.x=.5;b.z=0;}}
  expect(positionAfterPot(w,[1])).toBe('success');expect(positionAfterPot(w,[])).toBe('unknown');
  w.balls.find(b=>b.number===0)!.active=false;expect(positionAfterPot(w,[1])).toBe('miss');
 });
 it('records a near miss and evaluates the next playable route even on an unplanned legal pot',()=>{
  const w=createInitialWorld();
  for(const b of w.balls){
   b.active=[0,1,2].includes(b.number);
   if(b.number===0){b.x=.2;b.z=0;}
   if(b.number===1){b.x=.5;b.z=0;}
   if(b.number===2){b.x=.46;b.z=1.06;}
  }
  const angle=generateCandidates(w,[1]).find(shot=>shot.pocketDistance<.3)!.angle;
  const before={...createInitialMatchState(),phase:'rolling' as const,breaking:false,playerGroup:'solid' as const};
  const capture={worldBefore:w,angle:angle+.08,power:40,spin:{x:0,y:0},planned:null,intent:null,breaking:false,assisted:false};
  const miss={shotId:1,firstContact:1,pocketed:[],cueScratch:false,cushionAfterFirstContact:true,remainingSolids:2,remainingStripes:0};
  const observed=observePlayerShot(capture,w,before,miss,resolveStoppedShot(before,miss).next);
  expect(observed.tolerance).toBeGreaterThan(0);
  expect(observed).toMatchObject({pocketed:false,position:'unknown'});
  const pot={...miss,pocketed:[1],remainingSolids:1};
  const after={...w,balls:w.balls.map(b=>({...b,active:b.active&&b.number!==1}))};
  const route=observePlayerShot(capture,after,before,pot,resolveStoppedShot(before,pot).next);
  expect(route.position).toBe(positionAfterPot(after,[2]));
  expect(route.position).not.toBe('unknown');
  expect(observePlayerShot({...capture,breaking:true},after,before,pot,resolveStoppedShot(before,pot).next)).toMatchObject({
   tolerance:null,position:'unknown',
  });
 });
});
