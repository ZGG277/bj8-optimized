/*
[INPUT]: 公主 R2 共享尺寸、实际物理碰撞/摆球、可见袋腔与库边
[OUTPUT]: 大球/宽袋比例、球体可容纳性、新半径碰撞与不重叠球堆的回归
[POS]: 防止仅放大可视球或仅扩大捕获区的跨层合同
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { TABLE, POCKETS, createInitialWorld, getCueBall, stepWorld } from '../physics';
import { BALL_POCKET_SCALE, BALL_RADIUS, POCKET_AIM_CLEARANCE } from './size-contract';
import { pocketRenderProfile } from '../pocket-render/profile';
import { CUSHION_NOSE_HEIGHT, TABLE_RENDER } from '../pocket-render/cushion-geometry';

describe('R2 shared ball and pocket dimensions', () => {
  it('balances corner and side mouths while slightly reducing the shared ball size', () => {
    expect(BALL_POCKET_SCALE).toBe(1.28);
    expect(TABLE.ballRadius).toBe(BALL_RADIUS);
    expect(TABLE.ballRadius * 2).toBeCloseTo(.085725, 12);
    expect(TABLE.width).toBe(1.27); expect(TABLE.length).toBe(2.54);
    for (const pocket of POCKETS) {
      expect(pocket.mouthWidth).toBeCloseTo(pocket.kind === 'corner' ? .140 : .120, 8);
      expect(pocket.mouthWidth / (TABLE.ballRadius * 2)).toBeGreaterThan(1.39);
      expect(pocket.mouthWidth / (TABLE.ballRadius * 2)).toBeLessThan(1.64);
      expect(pocket.dropHalfWidth).toBeCloseTo(pocket.mouthHalfWidth - TABLE.ballRadius - POCKET_AIM_CLEARANCE, 12);
      const profile = pocketRenderProfile(pocket);
      expect(profile.visibleHoleHalfWidth).toBe(pocket.mouthHalfWidth);
      expect(profile.ballRadius).toBe(TABLE.ballRadius);
      expect(Math.min(profile.bottomDepthRadius, profile.bottomLateralRadius)).toBeGreaterThan(TABLE.ballRadius);
    }
    expect(CUSHION_NOSE_HEIGHT).toBeLessThan(TABLE_RENDER.cushionHeight);
  });

  it('builds the complete rack at the new non-overlapping diameter', () => {
    const balls = createInitialWorld().balls.filter(ball => ball.active);
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      expect(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z)).toBeGreaterThanOrEqual(TABLE.ballRadius * 2);
    }
  });

  it('collides at the larger shared radius rather than the former visible-only radius', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = ball.number < 2;
    const cue = getCueBall(world)!;
    const target = world.balls.find(ball => ball.number === 1)!;
    cue.x = -.04; cue.z = .073; cue.vx = 10; cue.vz = 0;
    target.x = 0; target.z = 0;
    world.moving = true;
    expect(Math.abs(cue.z)).toBeGreaterThan(.062865);
    expect(Math.abs(cue.z)).toBeLessThan(TABLE.ballRadius * 2);
    stepWorld(world);
    expect(world.firstContact).toBe(1);
    expect(Math.hypot(target.vx, target.vz)).toBeGreaterThan(0);
  });
});
