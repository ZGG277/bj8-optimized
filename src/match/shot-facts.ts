/*
[INPUT]: 依赖 physics 的 BilliardsWorld 快照与事件流；不读取 React 状态
[OUTPUT]: 对外提供 factsFromWorld：把一杆结束后的世界推导为 ShotFacts
[POS]: match 规则层的事实适配器，物理世界到规则状态机的唯一入口
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  isCueBallPocketed,
  pocketedThisShot,
  type BilliardsWorld,
} from '../physics';
import type { ShotFacts } from './types';

/** 从物理世界推导一杆事实；不修改世界，不执行 respotCueBall */
export function factsFromWorld(world: BilliardsWorld): ShotFacts {
  const firstContactTime = world.events.find(e => e.type === 'first-contact')?.time;
  return {
    shotId: world.shot,
    firstContact: world.firstContact,
    pocketed: pocketedThisShot(world),
    cueScratch: isCueBallPocketed(world),
    cushionAfterFirstContact:
      firstContactTime !== undefined &&
      world.events.some(e => e.type === 'cushion' && e.time > firstContactTime),
    remainingSolids: world.balls.filter(b => b.active && b.number >= 1 && b.number <= 7).length,
    remainingStripes: world.balls.filter(b => b.active && b.number >= 9 && b.number <= 15).length,
  };
}
