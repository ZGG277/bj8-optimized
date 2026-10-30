import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPANIONS, companionFor, pickCompanion } from './companions';
import { COMPANION_CARD_ART } from './companion-card-art';
import { RoyalFinish } from '../components/RoyalFinish';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import { renderMatchMessage } from '../utils/renderMatchMessage';
import { VICTORY_PRAISES } from './victory-praise';
import { victoryNote } from '../minitool/share-note';

describe('companion identity across a match', () => {
 it('offers exactly ten distinct offline portraits and names, all reachable', () => {
  expect(COMPANIONS).toHaveLength(10);
  expect(new Set(COMPANIONS.map(p=>p.name)).size).toBe(10);
  expect(new Set(COMPANIONS.map(p=>p.avatar)).size).toBe(10);
  for(let i=0;i<10;i++)expect(pickCompanion(undefined,()=>i/10).id).toBe(COMPANIONS[i].id);
  for(const p of COMPANIONS)for(let i=0;i<9;i++)expect(pickCompanion(p.id,()=>i/9).id).not.toBe(p.id);
 });
 it('keeps identity through rule resolution and uses it in messages', () => {
  const p=COMPANIONS[3];
  const m=beginMatch({...createInitialMatchState(),companionId:p.id});
  const r=resolveStoppedShot(m,{shotId:1,firstContact:1,pocketed:[],cueScratch:false,cushionAfterFirstContact:true,remainingSolids:7,remainingStripes:7});
  expect(r.next.companionId).toBe(p.id);
  expect(renderMatchMessage({...r.next,messageKey:'ai-choice',messageParams:{target:9}})).toContain(p.name);
  expect(companionFor('unknown')).toBe(COMPANIONS[0]);
 });
 it('keeps companion identity, uses victory expression after a win and normal portrait after a loss', () => {
  for(const p of COMPANIONS){
   const won=renderToStaticMarkup(<RoyalFinish winner="player" companionId={p.id} onRestart={()=>{}}/>);
   expect(won).toContain(COMPANION_CARD_ART[p.id].src);expect(won).toContain(p.name);expect(won).toContain(VICTORY_PRAISES[0]);expect(won).not.toContain(p.congratulations);
   const lost=renderToStaticMarkup(<RoyalFinish winner="opponent" companionId={p.id} onRestart={()=>{}}/>);
   expect(lost).toContain(p.avatar);expect(lost).toContain('这一局惜败');expect(lost).not.toContain(p.congratulations);
   expect(victoryNote('data:image/jpeg;base64,eA==','practice',p.name).content).toContain(p.name);
  }
 });
});
