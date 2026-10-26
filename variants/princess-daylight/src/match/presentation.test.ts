import { describe, expect, it } from 'vitest';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from './match-machine';
import { finishReason, turnDescription } from './presentation';
describe('rule facts are explained to the player', () => {
  it('explains wrong-first-contact without labelling a rolling shot successful', () => {
    const initial={...beginMatch(createInitialMatchState()),breaking:false,playerGroup:'solid' as const};
    const foul=resolveStoppedShot(initial,{shotId:1,firstContact:9,pocketed:[],cueScratch:false,cushionAfterFirstContact:true,remainingSolids:7,remainingStripes:7}).next;
    expect(turnDescription(foul)).toContain('先碰到了不属于本杆的球');
    expect(turnDescription({...foul,phase:'rolling'})).toContain('先碰到了不属于本杆的球');
    expect(turnDescription(initial,true)).toContain('现在打8号');
    expect(turnDescription({...initial,phase:'rolling'})).not.toContain('好球');
  });
  it('distinguishes ball placement errors and the actual reason for losing on 8', () => {
    const initial=beginMatch(createInitialMatchState());
    expect(turnDescription({...initial,phase:'placing',messageKey:'place-occupied'})).toContain('这里有球');
    expect(finishReason({...initial,phase:'finished',messageKey:'lose-8-foul',messageParams:{actor:'opponent',reason:'scratch'}})).toBe('沈予白打进8号，但白球落袋。');
    expect(finishReason({...initial,phase:'finished',messageKey:'lose-8-early',messageParams:{actor:'player'}})).toContain('公主还没清空本组球');
  });
});
