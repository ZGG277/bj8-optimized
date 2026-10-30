import { describe, expect, it } from 'vitest';
import type { MatchState, RoundResolution, ShotFacts } from './match/types';
import { rewardForStoppedShot } from './shot-reward';

const facts = (pocketed: number[]): ShotFacts => ({
  shotId: 4, firstContact: 1, pocketed, cueScratch: pocketed.includes(0),
  cushionAfterFirstContact: true, remainingSolids: 7, remainingStripes: 7,
});
const resolution = (next: Partial<MatchState>): RoundResolution => ({
  shotId: 4,
  next: {
    phase: 'aiming', actor: 'player', breaking: false, playerGroup: 'solid', winner: null,
    messageKey: 'pot-continue', messageParams: { actor: 'player' }, ...next,
  },
  effects: [],
});

describe('合法进球界面奖励', () => {
  it('奖励玩家本组进球并脉冲对应球号', () => {
    expect(rewardForStoppedShot(facts([1, 9]), resolution({}))).toEqual({
      shotId: 4, ballNumbers: [1], text: '漂亮进球 · 继续',
    });
  });

  it('开球未分组与多球连进都有明确反馈', () => {
    expect(rewardForStoppedShot(facts([1, 9]), resolution({ playerGroup: null }))?.text).toBe('连进 2 球 · 继续');
  });

  it('犯规、对方球、对手进球和终局不显示普通成功奖励', () => {
    expect(rewardForStoppedShot(facts([0, 1]), resolution({ messageKey: 'foul', phase: 'placing' }))).toBeNull();
    expect(rewardForStoppedShot(facts([9]), resolution({ messageKey: 'opponent-pot-turn', actor: 'opponent' }))).toBeNull();
    expect(rewardForStoppedShot(facts([1]), resolution({ messageParams: { actor: 'opponent' } }))).toBeNull();
    expect(rewardForStoppedShot(facts([8]), resolution({ phase: 'finished', messageKey: 'win-8' }))).toBeNull();
  });
});
