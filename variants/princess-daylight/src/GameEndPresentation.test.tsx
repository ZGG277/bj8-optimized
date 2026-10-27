import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import type {MatchState} from './match/types';
let phase:MatchState['phase']='aiming';
vi.mock('./hooks/useGameState',async importOriginal=>{
 const actual=await importOriginal<typeof import('./hooks/useGameState')>();
 return {...actual,useGameState:()=>{const state=actual.useGameState();const match={...state.match,phase,winner:phase==='finished'?'player' as const:null};return {...state,match,matchRef:{current:match},canAim:phase==='aiming'};}};
});
import Game from './Game';
describe('actual Game ending composition',()=>{
 it('marks finished shell for control hiding and mounts royal result',()=>{phase='finished';const html=renderToStaticMarkup(<Game/>);expect(html).toMatch(/class="game-shell royal-game(?: follow-ab)?"/);expect(html).toContain('data-match-finished="true"');expect(html).toContain('公主赢了');expect(html).toContain('royal-finish');expect(html).not.toContain('training-summary');});
 it('restores normal shell presentation for a new aiming match',()=>{phase='aiming';const html=renderToStaticMarkup(<Game/>);expect(html).toMatch(/class="game-shell royal-game(?: follow-ab)?"/);expect(html).not.toContain('data-match-finished="true"');expect(html).not.toContain('royal-finish');expect(html).toContain('control-deck');});
});
