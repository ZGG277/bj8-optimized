/*
[INPUT]: 依赖 vitest 与 physics 物理内核的全部公开接口
[OUTPUT]: 对外提供含台内圆弧捕获的物理内核单元测试与手感指标（无导出），由 npm run check 执行
[POS]: 物理层的可失败断言网：出杆、滑动/滚动、碰库、落袋、走位与边界；摆球走无参固定摆法保证可复现
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialWorld,
  getCueBall,
  strikeCueBall,
  stepWorld,
  simulateUntilStop,
  pocketedThisShot,
  isCueBallPocketed,
  respotCueBall,
  clampAimToForwardHalf,
  predictBallCollisionDirections,
  getPocketAimWindow,
  POCKETS,
  POCKET_MOUTH_PRESET,
  POCKET_MOUTH_WIDTH_PRESETS,
  TABLE,
  PHYSICS_DT,
  type BilliardsWorld,
} from './physics';

const activePocketMouthWidth = POCKET_MOUTH_WIDTH_PRESETS[POCKET_MOUTH_PRESET];

describe('出杆机制测试', () => {
  let world: BilliardsWorld;

  beforeEach(() => {
    world = createInitialWorld();
  });

  it('初始状态白球存在且静止', () => {
    const cue = getCueBall(world);
    expect(cue).toBeDefined();
    expect(cue?.active).toBe(true);
    expect(cue?.x).toBe(0);
    expect(cue?.z).toBe(TABLE.length * 0.25);
    expect(world.moving).toBe(false);
  });

  it('可以正常击打白球', () => {
    const result = strikeCueBall(world, 0.5, 50);
    expect(result).toBe(true);
    expect(world.moving).toBe(true);
    expect(world.shot).toBe(1);

    const cue = getCueBall(world);
    expect(cue?.vx).not.toBe(0);
    expect(cue?.vz).not.toBe(0);
  });

  it('静止状态下才能击球', () => {
    strikeCueBall(world, 0, 50);
    expect(world.moving).toBe(true);
    const result2 = strikeCueBall(world, 0.1, 50);
    expect(result2).toBe(false);
  });

  it('物理模拟后球会停止', () => {
    strikeCueBall(world, 0, 50);
    simulateUntilStop(world);
    expect(world.moving).toBe(false);
    const cue = getCueBall(world);
    expect(cue?.vx).toBe(0);
    expect(cue?.vz).toBe(0);
  });

  it('击球后白球速度正确', () => {
    strikeCueBall(world, 0, 50);
    const cue = getCueBall(world);
    const speed = Math.hypot(cue!.vx, cue!.vz);
    // 0.35 + 0.5 * 9.65 = 5.175
    expect(speed).toBeGreaterThan(4.9);
    expect(speed).toBeLessThan(5.4);
  });

  it('力度边界值测试', () => {
    strikeCueBall(world, 0, 1);
    let cue = getCueBall(world);
    let speed = Math.hypot(cue!.vx, cue!.vz);
    expect(speed).toBeGreaterThan(0.35);
    expect(speed).toBeLessThan(0.6);

    world = createInitialWorld();
    strikeCueBall(world, 0, 100);
    cue = getCueBall(world);
    speed = Math.hypot(cue!.vx, cue!.vz);
    expect(speed).toBeGreaterThan(9.6);
    expect(speed).toBeLessThan(10.4);
  });

  it('角度影响速度方向', () => {
    strikeCueBall(world, Math.PI / 2, 50);
    let cue = getCueBall(world);
    expect(cue!.vx).toBeGreaterThan(0);
    expect(Math.abs(cue!.vz)).toBeLessThan(0.01);

    world = createInitialWorld();
    strikeCueBall(world, -Math.PI / 2, 50);
    cue = getCueBall(world);
    expect(cue!.vx).toBeLessThan(0);
    expect(Math.abs(cue!.vz)).toBeLessThan(0.01);
  });
});

describe('滚动摩擦手感测试', () => {
  function rollDistance(power: number): number {
    const world = createInitialWorld();
    // 清台，只留白球直线滚
    for (const b of world.balls) if (b.number !== 0) b.active = false;
    const cue = getCueBall(world)!;
    strikeCueBall(world, 0, power);
    let dist = 0;
    for (let i = 0; i < 240 * 90 && world.moving; i++) {
      stepWorld(world, PHYSICS_DT);
      dist += Math.hypot(cue.vx, cue.vz) * PHYSICS_DT;
    }
    return dist;
  }

  it('小力(20)滚动距离合理（约 1.5-4.5m）', () => {
    const d = rollDistance(20);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(4.5);
  });

  it('中力(50)滚动距离合理（约 4-14m）', () => {
    const d = rollDistance(50);
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(14);
  });

  it('滚动后自旋归零', () => {
    const world = createInitialWorld();
    for (const b of world.balls) if (b.number !== 0) b.active = false;
    strikeCueBall(world, 0, 40);
    simulateUntilStop(world, 60);
    const cue = getCueBall(world)!;
    expect(cue.wx).toBe(0);
    expect(cue.wy).toBe(0);
    expect(cue.wz).toBe(0);
  });
});

describe('自旋（杆法）测试', () => {
  function setupSingle(): BilliardsWorld {
    const world = createInitialWorld();
    for (const b of world.balls) if (b.number !== 0) b.active = false;
    return world;
  }

  it('低杆击球瞬间白球反向自旋', () => {
    const world = setupSingle();
    strikeCueBall(world, 0, 60, { x: -1, y: 0 });
    const cue = getCueBall(world)!;
    // 向 -z 运动，低杆 → wx 与纯滚动方向相反（应为正）
    expect(cue.wx).toBeGreaterThan(0);
  });

  it('高杆跟进、低杆拉回（打静止球后）', () => {
    const runHit = (sx: number) => {
      const world = setupSingle();
      const one = world.balls.find(b => b.number === 1)!;
      one.active = true;
      one.x = 0; one.z = -0.3;
      const cue = getCueBall(world)!;
      cue.x = 0; cue.z = 0.3;
      strikeCueBall(world, 0, 25, { x: sx, y: 0 });
      simulateUntilStop(world, 60);
      return cue.z;
    };
    const followZ = runHit(1);
    const stunZ = runHit(0);
    const drawZ = runHit(-1);
    // 击球点在 z≈-0.24：高杆应跟进（z 明显更小），低杆应拉回（z 明显更大）
    expect(followZ).toBeLessThan(-0.4);
    expect(stunZ).toBeGreaterThan(followZ + 0.3);
    expect(drawZ).toBeGreaterThan(stunZ + 0.15);
  });

  it('侧旋影响碰库后的切向反弹', () => {
    const runKick = (sy: number) => {
      const world = setupSingle();
      const cue = getCueBall(world)!;
      cue.z = 0;
      cue.x = 0;
      strikeCueBall(world, 0, 55, { x: 0, y: sy });
      simulateUntilStop(world, 60);
      return cue.x;
    };
    const right = runKick(1);
    const left = runKick(-1);
    // 右塞和左塞碰底库后横向偏移方向应相反
    expect(Math.sign(right)).not.toBe(Math.sign(left));
  });
});

describe('碰撞物理测试', () => {
  it('瞄准预测与球碰冲量共享：正碰目标球沿母球方向，切球包含 throw 偏转', () => {
    const straight = predictBallCollisionDirections(0, -1, 0, -1);
    expect(straight.object.x).toBeCloseTo(0, 8);
    expect(straight.object.z).toBeCloseTo(-1, 8);
    expect(straight.cueSpeedRatio).toBeLessThan(0.05);

    const invSqrt2 = Math.SQRT1_2;
    const cut = predictBallCollisionDirections(0, -1, invSqrt2, -invSqrt2);
    expect(Math.hypot(cut.object.x, cut.object.z)).toBeCloseTo(1, 8);
    expect(cut.object.x).not.toBeCloseTo(invSqrt2, 3);
  });

  it('物理引擎可以模拟多个时间步', () => {
    const world = createInitialWorld();
    strikeCueBall(world, 0.5, 60);
    for (let i = 0; i < 100; i++) stepWorld(world);
    expect(world.time).toBeGreaterThan(0);
  });

  it('直线正碰传递动量', () => {
    const world = createInitialWorld();
    for (const b of world.balls) if (b.number !== 0 && b.number !== 1) b.active = false;
    const cue = getCueBall(world)!;
    const one = world.balls.find(b => b.number === 1)!;
    cue.z = 0;
    cue.x = one.x;
    const z0 = one.z;
    strikeCueBall(world, 0, 40);
    let minZ = z0;
    for (let i = 0; i < 240 * 60 && world.moving; i++) {
      stepWorld(world, PHYSICS_DT);
      minZ = Math.min(minZ, one.z);
    }
    // 1号球应被打向 -z 方向至少 0.6m（碰库前）
    expect(z0 - minZ).toBeGreaterThan(0.6);
  });

  it('纯 z 方向逆序三球链在同一步内继续传播（碰撞迭代不得只观察 x）', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) ball.active = [0, 1, 2].includes(ball.number);
    const cue = world.balls.find((ball) => ball.number === 0)!;
    const one = world.balls.find((ball) => ball.number === 1)!;
    const two = world.balls.find((ball) => ball.number === 2)!;
    const diameter = TABLE.ballRadius * 2;
    cue.x = one.x = two.x = 0;
    cue.z = -diameter;
    one.z = 0;
    two.z = diameter;
    cue.vx = cue.vz = one.vx = one.vz = two.vx = 0;
    two.vz = -1;
    world.moving = true;

    stepWorld(world, PHYSICS_DT);

    // 数组配对顺序先检查 0-1，后检查 1-2；只有检测到纯 z 碰撞并再迭代，
    // 0 号才会在同一固定步收到从 2→1→0 的冲量。
    expect(cue.vz).toBeLessThan(-0.01);
  });

  it('库边反弹后仍在界内', () => {
    const world = createInitialWorld();
    strikeCueBall(world, 0.3, 90);
    simulateUntilStop(world, 60);
    for (const b of world.balls) {
      if (!b.active) continue;
      expect(Math.abs(b.x)).toBeLessThanOrEqual(TABLE.width / 2 + 0.001);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(TABLE.length / 2 + 0.001);
    }
  });

  it('开球后球堆被炸散', () => {
    const world = createInitialWorld();
    strikeCueBall(world, 0, 92);
    simulateUntilStop(world, 60);
    // 统计炸散程度：目标球相对原始球堆中心的平均距离
    const objects = world.balls.filter(b => b.active && b.number !== 0);
    const cx = objects.reduce((s, b) => s + b.x, 0) / objects.length;
    const cz = objects.reduce((s, b) => s + b.z, 0) / objects.length;
    const spread = objects.reduce((s, b) => s + Math.hypot(b.x - cx, b.z - cz), 0) / objects.length;
    expect(spread).toBeGreaterThan(0.25);
  });
});

describe('落袋检测测试', () => {
  it('六袋采用统一参数化口宽、圆弧角衬与台阶深度', () => {
    expect(TABLE.ballRadius * 2).toBeCloseTo(0.05715, 6);
    expect(POCKETS).toHaveLength(6);
    expect(POCKETS[0].mouthWidth).toBeCloseTo(activePocketMouthWidth.corner, 6);
    expect(POCKETS[2].mouthWidth).toBeCloseTo(activePocketMouthWidth.side, 6);
    expect(POCKETS[0].jawRadius).toBeCloseTo(0.102, 6);
    expect(POCKETS[2].jawRadius).toBeCloseTo(0.064, 6);
    expect(POCKETS[0].shelfDepth).toBeCloseTo(0.036, 6);
    expect(POCKETS[2].shelfDepth).toBeCloseTo(0.024, 6);
    expect(POCKETS[0].captureInset).toBeCloseTo(0.008, 6);
    expect(POCKETS[2].captureInset).toBeCloseTo(0.007, 6);
    expect(getPocketAimWindow(POCKETS[2]).halfWidth).toBeGreaterThan(0);
  });

  it('正对中袋的球可落袋，高速跨过窄捕获圈也不会穿透', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    const cue = getCueBall(world)!;
    cue.x = TABLE.width / 2 - TABLE.ballRadius - 0.08;
    cue.z = 0;
    cue.vx = 8.5;
    cue.vz = 0;
    world.moving = true;

    simulateUntilStop(world, 1);
    expect(cue.active).toBe(false);
    expect(world.events.some((event) => event.type === 'pocket' && event.pocket === 3)).toBe(true);
  });

  it('整段明确偏出中袋安全窗口的球应碰库，不应被圆弧吸走', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    const cue = getCueBall(world)!;
    cue.x = TABLE.width / 2 - TABLE.ballRadius - 0.08;
    cue.z = getPocketAimWindow(POCKETS[3]).halfWidth + 0.012;
    cue.vx = 1.2;
    cue.vz = 0;
    world.moving = true;

    simulateUntilStop(world, 3);
    expect(cue.active).toBe(true);
    expect(world.events.some((event) => event.type === 'cushion')).toBe(true);
    expect(world.events.some((event) => event.type === 'pocket')).toBe(false);
  });

  it('沿 45° 中心线进入角袋仍可正常落袋', () => {
    const world = createInitialWorld();
    for (const ball of world.balls) if (ball.number !== 0) ball.active = false;
    const cue = getCueBall(world)!;
    cue.x = TABLE.width / 2 - TABLE.ballRadius - 0.08;
    cue.z = TABLE.length / 2 - TABLE.ballRadius - 0.08;
    cue.vx = 1.2;
    cue.vz = 1.2;
    world.moving = true;

    simulateUntilStop(world, 2);
    expect(cue.active).toBe(false);
    expect(world.events.some((event) => event.type === 'pocket' && event.pocket === 5)).toBe(true);
  });

  it('白球落袋检测', () => {
    const world = createInitialWorld();
    const cue = getCueBall(world)!;
    cue.x = -TABLE.width / 2 + 0.01;
    cue.z = -TABLE.length / 2 + 0.01;
    strikeCueBall(world, -Math.PI / 4, 50);
    simulateUntilStop(world);
    expect(isCueBallPocketed(world)).toBe(true);
  });

  it('白球落袋后应标记为inactive', () => {
    const world = createInitialWorld();
    const cue = getCueBall(world)!;
    cue.x = -TABLE.width / 2 + 0.01;
    cue.z = -TABLE.length / 2 + 0.01;
    strikeCueBall(world, -Math.PI / 4, 50);
    simulateUntilStop(world);
    expect(cue.active).toBe(false);
  });

  it('模拟开球并打印落袋', () => {
    const world = createInitialWorld();
    strikeCueBall(world, 0, 88);
    simulateUntilStop(world);
    console.log('落袋球:', pocketedThisShot(world));
  });
});

describe('白球重置测试', () => {
  it('白球落袋后可以重置', () => {
    const world = createInitialWorld();
    const cue = getCueBall(world)!;
    cue.x = -TABLE.width / 2 + 0.01;
    cue.z = -TABLE.length / 2 + 0.01;
    strikeCueBall(world, -Math.PI / 4, 50);
    simulateUntilStop(world);
    expect(isCueBallPocketed(world)).toBe(true);

    respotCueBall(world);
    expect(cue.active).toBe(true);
    expect(cue.x).toBe(0);
    expect(cue.z).toBe(TABLE.length * 0.25);
    expect(cue.wy).toBe(0);
    expect(world.moving).toBe(false);
  });

  it('重置位置有边界限制', () => {
    const world = createInitialWorld();
    respotCueBall(world, 10, 10);
    const cue = getCueBall(world)!;
    expect(Math.abs(cue.x)).toBeLessThan(TABLE.width / 2);
    expect(Math.abs(cue.z)).toBeLessThan(TABLE.length / 2);
  });
});

describe('物理手感基准（打印指标）', () => {
  it('输出关键手感数据', () => {
    // 滚动距离 vs 力度
    for (const p of [10, 30, 50, 70, 100]) {
      const world = createInitialWorld();
      for (const b of world.balls) if (b.number !== 0) b.active = false;
      const cue = getCueBall(world)!;
      const z0 = cue.z;
      strikeCueBall(world, 0, p);
      simulateUntilStop(world, 90);
      console.log(`力度${p}: 滚动 ${(z0 - cue.z).toFixed(2)}m, 用时 ${world.time.toFixed(2)}s`);
    }

    // 低杆拉回距离
    {
      const world = createInitialWorld();
      for (const b of world.balls) if (b.number !== 0 && b.number !== 1) b.active = false;
      const cue = getCueBall(world)!;
      const one = world.balls.find(b => b.number === 1)!;
      cue.x = one.x;
      cue.z = one.z + 0.8;
      strikeCueBall(world, 0, 45, { x: -0.9, y: 0 });
      simulateUntilStop(world, 60);
      console.log(`低杆: 白球最终 z=${cue.z.toFixed(3)} (碰球点约 z=${(one.z).toFixed(2)})`);
    }
    expect(true).toBe(true);
  });
});

describe('瞄准方向约束', () => {
  it('开球区母球只能瞄准对面半台（负 z 半面）', () => {
    const cue = { x: 0.16, z: TABLE.length * 0.25 + 0.08 };
    // 朝球堆（0 rad）保留
    expect(clampAimToForwardHalf(cue, 0)).toBeCloseTo(0, 3);
    // 朝左/右库边界保留
    expect(clampAimToForwardHalf(cue, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 3);
    expect(clampAimToForwardHalf(cue, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 3);
    // 朝身后（正 z）被钳制到最近边界，不允许产生向后分量
    expect(clampAimToForwardHalf(cue, Math.PI)).toBeCloseTo(Math.PI / 2, 3);
    expect(clampAimToForwardHalf(cue, -Math.PI)).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('母球跑到对面半台时前方自动翻转', () => {
    const cue = { x: 0, z: -TABLE.length * 0.25 };
    // 此时“前方”是朝正 z，原朝球堆方向会被翻到身后边界
    expect(clampAimToForwardHalf(cue, 0)).toBeCloseTo(-Math.PI / 2, 3);
    expect(clampAimToForwardHalf(cue, Math.PI)).toBeCloseTo(Math.PI, 3);
  });
});
