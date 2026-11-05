import { describe, expect, it } from 'vitest';
import { beginMatch, createInitialMatchState, resolveStoppedShot } from './match-machine';
import { foulSentence, finishReason, turnDescription } from './presentation';
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
  it('names every actual foul in one sentence, including opponent free-ball placement', () => {
    const initial = beginMatch(createInitialMatchState());
    for (const [reason, text] of Object.entries({ scratch: '白球落袋', 'no-contact': '没有碰到目标球', 'wrong-first': '先碰到了不属于本杆的球', 'no-cushion': '碰球后没有进球或碰库' })) {
      const match = { ...initial, breaking: false, phase: 'placing' as const, messageKey: 'foul' as const, messageParams: { actor: 'opponent' as const, reason: reason as 'scratch' } };
      expect(foulSentence(match)).toContain(text);
      expect(turnDescription(match)).toContain('公主自由球');
      expect(foulSentence({ ...match, messageKey: 'place-occupied' })).toContain(text);
    }
    expect(foulSentence(initial)).toBeNull();
    expect(turnDescription({ ...initial, phase: 'placing' })).not.toContain('没有碰到');
  });

});
