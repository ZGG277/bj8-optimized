/*
[INPUT]: 只依赖类型本身；球号到分组的映射按中八编号约定（1-7 全色、8 黑、9-15 花色）
[OUTPUT]: 对外提供 MatchState / ShotFacts / RoundResolution 等规则协议类型
[POS]: match 规则层的协议定义，Game 与 match-machine 的唯一状态契约
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

export type Actor = 'player' | 'opponent';
export type ObjectGroup = 'solid' | 'stripe';

export type MatchPhase =
  | 'intro'
  | 'aiming'
  | 'rolling'
  | 'opponent'
  | 'placing'
  | 'finished';

export type FoulReason = 'scratch' | 'no-contact' | 'wrong-first' | 'no-cushion';

/** 规则层只输出消息键与参数，中文文案由 UI 渲染层决定 */
export type MatchMessageKey =
  | 'break-start'
  | 'rolling'
  | 'pot-continue'
  | 'miss-turn'
  | 'opponent-pot-turn'
  | 'group-assigned'
  | 'foul'
  | 'win-8'
  | 'lose-8-foul'
  | 'lose-8-early'
  | 'ai-choice'
  | 'ai-safe'
  | 'placing-freeball'
  | 'placing-break'
  | 'break-ready'
  | 'placed'
  | 'place-occupied'
  | 'place-near-pocket'
  | 'place-outside-kitchen';

export type MatchMessageParams = {
  actor?: Actor;
  count?: number;
  group?: ObjectGroup;
  reason?: FoulReason;
  target?: number;
};

/** 对局规则状态：必须作为同一原子状态迁移，禁止拆成互相异步的字段 */
export type MatchState = {
  phase: MatchPhase;
  actor: Actor;
  breaking: boolean;
  playerGroup: ObjectGroup | null;
  winner: Actor | null;
  messageKey: MatchMessageKey;
  messageParams: MatchMessageParams;
};

/** 一杆结束后从物理世界推导的事实，不含 UI 文案，不执行重置白球 */
export type ShotFacts = {
  shotId: number;
  firstContact: number | null;
  pocketed: number[];
  cueScratch: boolean;
  cushionAfterFirstContact: boolean;
  remainingSolids: number;
  remainingStripes: number;
};

export type RoundEffect =
  | { type: 'auto-respot-cue' }
  | { type: 'request-player-placement' }
  | { type: 'schedule-opponent' };

export type RoundResolution = {
  shotId: number;
  next: MatchState;
  effects: RoundEffect[];
};
