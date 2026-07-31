/*
[INPUT]: 依赖 physics 公共袋口几何、固定步仿真与 vitest
[OUTPUT]: 对外提供六袋对称、安全入口、擦角/挂袋及高速防穿透回归（无导出）
[POS]: 袋口视觉与物理统一模型的验收网；入口预测必须能由真实物理复现
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import {
  PHYSICS_DT,
  POCKETS,
  TABLE,
  createInitialWorld,
  POCKET_MOUTH_PRESET,
  POCKET_MOUTH_WIDTH_PRESETS,
  getCueBall,
  getPocketAimWindow,
  isInsidePocketShelf,
  pocketLocalToWorld,
  simulateUntilStop,
  stepWorld,
  type BilliardsWorld,
  type PocketGeometry,
} from '../physics';

const activePocketMouthWidth = POCKET_MOUTH_WIDTH_PRESETS[POCKET_MOUTH_PRESET];

function isolatedWorld(): BilliardsWorld {
  const world = createInitialWorld();
  for (const ball of world.balls) {
    if (ball.number !== 0) ball.active = false;
  }
  return world;
}

function sendBallToPocket(
  pocket: PocketGeometry,
  speed: number,
  lateral = 0,
): BilliardsWorld {
  const world = isolatedWorld();
  const cue = getCueBall(world)!;
  const start = pocketLocalToWorld(pocket, -0.055, lateral);
  cue.x = start.x;
  cue.z = start.z;
  cue.vx = pocket.outward.x * speed;
  cue.vz = pocket.outward.z * speed;
  world.moving = true;
  simulateUntilStop(world, 4);
  return world;
}

function isInLegalTableArea(x: number, z: number): boolean {
  const insideRectangle =
    Math.abs(x) <= TABLE.width / 2 - TABLE.ballRadius + 0.001 &&
    Math.abs(z) <= TABLE.length / 2 - TABLE.ballRadius + 0.001;
  return insideRectangle || POCKETS.some(pocket => isInsidePocketShelf(pocket, { x, z }));
}

describe('PocketGeometry 参数与六袋对称', () => {
  it('不同口袋版本切换配置可复用', () => {
    expect(activePocketMouthWidth.corner).toBeGreaterThan(0);
    expect(activePocketMouthWidth.side).toBeGreaterThan(0);
  });

  it('保持既有索引/中心坐标，并按角袋和中袋镜像', () => {
    expect(POCKETS.map(pocket => [pocket.x, pocket.z])).toEqual([
      [-TABLE.width / 2, -TABLE.length / 2],
      [TABLE.width / 2, -TABLE.length / 2],
      [-TABLE.width / 2, 0],
      [TABLE.width / 2, 0],
      [-TABLE.width / 2, TABLE.length / 2],
      [TABLE.width / 2, TABLE.length / 2],
    ]);
    expect(POCKETS[0].mouthWidth).toBe(POCKETS[1].mouthWidth);
    expect(POCKETS.filter(pocket => pocket.kind === 'corner')
      .every(pocket => pocket.mouthWidth === activePocketMouthWidth.corner)).toBe(true);
    expect(POCKETS.filter(pocket => pocket.kind === 'side')
      .every(pocket => pocket.mouthWidth === activePocketMouthWidth.side)).toBe(true);
    expect(POCKETS[0].jawRadius).toBe(POCKETS[5].jawRadius);
    expect(POCKETS[2].shelfDepth).toBe(POCKETS[3].shelfDepth);
    expect(POCKETS.every(pocket => pocket.jawSegments.length === 24)).toBe(true);
  });

  it('六袋安全窗口与口径配置一致', () => {
    const expectedCornerHalfWidth = activePocketMouthWidth.corner / 2 - TABLE.ballRadius - 0.00075;
    const expectedSideHalfWidth = activePocketMouthWidth.side / 2 - TABLE.ballRadius - 0.00075;

    for (const pocket of POCKETS.filter(item => item.kind === 'corner')) {
      expect(getPocketAimWindow(pocket).halfWidth)
        .toBeCloseTo(expectedCornerHalfWidth, 8);
      const world = sendBallToPocket(
        pocket,
        1.6,
        expectedCornerHalfWidth + 0.0005,
      );
      expect(getCueBall(world)?.active, `corner=${pocket.index}`).toBe(false);
      expect(world.events.some(event =>
        event.type === 'pocket' && event.pocket === pocket.index)).toBe(true);
    }

    for (const pocket of POCKETS.filter(item => item.kind === 'side')) {
      expect(getPocketAimWindow(pocket).halfWidth)
        .toBeCloseTo(expectedSideHalfWidth, 8);
      const world = sendBallToPocket(
        pocket,
        1.6,
        expectedSideHalfWidth + 0.0005,
      );
      expect(getCueBall(world)?.active, `side=${pocket.index}`).toBe(false);
      expect(world.events.some(event =>
        event.type === 'pocket' && event.pocket === pocket.index)).toBe(true);
    }
  });

  it('安全窗口由口宽和球半径推导，左右边界严格对称', () => {
    for (const pocket of POCKETS) {
      const window = getPocketAimWindow(pocket);
      expect(window.halfWidth).toBeCloseTo(
        pocket.mouthHalfWidth - TABLE.ballRadius - 0.00075,
        8,
      );
      expect((window.left.x + window.right.x) / 2).toBeCloseTo(window.center.x, 8);
      expect((window.left.z + window.right.z) / 2).toBeCloseTo(window.center.z, 8);
    }
  });
});

describe('袋口扫掠、台阶与不可返回线', () => {
  it('六袋在慢/中/高速下，中心及安全窗口左右边界均真实落袋', () => {
    for (const pocket of POCKETS) {
      const window = getPocketAimWindow(pocket);
      for (const speed of [0.55, 1.6, 9]) {
        for (const lateral of [-window.halfWidth, 0, window.halfWidth]) {
          const world = sendBallToPocket(pocket, speed, lateral);
          const cue = getCueBall(world)!;
          expect(cue.active, `pocket=${pocket.index}, speed=${speed}, lateral=${lateral}`)
            .toBe(false);
          expect(world.events.some(
            event => event.type === 'pocket' && event.pocket === pocket.index,
          )).toBe(true);
        }
      }
    }
  });

  it('安全窗口外的直线来球撞袋角并留在合法区域', () => {
    for (const pocket of POCKETS) {
      const outside = getPocketAimWindow(pocket).halfWidth + 0.008;
      for (const lateral of [-outside, outside]) {
        const world = sendBallToPocket(pocket, 1.6, lateral);
        const cue = getCueBall(world)!;
        expect(cue.active, `pocket=${pocket.index}, lateral=${lateral}`).toBe(true);
        expect(
          world.events.some(event => event.type === 'cushion'),
          `missing cushion: pocket=${pocket.index}, lateral=${lateral}`,
        ).toBe(true);
        expect(
          world.events.some(event => event.type === 'pocket'),
          `unexpected pocket: pocket=${pocket.index}, lateral=${lateral}`,
        ).toBe(false);
        expect(
          isInLegalTableArea(cue.x, cue.z),
          `left legal area: pocket=${pocket.index}, lateral=${lateral}, final=(${cue.x},${cue.z})`,
        ).toBe(true);
      }
    }
  });

  it('球可停在台阶上，不会被静态捕获区吸走', () => {
    for (const pocket of POCKETS) {
      const world = isolatedWorld();
      const cue = getCueBall(world)!;
      const hanging = pocketLocalToWorld(pocket, pocket.shelfDepth * 0.45, 0);
      cue.x = hanging.x;
      cue.z = hanging.z;
      stepWorld(world, PHYSICS_DT);
      expect(cue.active).toBe(true);
      expect(isInsidePocketShelf(pocket, cue)).toBe(true);
      expect(world.events.some(event => event.type === 'pocket')).toBe(false);
    }
  });

  it('高速越过不可返回线不穿透，并记录真实入袋位置与速度', () => {
    for (const pocket of POCKETS) {
      const world = sendBallToPocket(pocket, 14);
      const event = world.events.find(
        item => item.type === 'pocket' && item.pocket === pocket.index,
      );
      expect(event?.type).toBe('pocket');
      if (event?.type !== 'pocket') continue;
      expect(Math.hypot(event.entryVx, event.entryVz)).toBeGreaterThan(5);
      expect(isInsidePocketShelf(pocket, {
        x: event.entryX,
        z: event.entryZ,
      })).toBe(true);
    }
  });

  it('带侧旋擦角仍产生真实碰库，活动球最终不滞留桌外', () => {
    for (const pocket of [POCKETS[0], POCKETS[2], POCKETS[5]]) {
      const world = isolatedWorld();
      const cue = getCueBall(world)!;
      const lateral = getPocketAimWindow(pocket).halfWidth + 0.01;
      const start = pocketLocalToWorld(pocket, -0.05, lateral);
      cue.x = start.x;
      cue.z = start.z;
      cue.vx = pocket.outward.x * 2.2;
      cue.vz = pocket.outward.z * 2.2;
      cue.wy = 38;
      world.moving = true;
      simulateUntilStop(world, 5);
      expect(world.events.some(event => event.type === 'cushion')).toBe(true);
      if (cue.active) expect(isInLegalTableArea(cue.x, cue.z)).toBe(true);
    }
  });
});
