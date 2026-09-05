/*
[INPUT]: 依赖 physics 的固定步进、击球和共享接触冲量接口
[OUTPUT]: 高速全区间 CCD、球序不变性、中杆滑动、旋转传递与无凭空增能的可失败回归
[POS]: 物理正确性解析基准；真值来自独立最短距离/动量/能量不变量
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  PHYSICS_DT,
  TABLE,
  ballContactRelativeVelocity,
  createInitialWorld,
  getCueBall,
  stepWorld,
  strikeCueBall,
  type BallState,
  type BilliardsWorld,
} from '../physics';

const R = TABLE.ballRadius;

function kineticEnergy(ball: BallState): number {
  return 0.5 * (
    ball.vx * ball.vx + ball.vz * ball.vz
    + 0.4 * R * R * (ball.wx * ball.wx + ball.wy * ball.wy + ball.wz * ball.wz)
  );
}

function thinHitWorld(reverseArray = false): BilliardsWorld {
  const world = createInitialWorld();
  for (const ball of world.balls) ball.active = ball.number === 0 || ball.number === 1;
  const cue = getCueBall(world)!;
  const target = world.balls.find((ball) => ball.number === 1)!;
  cue.x = -0.022;
  cue.z = 0.056;
  cue.vx = 10;
  cue.vz = 0;
  cue.wx = cue.wy = cue.wz = 0;
  target.x = 0;
  target.z = 0;
  target.vx = target.vz = 0;
  target.wx = target.wy = target.wz = 0;
  world.events = [];
  world.firstContact = null;
  world.moving = true;
  if (reverseArray) world.balls.reverse();
  return world;
}

describe('全时间区间球球 CCD', () => {
  it('10m/s 薄擦在步末无重叠仍必须命中', () => {
    const world = thinHitWorld();
    const cue = getCueBall(world)!;
    const target = world.balls.find((ball) => ball.number === 1)!;

    // 独立几何真值：轨迹最短距离 56mm < 球径 57.15mm。
    expect(Math.abs(cue.z - target.z)).toBeLessThan(R * 2);
    // 但无碰撞时步末球心距离又会大于球径，专门防止“步末重叠才回滚”。
    expect(Math.hypot(
      cue.x + cue.vx * PHYSICS_DT - target.x,
      cue.z + cue.vz * PHYSICS_DT - target.z,
    )).toBeGreaterThan(R * 2);

    stepWorld(world, PHYSICS_DT);

    expect(world.events.some((event) => (
      event.type === 'ball-collision'
      && [event.first, event.second].includes(0)
      && [event.first, event.second].includes(1)
    ))).toBe(true);
    expect(world.firstContact).toBe(1);
    expect(Math.hypot(target.vx, target.vz)).toBeGreaterThan(0.5);
  });

  it('交换 balls 数组顺序不改变结果', () => {
    const normal = thinHitWorld(false);
    const reversed = thinHitWorld(true);
    stepWorld(normal, PHYSICS_DT);
    stepWorld(reversed, PHYSICS_DT);

    for (const number of [0, 1]) {
      const a = normal.balls.find((ball) => ball.number === number)!;
      const b = reversed.balls.find((ball) => ball.number === number)!;
      expect(a.x).toBeCloseTo(b.x, 12);
      expect(a.z).toBeCloseTo(b.z, 12);
      expect(a.vx).toBeCloseTo(b.vx, 12);
      expect(a.vz).toBeCloseTo(b.vz, 12);
      expect(a.wy).toBeCloseTo(b.wy, 12);
    }
  });

  it('对称一撞二多接触同时传播，不形成索引单链', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = [0, 1, 2].includes(ball.number);
    const cue = getCueBall(world)!;
    const left = world.balls.find((ball) => ball.number === 1)!;
    const right = world.balls.find((ball) => ball.number === 2)!;
    cue.x = 0; cue.z = 0; cue.vx = 0; cue.vz = -4;
    cue.wx = cue.wy = cue.wz = 0;
    left.x = -R; left.z = -Math.sqrt(3) * R;
    right.x = R; right.z = -Math.sqrt(3) * R;
    for (const target of [left, right]) {
      target.vx = target.vz = 0;
      target.wx = target.wy = target.wz = 0;
    }
    world.moving = true;
    const energyBefore = kineticEnergy(cue);

    stepWorld(world, PHYSICS_DT);

    expect(left.vx).toBeCloseTo(-right.vx, 10);
    expect(left.vz).toBeCloseTo(right.vz, 10);
    expect(Math.hypot(left.vx, left.vz)).toBeGreaterThan(1);
    expect(Math.hypot(right.vx, right.vz)).toBeGreaterThan(1);
    expect(kineticEnergy(cue) + kineticEnergy(left) + kineticEnergy(right))
      .toBeLessThanOrEqual(energyBefore + 1e-9);
  });

  it('与真实 TOI 断开的近接触岛保持静止，不参与非局部能量缩放', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = [0, 1, 2, 3].includes(ball.number);
    const cue = getCueBall(world)!;
    const hit = world.balls.find((ball) => ball.number === 1)!;
    const idleA = world.balls.find((ball) => ball.number === 2)!;
    const idleB = world.balls.find((ball) => ball.number === 3)!;
    cue.x = -0.4; cue.z = 0; cue.vx = 1; cue.vz = 0;
    hit.x = -0.34; hit.z = 0; hit.vx = hit.vz = 0;
    idleA.x = 0.3; idleA.z = 0.2; idleA.vx = idleA.vz = 0;
    idleB.x = 0.3 + R * 2; idleB.z = 0.2; idleB.vx = idleB.vz = 0;
    for (const ball of [cue, hit, idleA, idleB]) ball.wx = ball.wy = ball.wz = 0;
    world.moving = true;

    stepWorld(world, PHYSICS_DT);

    expect(Math.hypot(hit.vx, hit.vz)).toBeGreaterThan(0.5);
    expect(idleA.vx).toBe(0);
    expect(idleA.vz).toBe(0);
    expect(idleB.vx).toBe(0);
    expect(idleB.vz).toBe(0);
  });

  it('固定开球的事件预算有充足余量且不触发退化', () => {
    const world = createInitialWorld();
    strikeCueBall(world, 0, 92);
    for (let index = 0; index < 240 * 5 && world.moving; index += 1) {
      stepWorld(world, PHYSICS_DT);
    }
    expect(world.eventBudgetExhaustions).toBe(0);
    expect(world.maxStepEventCount).toBeLessThan(16);
  });
});

describe('球碰、库边与袋口的统一步内时序', () => {
  it('先球碰再落袋，事件时间保留真实入袋自旋', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = ball.number === 0 || ball.number === 1;
    const cue = getCueBall(world)!;
    const target = world.balls.find((ball) => ball.number === 1)!;
    cue.x = 0.55; cue.z = 0; cue.vx = 10; cue.vz = 0; cue.wy = 12;
    cue.wx = cue.wz = 0;
    target.x = 0.615; target.z = 0; target.vx = target.vz = 0;
    target.wx = target.wy = target.wz = 0;
    world.moving = true;

    stepWorld(world, PHYSICS_DT);

    const collision = world.events.find((event) => event.type === 'ball-collision');
    const pocket = world.events.find((event) => event.type === 'pocket' && event.ball === 1);
    expect(collision?.type).toBe('ball-collision');
    expect(pocket?.type).toBe('pocket');
    if (collision?.type === 'ball-collision' && pocket?.type === 'pocket') {
      expect(collision.time).toBeLessThan(pocket.time);
      expect(pocket.entryWx).toBeTypeOf('number');
      expect(pocket.entryWy).toBeTypeOf('number');
      expect(pocket.entryWz).toBeTypeOf('number');
    }
  });

  it('同一固定步内先碰库反弹，再与身后球碰撞', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = ball.number === 0 || ball.number === 1;
    const cue = getCueBall(world)!;
    const target = world.balls.find((ball) => ball.number === 1)!;
    cue.x = 0.6; cue.z = 0.3; cue.vx = 10; cue.vz = 0;
    cue.wx = cue.wy = cue.wz = 0;
    target.x = 0.54; target.z = 0.3; target.vx = target.vz = 0;
    target.wx = target.wy = target.wz = 0;
    world.moving = true;

    stepWorld(world, PHYSICS_DT);

    const cushion = world.events.find((event) => event.type === 'cushion' && event.ball === 0);
    const collision = world.events.find((event) => event.type === 'ball-collision');
    expect(cushion?.type).toBe('cushion');
    expect(collision?.type).toBe('ball-collision');
    if (cushion?.type === 'cushion' && collision?.type === 'ball-collision') {
      expect(cushion.time).toBeLessThan(collision.time);
    }
  });

  it('带侧旋斜碰库会耦合切向/自旋，但被动接触不增加总能量', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    const cue = getCueBall(world)!;
    cue.x = 0.6; cue.z = 0.3;
    cue.vx = 10; cue.vz = 1;
    cue.wx = cue.wz = 0; cue.wy = 100;
    world.moving = true;
    const energyBefore = kineticEnergy(cue);

    stepWorld(world, PHYSICS_DT);

    expect(world.events.some((event) => event.type === 'cushion')).toBe(true);
    expect(cue.vx).toBeLessThan(0);
    expect(cue.wy).not.toBeCloseTo(100, 8);
    expect(kineticEnergy(cue)).toBeLessThanOrEqual(energyBefore + 1e-9);
  });
});

describe('击球与接触冲量不变量', () => {
  it('水平中心杆初始是滑动，而非预置纯滚动', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    strikeCueBall(world, 0, 50, { x: 0, y: 0 });
    const cue = getCueBall(world)!;
    expect(cue.wx).toBeCloseTo(0, 12);
    expect(cue.wz).toBeCloseTo(0, 12);
    expect(Math.hypot(cue.vx + R * cue.wz, cue.vz - R * cue.wx)).toBeGreaterThan(5);
  });

  it('零平动的水平轴残旋会通过布面摩擦恢复可解释的平动', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    const cue = getCueBall(world)!;
    cue.vx = cue.vz = 0;
    cue.wx = 80;
    cue.wy = cue.wz = 0;
    world.moving = true;

    stepWorld(world, PHYSICS_DT);

    expect(cue.vz).toBeGreaterThan(0);
    expect(cue.wx).toBeLessThan(80);
  });

  it('带侧旋的球球接触使切向平动与两球角速度同步改变', () => {
    const first = { vx: 1, vz: 0, wy: 25 };
    const second = { vx: 0, vz: 0, wy: 0 };
    const before = ballContactRelativeVelocity(first, second, 1, 0, R);
    expect(before.tangent).toBeGreaterThan(0);

    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = ball.number === 0 || ball.number === 1;
    const cue = getCueBall(world)!;
    const target = world.balls.find((ball) => ball.number === 1)!;
    cue.x = 0; cue.z = 0; cue.vx = 1; cue.vz = 0; cue.wy = 25; cue.wx = cue.wz = 0;
    target.x = R * 2; target.z = 0; target.vx = target.vz = 0;
    target.wx = target.wy = target.wz = 0;
    world.moving = true;
    const energyBefore = kineticEnergy(cue) + kineticEnergy(target);

    stepWorld(world, PHYSICS_DT);

    expect(target.vz).not.toBeCloseTo(0, 8);
    expect(cue.wy).not.toBeCloseTo(25, 8);
    expect(target.wy).not.toBeCloseTo(0, 8);
    expect(kineticEnergy(cue) + kineticEnergy(target)).toBeLessThanOrEqual(energyBefore + 1e-9);
  });
});
