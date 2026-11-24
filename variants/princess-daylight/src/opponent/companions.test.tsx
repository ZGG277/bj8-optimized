import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPANIONS, STORYBOOK_ROSTER, companionFor, pickCompanion } from './companions';
import { COMPANION_CARD_ART } from './companion-card-art';
import { RoyalFinish } from '../components/RoyalFinish';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from '../match/match-machine';
import { renderMatchMessage } from '../utils/renderMatchMessage';
import { victoryNote } from '../minitool/share-note';

describe('companion identity across a match', () => {
 it('offers the twenty new and ten returning companions as distinct offline portraits', () => {
  expect(STORYBOOK_ROSTER).toHaveLength(20);
  expect(COMPANIONS).toHaveLength(30);
  expect(new Set(COMPANIONS.map(p=>p.name)).size).toBe(30);
  expect(new Set(COMPANIONS.map(p=>p.avatar)).size).toBe(30);
  expect(new Set(COMPANIONS.map(p=>COMPANION_CARD_ART[p.id].src)).size).toBe(30);
  for (const [index, friend] of COMPANIONS.entries()) {
   expect(friend.avatar).toBeTruthy();
   expect(pickCompanion(undefined, () => (index + .5) / COMPANIONS.length).id).toBe(friend.id);
   for (let i = 0; i < COMPANIONS.length - 1; i++) {
    expect(pickCompanion(friend.id, () => (i + .5) / (COMPANIONS.length - 1)).id).not.toBe(friend.id);
   }
  }
 });
 it('keeps identity through rule resolution and uses it in messages', () => {
  const p=COMPANIONS[3];
  const m=beginMatch({...createInitialMatchState(),companionId:p.id});
  const r=resolveStoppedShot(m,{shotId:1,firstContact:1,pocketed:[],cueScratch:false,cushionAfterFirstContact:true,remainingSolids:7,remainingStripes:7});
  expect(r.next.companionId).toBe(p.id);
  expect(renderMatchMessage({...r.next,messageKey:'ai-choice',messageParams:{target:9}})).toContain(p.name);
  expect(companionFor('unknown')).toBe(COMPANIONS[0]);
 });
 it('keeps real companion identity and the correct winner on both outcomes', () => {
  for(const p of COMPANIONS){
   const won=renderToStaticMarkup(<RoyalFinish winner="player" companionId={p.id} onRestart={()=>{}}/>);
   expect(won).toContain(p.avatar);expect(won).toContain(p.name);expect(won).toContain('你赢了');
   const lost=renderToStaticMarkup(<RoyalFinish winner="opponent" companionId={p.id} onRestart={()=>{}}/>);
   expect(lost).toContain(p.avatar);expect(lost).toContain(p.name + '胜');expect(lost).not.toContain('你赢了');
   expect(victoryNote('data:image/jpeg;base64,eA==','practice',p.name).content).toContain(p.name);
  }
 });
});
