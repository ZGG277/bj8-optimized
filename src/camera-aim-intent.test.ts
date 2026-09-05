/*
[INPUT]: 薄切世界几何、当前杆向及袋口清路条件
[OUTPUT]: 锁定相机构图使用目标球真实出射方向选袋，拒绝反向袋与微扰跳袋
[POS]: 相机瞄准语义的纯回归，不改拨轮的既有袋口排序
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { createInitialWorld, type BilliardsWorld } from './physics';
import { inferCameraAimIntent } from './camera-aim-intent';
import { findAimDialTarget } from './aim/aim-solution';

function thinCutWorld(): BilliardsWorld {
  const world = createInitialWorld();
  for (const ball of world.balls) {
    ball.active = ball.number === 0 || ball.number === 1;
    ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
  }
  const cue = world.balls.find(ball => ball.number === 0)!;
  const object = world.balls.find(ball => ball.number === 1)!;
  cue.x = 0;
  cue.z = 0.9;
  object.x = -0.4;
  object.z = -0.8;
  return world;
}

describe('camera aim intent', () => {
  const angle = -0.263114966949942;

  it('薄切按目标球真实出射方向选择右上袋 1，而不是拨轮的反向右下袋 5', () => {
    const world = thinCutWorld();
    expect(findAimDialTarget(world, angle, [1])?.pocket).toBe(5);
    expect(inferCameraAimIntent(world, angle, [1])).toMatchObject({ target: 1, pocket: 1 });
  });

  it.each([-0.003, 0, 0.003])('确认前的微小杆向扰动 %s 不会跳到反向袋', (delta) => {
    const intent = inferCameraAimIntent(thinCutWorld(), angle + delta, [1]);
    // 极薄切的一侧可能刚好失去首碰；此时显式回退也比跳到反向袋安全。
    expect(intent?.pocket).not.toBe(5);
    if (intent) expect(intent).toMatchObject({ target: 1, pocket: 1 });
  });

  it('非法首碰或没有首碰时回退，不猜测相机袋口', () => {
    expect(inferCameraAimIntent(thinCutWorld(), angle, [2])).toBeNull();
    expect(inferCameraAimIntent(thinCutWorld(), angle + Math.PI, [1])).toBeNull();
  });
});
