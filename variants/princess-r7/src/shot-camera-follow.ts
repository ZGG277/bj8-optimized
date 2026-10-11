/*
[INPUT]: 已锁定的目标球号与运动中的物理世界快照
[OUTPUT]: 对外提供击球近景跟随状态，只在目标球落袋、已运动后停止或整杆停止时报告结果可见
[POS]: 摄像机产品时序的纯判定层；不改写物理世界，不决定比赛结算
[PROTOCOL]: 结果条件变更时同步更新 shot-camera-follow.test.ts 与 src/CLAUDE.md
*/
import type { BilliardsWorld } from './physics';

export type ShotCameraFollowState = {
  targetNumber: number;
  targetHasMoved: boolean;
};

export type ShotCameraFollowOutcome = 'tracking' | 'pocketed' | 'stopped';

export type ShotCameraFollowObservation = {
  state: ShotCameraFollowState;
  outcome: ShotCameraFollowOutcome;
};

const TARGET_MOTION_EPSILON = 1e-5;

export function createShotCameraFollow(targetNumber: number): ShotCameraFollowState {
  return { targetNumber, targetHasMoved: false };
}

/**
 * 目标球击中前本来就是静止的，因此不能在出杆首帧把它误判为“没进”。
 * 只有它曾运动后又停止，或整杆已结束，才结束近景。
 */
export function observeShotCameraFollow(
  current: ShotCameraFollowState,
  world: BilliardsWorld,
): ShotCameraFollowObservation {
  const pocketed = world.events.some(
    event => event.type === 'pocket' && event.ball === current.targetNumber,
  );
  const target = world.balls.find(ball => ball.number === current.targetNumber);
  if (pocketed || !target?.active) {
    return { state: current, outcome: 'pocketed' };
  }

  const moving = Math.hypot(target.vx, target.vz) > TARGET_MOTION_EPSILON;
  const state = current.targetHasMoved || moving
    ? { ...current, targetHasMoved: true }
    : current;
  if ((state.targetHasMoved && !moving) || !world.moving) {
    return { state, outcome: 'stopped' };
  }
  return { state, outcome: 'tracking' };
}
