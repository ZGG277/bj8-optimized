/*
[INPUT]: 依赖 vitest 与 physics 世界构造/停止仿真
[OUTPUT]: 静止残余侧旋在有限时间归零且 world.moving 收敛的回归
[POS]: 物理停止判定可失败测试网，不参与运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 复现：加塞击球后白球停在原地（stun/碰撞卸速），线速度为 0 但 wy 长时间不归零，
 * world.moving 迟迟不结束——系统反馈"球还在运动中"卡数秒到十几秒 */
import { describe, it, expect } from 'vitest';
import { createInitialWorld, simulateUntilStop } from './physics';

function stagedSpinWorld(wy: number) {
  const world = createInitialWorld();
  for (const b of world.balls) if (b.number !== 0) b.active = false;
  const cue = world.balls[0];
  // 碰撞后白球留在原地：线速度 0，仅剩满塞残余侧旋（strikeCueBall 满力量级）
  cue.vx = 0; cue.vz = 0; cue.wx = 0; cue.wz = 0;
  cue.wy = wy;
  world.moving = true;
  return { world, cue };
}

describe('加塞停球收敛', () => {
  it('中力满塞残余侧旋（≈77 rad/s）应快速归零', () => {
    const { world, cue } = stagedSpinWorld(0.85 * (2.6 / 0.028575));
    simulateUntilStop(world);
    console.log(`中力满塞原地残旋 settle 耗时 ${world.time.toFixed(2)}s`);
    expect(world.time).toBeLessThan(3);
    expect(cue.wy).toBe(0);
    expect(world.moving).toBe(false);
  });

  it('满力满塞残余侧旋（≈238 rad/s）最恶劣情形应快速归零', () => {
    const { world, cue } = stagedSpinWorld(0.85 * (8.0 / 0.028575));
    simulateUntilStop(world, 60);
    console.log(`满力满塞原地残旋 settle 耗时 ${world.time.toFixed(2)}s`);
    expect(world.time).toBeLessThan(4);
    expect(cue.wy).toBe(0);
    expect(world.moving).toBe(false);
  });
});
