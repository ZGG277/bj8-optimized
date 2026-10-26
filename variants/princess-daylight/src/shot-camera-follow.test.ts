/*
[INPUT]: shot-camera-follow 的纯状态观测函数与最小物理世界快照
[OUTPUT]: 回归目标球未触球不误结束、运动后停止、落袋及整杆停止四类近景切换边界
[POS]: 击球后目标球跟随的纯时序单测，不依赖 React/Three.js
[PROTOCOL]: 跟随结果条件变更时同步更新 shot-camera-follow.ts
*/
import { describe, expect, it } from 'vitest';
import { createInitialWorld, type BilliardsWorld } from './physics';
import { createShotCameraFollow, observeShotCameraFollow } from './shot-camera-follow';

function rollingWorld(): BilliardsWorld {
  const world = createInitialWorld(() => 0.5);
  world.moving = true;
  return world;
}

describe('observeShotCameraFollow', () => {
  it('出杆后目标球尚未被撞时保持近景', () => {
    const result = observeShotCameraFollow(createShotCameraFollow(1), rollingWorld());
    expect(result.outcome).toBe('tracking');
    expect(result.state.targetHasMoved).toBe(false);
  });

  it('目标球运动后停下才确认未进袋', () => {
    const world = rollingWorld();
    const target = world.balls.find(ball => ball.number === 1)!;
    target.vx = 0.4;
    const moving = observeShotCameraFollow(createShotCameraFollow(1), world);
    expect(moving.outcome).toBe('tracking');
    target.vx = 0;
    expect(observeShotCameraFollow(moving.state, world).outcome).toBe('stopped');
  });

  it('目标球落袋事件立即确认进袋', () => {
    const world = rollingWorld();
    world.events.push({
      type: 'pocket', ball: 1, pocket: 0, time: 0.6, speed: 0.8,
      entryX: -0.7, entryZ: -1.35, entryVx: 0, entryVz: -0.8,
    });
    expect(observeShotCameraFollow(createShotCameraFollow(1), world).outcome)
      .toBe('pocketed');
  });

  it('错过目标球但整杆已停止时不会永久停留近景', () => {
    const world = rollingWorld();
    world.moving = false;
    expect(observeShotCameraFollow(createShotCameraFollow(1), world).outcome)
      .toBe('stopped');
  });
});
