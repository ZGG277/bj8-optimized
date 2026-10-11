import { describe, expect, it } from 'vitest';
import { createFriendlyOpponentProfile } from './friendly-style';
import { createPlayerSkillProfile, sampleOpponentAimOffset } from './model';
import { sampleOpponentExecution } from './execution';
import { chooseTacticalShot, planClearContactFallback } from './tactical-shot';
import { cloneWorld, createInitialWorld, simulateUntilStop, strikeCueBall } from '../physics';
import { factsFromWorld } from '../match/shot-facts';
import { generateCandidates } from '../planner/candidates';

export function seeded(seed: number) { return () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function fixture(index = 0) {
 const world = createInitialWorld();
 const locations = [[0,-.25,.65],[1,.22,.2],[2,-.34,-.7],[9,.42,-.25],[10,-.35,.15],[8,.1,-.95]];
 for(const ball of world.balls) { const p=locations.find(p=>p[0]===ball.number); ball.active=!!p; if(p) { ball.x=p[1]+Math.sin(index+ball.number)*.055; ball.z=p[2]+Math.cos(index+ball.number)*.055; } }
 return world;
}
describe('fixed friendly style', () => {
 it('caps skill, keeps finite errors and locks a profile without mutating player storage', () => {
  const player={...createPlayerSkillProfile(),level:100,confidence:1,totalPlayerShots:30}; const before=JSON.stringify(player);
  expect(createFriendlyOpponentProfile(player,'practice').effectiveLevel).toBe(48);
  expect(createFriendlyOpponentProfile(player,'challenge').effectiveLevel).toBe(62);
  expect(JSON.stringify(player)).toBe(before);
  for(const mode of ['practice','challenge'] as const) {
   const p=createFriendlyOpponentProfile(player,mode);const rng=seeded(712);let misses=0;
   for(let i=0;i<1000;i++) if(Math.abs(sampleOpponentAimOffset(p.aimSigma,.01,rng,p.aimWindowFraction))>.01)misses++;
   expect(misses).toBeGreaterThanOrEqual(10);expect(misses).toBeLessThan(700);
  }
 });
 it('uses the same real physics for legal opportunities and leaves geometric player chances', () => {
  const profile=createFriendlyOpponentProfile(createPlayerSkillProfile(),'practice'); let opportunities=0,pots=0;
  for(let i=0;i<12;i++) {
   const world=fixture(i);const before=JSON.stringify(world);
   const result=chooseTacticalShot(world,[9,10],{...profile.tactical,opportunityChance:1,playerLegal:[1,2]},seeded(i+1));
   expect(result.simulations).toBeLessThanOrEqual(profile.tactical.simulationLimit);expect(JSON.stringify(world)).toBe(before);
   if(!result.shot)continue;
   const end=cloneWorld(world);strikeCueBall(end,result.shot.angle,result.shot.power,result.shot.spin);simulateUntilStop(end);
   const facts=factsFromWorld(end);expect(facts.cueScratch).toBe(false);expect([9,10]).toContain(facts.firstContact);expect(facts.pocketed).not.toContain(8);
   if(!facts.pocketed.length) { opportunities++;expect(facts.cushionAfterFirstContact).toBe(true);expect(generateCandidates(end,[1,2]).length).toBeGreaterThan(0); } else pots++;
  }
  console.log('FRIENDLY_IDEAL_FIXTURES',JSON.stringify({opportunities,pots}));expect(opportunities).toBeGreaterThan(0);
 },60000);

 it('bounded opportunity execution remains a real legal playable turnover on seeded fixtures', () => {
  const p=createFriendlyOpponentProfile(createPlayerSkillProfile(),'practice'); let attempted=0,legal=0,playable=0;
  for(let i=0;i<8;i++) {
   const world=fixture(i);const result=chooseTacticalShot(world,[9,10],{...p.tactical,opportunityChance:1,playerLegal:[1,2]},seeded(i+12));
   if(!result.shot?.friendlyOpportunity)continue;
   for(let j=0;j<4;j++) {
    attempted++;const execution=sampleOpponentExecution(result.shot,p,seeded(120+i*4+j));const end=cloneWorld(world);strikeCueBall(end,execution.angle,execution.power,result.shot.spin);simulateUntilStop(end);const f=factsFromWorld(end);
    if(!f.cueScratch&&f.firstContact!==null&&[9,10].includes(f.firstContact)&&f.cushionAfterFirstContact&&!f.pocketed.length){legal++;if(generateCandidates(end,[1,2]).some(c=>c.tolerance>=.009&&c.cutAngle<=.9&&c.cueDistance+c.pocketDistance<=2.6))playable++;}
   }
  }
  console.log('FRIENDLY_NOISY_OPPORTUNITIES',JSON.stringify({attempted,legal,playable}));expect(attempted).toBeGreaterThan(0);expect(legal/attempted).toBeGreaterThanOrEqual(.9);expect(playable/attempted).toBeGreaterThanOrEqual(.8);
 },60000);
 it('fallback avoids a known wrong-first blocker when another legal ball is visible', () => {
  const w=fixture();for(const b of w.balls){b.active=[0,1,9,10].includes(b.number);if(b.number===0){b.x=0;b.z=.7;}if(b.number===1){b.x=0;b.z=.25;}if(b.number===9){b.x=0;b.z=-.3;}if(b.number===10){b.x=.4;b.z=.5;}}
  expect(planClearContactFallback(w,[9,10])?.target).toBe(10);
  expect(planClearContactFallback(w,[9])).toBeNull();
 });
 it('can legally finish the black ball instead of forcing a user win', () => {
  const world=createInitialWorld();for(const b of world.balls){b.active=b.number===0||b.number===8;if(b.number===0){b.x=.2;b.z=0;}if(b.number===8){b.x=.5;b.z=0;}}
  const p=createFriendlyOpponentProfile(createPlayerSkillProfile(),'challenge');
  const result=chooseTacticalShot(world,[8],{...p.tactical,opportunityChance:0,playerLegal:[8]},seeded(90));expect(result.shot).not.toBeNull();
  const end=cloneWorld(world);strikeCueBall(end,result.shot!.angle,result.shot!.power,result.shot!.spin);simulateUntilStop(end);const facts=factsFromWorld(end);expect(facts.pocketed).toContain(8);expect(facts.firstContact).toBe(8);expect(facts.cueScratch).toBe(false);
 });
});
