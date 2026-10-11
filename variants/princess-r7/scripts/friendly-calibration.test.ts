import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createOpponentProfile, createPlayerSkillProfile, sampleOpponentAimOffset, type OpponentProfile } from '../src/opponent/model';
import { sampleOpponentExecution } from '../src/opponent/execution';
import { createFriendlyOpponentProfile } from '../src/opponent/friendly-style';
import { chooseTacticalShot, planAggressiveFallback, planClearContactFallback } from '../src/opponent/tactical-shot';
import { chooseTacticalShot as chooseBaseline } from './fixtures/friendly-baseline/src/opponent/tactical-shot';
import { cloneWorld, createInitialWorld, getCueBall, planSimpleShot, respotCueBall, simulateUntilStop, strikeCueBall, type BilliardsWorld } from '../src/physics';
import { factsFromWorld } from '../src/match/shot-facts';
import { legalNumbers, createInitialMatchState, resolveStoppedShot } from '../src/match/match-machine';
import { generateCandidates } from '../src/planner/candidates';
function seeded(seed:number){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function fixture(i:number){const w=createInitialWorld();const p=[[0,-.25,.65],[1,.22,.2],[2,-.34,-.7],[9,.42,-.25],[10,-.35,.15],[8,.1,-.95]];for(const b of w.balls){const q=p.find(p=>p[0]===b.number);b.active=!!q;if(q){b.x=q[1]+Math.sin(i+b.number)*.055;b.z=q[2]+Math.cos(i+b.number)*.055;}}return w;}
const player={...createPlayerSkillProfile(),level:45,confidence:1,totalPlayerShots:30};
const profiles={baseline:createOpponentProfile(player,'practice'),practice:createFriendlyOpponentProfile(player,'practice'),challenge:createFriendlyOpponentProfile(player,'challenge')};
function execute(w:BilliardsWorld,legal:number[],other:number[],p:OpponentProfile,rng:()=>number,baseline=false){
 const result=(baseline?chooseBaseline:chooseTacticalShot)(w,legal,{...p.tactical,playerLegal:other},rng);
 const shot=result.shot;const fallback=shot?null:planSimpleShot(w,legal,p.effectiveLevel);const aggressive=shot||fallback?null:(!baseline?planClearContactFallback(w,legal):null)??planAggressiveFallback(w,legal);
 const cue=getCueBall(w)!;const target=w.balls.find(b=>b.active&&legal.includes(b.number));
 const angle=shot?.angle??fallback?.angle??aggressive?.angle??(target?Math.atan2(target.x-cue.x,-(target.z-cue.z)):0);
 const power=shot?.power??fallback?.power??aggressive?.power??52;
 const execution=shot&&!baseline?sampleOpponentExecution(shot,p,rng):{angle:angle+(shot?sampleOpponentAimOffset(p.aimSigma,shot.tolerance,rng,p.aimWindowFraction):0),power:Math.max(1,Math.min(100,power*(1+(rng()*2-1)*p.powerJitter)))};
 strikeCueBall(w,execution.angle,execution.power,shot?.spin??{x:0,y:0});simulateUntilStop(w);return {facts:factsFromWorld(w),simulations:result.simulations,fallback:!shot,opportunity:shot?.friendlyOpportunity===true};
}
it('seeded source calibration: real-physics shots and bounded short matches',()=>{
 const originalRandom=Math.random;const shots:any[]=[];const matches:any[]=[];
 try{
 for(const [style,p] of Object.entries(profiles)){
  let pots=0,fouls=0,opportunities=0,simulations=0,fallbacks=0,fallbackFouls=0,intendedOpportunities=0,opportunityFouls=0;const count=24;
  for(let i=0;i<count;i++){const rng=seeded(900+i);Math.random=rng;const w=fixture(i%6);const r=execute(w,[9,10],[1,2],p,rng,style==='baseline');const f=r.facts;simulations+=r.simulations;
   const foul=f.cueScratch||f.firstContact===null||![9,10].includes(f.firstContact)||(!f.pocketed.length&&!f.cushionAfterFirstContact);if(r.fallback)fallbacks++;if(r.opportunity)intendedOpportunities++;if(foul){fouls++;if(r.fallback)fallbackFouls++;if(r.opportunity)opportunityFouls++;}else if(f.pocketed.some(n=>[9,10].includes(n)))pots++;else if(generateCandidates(w,[1,2]).length)opportunities++;
  }shots.push({style,count,pots,fouls,playableTurnovers:opportunities,simulations,fallbacks,fallbackFouls,intendedOpportunities,opportunityFouls});
  for(let seed=1;seed<=2;seed++){
   const rng=seeded(700+seed);Math.random=rng;const w=fixture(seed);let state={...createInitialMatchState(),phase:'opponent' as const,actor:'opponent' as const,breaking:false,playerGroup:'solid' as const};let turns=0,opponentShots=0,opponentFouls=0,run=0,maxRun=0;
   while(!state.winner&&turns<60){const actor=state.actor;const legal=legalNumbers(w,actor,state.playerGroup);const other=legalNumbers(w,actor==='player'?'opponent':'player',state.playerGroup);const profile=actor==='opponent'?p:profiles.baseline;const result=execute(w,legal,other,profile,rng,actor==='player'||style==='baseline');const resolution=resolveStoppedShot(state,result.facts);if(actor==='opponent'){opponentShots++;run++;maxRun=Math.max(maxRun,run);if(resolution.next.messageKey==='foul')opponentFouls++;}else run=0;
   state=resolution.next as typeof state;for(const effect of resolution.effects)if(effect.type==='auto-respot-cue'||effect.type==='request-player-placement')respotCueBall(w);turns++;
   }matches.push({style,seed,winner:state.winner,turns,opponentShots,opponentFouls,maxOpponentRun:maxRun,truncated:!state.winner});
  }
 }
 }finally{Math.random=originalRandom;}
 const evidence={description:'Seeded synthetic two-ball-per-group midgames; player is a fixed 48-level bot. Same physical engine, 60-shot cap. This is not a human win-rate or fun estimate.',shots,matches};mkdirSync('verification/friendly',{recursive:true});writeFileSync('verification/friendly/calibration.json',JSON.stringify(evidence,null,2));console.log('FRIENDLY_CALIBRATION',JSON.stringify(evidence));expect(shots.length).toBe(3);
},180000);
