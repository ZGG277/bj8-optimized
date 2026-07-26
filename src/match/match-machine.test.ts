/*
[INPUT]: 依赖 match 纯规则模块；不挂载 React、不启动 WebGL、不使用 DOM
[OUTPUT]: 规则状态机测试矩阵：开球、分组、犯规、自由球、8 号胜负与确定性
[POS]: match 规则层的回归门禁，R-01 连续进球分组 bug 的永久回归用例
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  beginMatch,
  createInitialMatchState,
  resolveStoppedShot,
} from './match-machine';
import type { MatchState, ShotFacts } from './types';

const S = (over: Partial<MatchState>): MatchState => ({
  phase: 'aiming',
  actor: 'player',
  breaking: false,
  playerGroup: null,
  winner: null,
  messageKey: 'rolling',
  messageParams: {},
  ...over,
});

const F = (over: Partial<ShotFacts>): ShotFacts => ({
  shotId: 1,
  firstContact: 1,
  pocketed: [],
  cueScratch: false,
  cushionAfterFirstContact: true,
  remainingSolids: 7,
  remainingStripes: 7,
  ...over,
});

describe('开球阶段', () => {
  const breaking = S({ breaking: true });

  it('开球未进：退出开球，交换回合，仍开放', () => {
    const r = resolveStoppedShot(breaking, F({}));
    expect(r.next.breaking).toBe(false);
    expect(r.next.actor).toBe('opponent');
    expect(r.next.phase).toBe('opponent');
    expect(r.next.playerGroup).toBeNull();
    expect(r.next.messageKey).toBe('miss-turn');
  });

  it('开球进球：退出开球，玩家继续，仍开放', () => {
    const r = resolveStoppedShot(breaking, F({ pocketed: [1] }));
    expect(r.next.breaking).toBe(false);
    expect(r.next.actor).toBe('player');
    expect(r.next.phase).toBe('aiming');
    expect(r.next.playerGroup).toBeNull();
    expect(r.next.messageKey).toBe('pot-continue');
  });

  it('R-01 回归：开球进球后同一玩家再进球，确定球组', () => {
    // 第一杆：开球进 1 号
    const after1 = resolveStoppedShot(breaking, F({ pocketed: [1], shotId: 1 })).next;
    // 第二杆：同一玩家再进 2 号 → 必须分组（旧代码因闭包缺失 isBreak 永远做不到）
    const r = resolveStoppedShot(after1, F({ pocketed: [2], shotId: 2 }));
    expect(r.next.playerGroup).toBe('solid');
    expect(r.next.actor).toBe('player');
    expect(r.next.phase).toBe('aiming');
    expect(r.next.messageKey).toBe('group-assigned');
  });

  it('开球后对手先合法进球：对手获得该花色，玩家得对向组', () => {
    const after1 = resolveStoppedShot(breaking, F({ pocketed: [9], shotId: 1 })).next;
    const state2 = S({ ...after1, actor: 'opponent', phase: 'opponent' });
    const r = resolveStoppedShot(state2, F({ pocketed: [10], shotId: 2 }));
    expect(r.next.playerGroup).toBe('solid'); // 对手花色 → 玩家全色
    expect(r.next.actor).toBe('opponent');
    expect(r.next.phase).toBe('opponent');
  });
});

describe('普通回合', () => {
  it('合法进球：当前玩家继续', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 3, pocketed: [3], remainingSolids: 5 }),
    );
    expect(r.next.actor).toBe('player');
    expect(r.next.phase).toBe('aiming');
    expect(r.next.messageKey).toBe('pot-continue');
  });

  it('未进：合法首碰且有球碰库 → 交换回合', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 2, pocketed: [] }),
    );
    expect(r.next.actor).toBe('opponent');
    expect(r.next.phase).toBe('opponent');
    expect(r.next.messageKey).toBe('miss-turn');
  });
});

describe('犯规判定', () => {
  it('未碰球：firstContact=null → 犯规', () => {
    const r = resolveStoppedShot(S({}), F({ firstContact: null }));
    expect(r.next.messageKey).toBe('foul');
    expect(r.next.messageParams.reason).toBe('no-contact');
  });

  it('首碰非法：分组后先碰对方球 → 犯规', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 9, remainingSolids: 4 }),
    );
    expect(r.next.messageKey).toBe('foul');
    expect(r.next.messageParams.reason).toBe('wrong-first');
  });

  it('本组清空后首碰 8 号：合法，不算犯规', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 8, remainingSolids: 0 }),
    );
    expect(r.next.messageKey).toBe('miss-turn');
  });

  it('无进球无碰库：有首碰但无后续碰库 → 犯规', () => {
    const r = resolveStoppedShot(
      S({}),
      F({ firstContact: 1, pocketed: [], cushionAfterFirstContact: false }),
    );
    expect(r.next.messageKey).toBe('foul');
    expect(r.next.messageParams.reason).toBe('no-cushion');
  });

  it('玩家白球落袋：AI 自由球并自动放置', () => {
    const r = resolveStoppedShot(S({}), F({ cueScratch: true, pocketed: [0] }));
    expect(r.next.messageKey).toBe('foul');
    expect(r.next.messageParams.reason).toBe('scratch');
    expect(r.next.actor).toBe('opponent');
    expect(r.next.phase).toBe('opponent');
    expect(r.effects).toEqual([{ type: 'auto-respot-cue' }]);
  });

  it('AI 白球落袋：玩家进入放置阶段', () => {
    const r = resolveStoppedShot(
      S({ actor: 'opponent', phase: 'opponent' }),
      F({ cueScratch: true, pocketed: [0] }),
    );
    expect(r.next.actor).toBe('player');
    expect(r.next.phase).toBe('placing');
    expect(r.effects).toEqual([{ type: 'request-player-placement' }]);
  });

  it('开球阶段犯规同样退出开球', () => {
    const r = resolveStoppedShot(
      S({ breaking: true }),
      F({ cueScratch: true, pocketed: [0] }),
    );
    expect(r.next.breaking).toBe(false);
  });
});

describe('8 号球胜负', () => {
  it('提前进 8 号：本组未清 → 当前击球者失败', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 3, pocketed: [8], remainingSolids: 2 }),
    );
    expect(r.next.phase).toBe('finished');
    expect(r.next.winner).toBe('opponent');
    expect(r.next.messageKey).toBe('lose-8-early');
  });

  it('清台进 8 号：本组已清且无犯规 → 当前击球者获胜', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 8, pocketed: [8], remainingSolids: 0 }),
    );
    expect(r.next.phase).toBe('finished');
    expect(r.next.winner).toBe('player');
    expect(r.next.messageKey).toBe('win-8');
  });

  it('进 8 号同时白球落袋：伴随犯规 → 当前击球者失败', () => {
    const r = resolveStoppedShot(
      S({ playerGroup: 'solid' }),
      F({ firstContact: 8, pocketed: [8, 0], cueScratch: true, remainingSolids: 0 }),
    );
    expect(r.next.phase).toBe('finished');
    expect(r.next.winner).toBe('opponent');
    expect(r.next.messageKey).toBe('lose-8-foul');
  });
});

describe('状态机属性', () => {
  it('重开：回到初始开放开球局', () => {
    const m = beginMatch(createInitialMatchState());
    expect(m.phase).toBe('aiming');
    expect(m.actor).toBe('player');
    expect(m.breaking).toBe(true);
    expect(m.playerGroup).toBeNull();
    expect(m.winner).toBeNull();
  });

  it('确定性：同一输入始终返回深相等结果', () => {
    const state = S({ playerGroup: 'stripe', actor: 'opponent', phase: 'opponent' });
    const facts = F({ firstContact: 12, pocketed: [12], remainingStripes: 3 });
    expect(resolveStoppedShot(state, facts)).toEqual(resolveStoppedShot(state, facts));
  });
});
