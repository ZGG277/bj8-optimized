/*
[INPUT]: 依赖 match/types 协议与 physics 的世界快照类型；禁止读取 React state/ref、禁止 setTimeout
[OUTPUT]: 对外提供纯规则函数：合法目标推导、初始对局、resolveStoppedShot 一杆结算
[POS]: match 规则层的核心状态机，规则事实到规则状态迁移的唯一实现
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import type {
  Actor,
  FoulReason,
  MatchState,
  ObjectGroup,
  RoundEffect,
  RoundResolution,
  ShotFacts,
} from './types';

export function oppositeGroup(group: ObjectGroup): ObjectGroup {
  return group === 'solid' ? 'stripe' : 'solid';
}

export function otherActor(actor: Actor): Actor {
  return actor === 'player' ? 'opponent' : 'player';
}

/** 球号 → 分组；8 号不属于任何花色组 */
function groupOfNumber(n: number): ObjectGroup | null {
  if (n >= 1 && n <= 7) return 'solid';
  if (n >= 9 && n <= 15) return 'stripe';
  return null;
}

/** 某击球方当前的花色组（未分组时为 null） */
function groupOfActor(state: MatchState, actor: Actor): ObjectGroup | null {
  if (!state.playerGroup) return null;
  return actor === 'player' ? state.playerGroup : oppositeGroup(state.playerGroup);
}

export function ballsForGroup(world: BilliardsWorld, group: ObjectGroup): number[] {
  return world.balls.filter(b => b.active && b.group === group).map(b => b.number);
}

/**
 * 合法目标球号：未分组时所有花色球合法；
 * 分组后只能打本组球，本组清空后只能打 8 号
 */
export function legalNumbers(
  world: BilliardsWorld,
  actor: Actor,
  playerGroup: ObjectGroup | null,
): number[] {
  if (!playerGroup) {
    return world.balls
      .filter(b => b.active && (b.group === 'solid' || b.group === 'stripe'))
      .map(b => b.number);
  }
  const group = actor === 'player' ? playerGroup : oppositeGroup(playerGroup);
  const remaining = ballsForGroup(world, group);
  return remaining.length > 0 ? remaining : [8];
}

/** 初始对局：介绍页，尚未开球 */
export function createInitialMatchState(): MatchState {
  return {
    phase: 'intro',
    actor: 'player',
    breaking: true,
    playerGroup: null,
    winner: null,
    messageKey: 'break-start',
    messageParams: {},
  };
}

/** 从介绍页进入开球：白球已在标准位，直接进入瞄准状态 */
export function beginMatch(state: MatchState): MatchState {
  return { ...createInitialMatchState(), phase: 'aiming', messageKey: 'break-ready', messageParams: state.messageParams };
}

/**
 * 一杆结算：物理停止后由 Game 调用。
 * 纯函数：同一 (state, facts) 始终返回深相等结果；不修改世界、不碰 React。
 */
export function resolveStoppedShot(state: MatchState, facts: ShotFacts): RoundResolution {
  const actor = state.actor;
  const objectPotted = facts.pocketed.filter(n => n > 0 && n !== 8);
  const eightPotted = facts.pocketed.includes(8);
  const actorGroup = groupOfActor(state, actor);
  const actorRemaining = actorGroup === 'solid'
    ? facts.remainingSolids
    : actorGroup === 'stripe'
      ? facts.remainingStripes
      : 0;

  // ---- 犯规事实推导（优先级从高到低）----
  let foul: FoulReason | null = null;
  if (facts.cueScratch) {
    foul = 'scratch';
  } else if (facts.firstContact === null) {
    foul = 'no-contact';
  } else if (actorGroup) {
    const fcGroup = groupOfNumber(facts.firstContact);
    const legal = fcGroup === actorGroup || (facts.firstContact === 8 && actorRemaining === 0);
    if (!legal) foul = 'wrong-first';
  }
  // "碰球后须碰库或进球"中的进球含 8 号：干净打进 8 号（无碰库）不算 no-cushion
  const anyObjectPotted = objectPotted.length > 0 || eightPotted;
  if (!foul && facts.firstContact !== null && !anyObjectPotted && !facts.cushionAfterFirstContact) {
    foul = 'no-cushion';
  }

  // ---- 8 号球入袋：合法清台者胜，提前或伴随犯规者负 ----
  if (eightPotted) {
    const cleared = actorGroup ? actorRemaining === 0 : false;
    const win = cleared && !foul;
    return {
      shotId: facts.shotId,
      next: {
        ...state,
        phase: 'finished',
        breaking: false,
        winner: win ? actor : otherActor(actor),
        messageKey: win ? 'win-8' : foul ? 'lose-8-foul' : 'lose-8-early',
        messageParams: { actor, reason: foul ?? undefined },
      },
      effects: [],
    };
  }

  // ---- 犯规：换对手，自由球 ----
  if (foul) {
    const playerFouled = actor === 'player';
    const effects: RoundEffect[] = playerFouled
      ? [{ type: 'auto-respot-cue' }]
      : [{ type: 'request-player-placement' }];
    return {
      shotId: facts.shotId,
      next: {
        ...state,
        phase: playerFouled ? 'opponent' : 'placing',
        actor: otherActor(actor),
        breaking: false,
        winner: null,
        messageKey: 'foul',
        messageParams: { actor, reason: foul },
      },
      effects,
    };
  }

  // ---- 开球阶段：进球继续（不分组），未进换人；都退出开球 ----
  if (state.breaking) {
    const potted = objectPotted.length > 0;
    const nextActor = potted ? actor : otherActor(actor);
    return {
      shotId: facts.shotId,
      next: {
        ...state,
        phase: nextActor === 'player' ? 'aiming' : 'opponent',
        actor: nextActor,
        breaking: false,
        winner: null,
        messageKey: potted ? 'pot-continue' : 'miss-turn',
        messageParams: { actor, count: objectPotted.length || undefined },
      },
      effects: [],
    };
  }

  // ---- 分组判定：开球结束后首次合法进球确定分组 ----
  if (!state.playerGroup && objectPotted.length > 0) {
    const firstGroup = groupOfNumber(objectPotted[0]);
    if (firstGroup) {
      const playerActualGroup = actor === 'player' ? firstGroup : oppositeGroup(firstGroup);
      return {
        shotId: facts.shotId,
        next: {
          ...state,
          phase: actor === 'player' ? 'aiming' : 'opponent',
          breaking: false,
          playerGroup: playerActualGroup,
          winner: null,
          messageKey: 'group-assigned',
          messageParams: { actor, group: firstGroup },
        },
        effects: [],
      };
    }
  }

  // ---- 普通回合：进球继续，未进换人 ----
  const potted = objectPotted.length > 0;
  const nextActor = potted ? actor : otherActor(actor);
  return {
    shotId: facts.shotId,
    next: {
      ...state,
      phase: nextActor === 'player' ? 'aiming' : 'opponent',
      actor: nextActor,
      breaking: false,
      winner: null,
      messageKey: potted ? 'pot-continue' : 'miss-turn',
      messageParams: { actor, count: objectPotted.length || undefined },
    },
    effects: [],
  };
}
