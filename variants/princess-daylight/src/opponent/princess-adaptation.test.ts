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
 it('relaxes after losses, remains below the player and disables defensive play at every level',()=>{
  for(const mode of ['practice','challenge'] as const)for(const level of [0,25,50,75,100]){
   const p={...createPlayerSkillProfile(),level,executionLevel:level,confidence:1,totalPlayerShots:30};
   const normal=createFriendlyOpponentProfile(p,mode);
   const relieved=createFriendlyOpponentProfile({...p,recentResults:[false,false]},mode);
   expect(normal.effectiveLevel).toBeLessThanOrEqual(level);
   expect(relieved.effectiveLevel).toBeLessThanOrEqual(normal.effectiveLevel);
   expect(relieved.tactical.opportunityChance!).toBeGreaterThan(normal.tactical.opportunityChance!);
   expect(normal.tactical.allowSafety).toBe(false);
   const turn=friendlyTurnTactics(normal,5,1,2,0);
   expect(turn.opportunityChance).toBeGreaterThan(normal.tactical.opportunityChance!);
   expect(turn.opportunityChance).toBeLessThan(1);expect(turn.allowSafety).toBe(false);
   expect(normal.tactical.opportunityChance).not.toBe(turn.opportunityChance);
  }
 });
 it('uses both recent dimensions even when the outcome and long-term level match',()=>{
  const player={...createPlayerSkillProfile(),level:40,confidence:.6};
  const assessment={accuracyAttempts:6,accuracySuccesses:3,routeAttempts:5,routeSuccesses:3};
  const profile=(accuracySuccesses:number,routeSuccesses:number)=>createFriendlyOpponentProfile({
   ...player,recentAssessments:[{...assessment,accuracySuccesses,routeSuccesses}],recentResults:[true],
  },'practice');
  const baseline=profile(3,3), precise=profile(6,3), planned=profile(3,5);
  for(const improved of [precise,planned]){
   expect(improved.effectiveLevel).toBeGreaterThan(baseline.effectiveLevel);
   expect(improved.tactical.opportunityChance!).toBeLessThan(baseline.tactical.opportunityChance!);
   expect(improved.tactical.followUpWeight).toBeGreaterThan(baseline.tactical.followUpWeight);
  }
  const start=createFriendlyOpponentProfile(createPlayerSkillProfile(),'practice');
  const result=assessCompletedMatch(createPlayerSkillProfile(),Array.from({length:6},()=>({
   tolerance:.009,pocketed:true,foul:false,position:'success' as const,assisted:false,
  })),true);
  expect(createFriendlyOpponentProfile(result,'practice').effectiveLevel).toBeGreaterThan(start.effectiveLevel+4);
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
