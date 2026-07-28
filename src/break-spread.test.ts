/*
[INPUT]: 依赖 vitest 与 physics 物理内核的摆球/出杆/仿真接口
[OUTPUT]: 对外提供开球球堆散开程度的可失败断言（无导出），由 npm run check 执行
[POS]: 物理层回归网：锁定"叉路联立求解"修复后的开球散开指标，防索引序动量漏斗回潮
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/*
 * 开球散开回归（2026-07-28 叉路联立修复）。
 * 基线（修复前）：位移>0.1m 均值 9.1/15，spread 均值 0.383，峰值速度呈"单球火箭+其余蠕行"；
 * 修复后实测（12 种子）：位移均值 12.3（单种子最低 10）、spread 均值 0.537（单种子最低 0.363）、
 * 每局至少 2 球峰值 ≥4.1 m/s。阈值取自实测分布并留有余量。
 */
import { describe, it, expect } from 'vitest';
import {
  createInitialWorld,
  strikeCueBall,
  stepWorld,
  simulateUntilStop,
  PHYSICS_DT,
  type BilliardsWorld,
} from './physics';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 瞄顶球满力开球，统计散开指标 */
function breakStats(world: BilliardsWorld) {
  const initial = world.balls.map((b) => ({ n: b.number, x: b.x, z: b.z }));
  const objects0 = initial.filter((b) => b.n !== 0);
  const cx0 = objects0.reduce((s, b) => s + b.x, 0) / objects0.length;
  const cz0 = objects0.reduce((s, b) => s + b.z, 0) / objects0.length;
  const spread0 = objects0.reduce((s, b) => s + Math.hypot(b.x - cx0, b.z - cz0), 0) / objects0.length;

  const cue = world.balls.find((b) => b.number === 0)!;
  const apex = world.balls.filter((b) => b.number !== 0).reduce((m, b) => (b.z > m.z ? b : m));
  strikeCueBall(world, Math.atan2(apex.x - cue.x, -(apex.z - cue.z)), 92);

  const peakSpeed = new Map<number, number>();
  let guard = 0;
  while (world.moving && guard++ < 240 * 90) {
    stepWorld(world, PHYSICS_DT);
    for (const b of world.balls) {
      if (!b.active || b.number === 0) continue;
      peakSpeed.set(b.number, Math.max(peakSpeed.get(b.number) ?? 0, Math.hypot(b.vx, b.vz)));
    }
  }

  const objects = world.balls.filter((b) => b.active && b.number !== 0);
  const cx = objects.reduce((s, b) => s + b.x, 0) / objects.length;
  const cz = objects.reduce((s, b) => s + b.z, 0) / objects.length;
  const spread1 = objects.reduce((s, b) => s + Math.hypot(b.x - cx, b.z - cz), 0) / objects.length;

  let displaced = 0;
  for (const b of world.balls) {
    if (b.number === 0 || !b.active) continue;
    const i0 = initial.find((p) => p.n === b.number)!;
    if (Math.hypot(b.x - i0.x, b.z - i0.z) > 0.1) displaced += 1;
  }
  const peaks = [...peakSpeed.values()];
  return { displaced, spread0, spread1, peaks };
}

describe('开球球堆散开回归', () => {
  it('固定摆法：球堆明显炸散', () => {
    const s = breakStats(createInitialWorld());
    // 实测：位移 15/15，spread 0.082→0.597
    expect(s.displaced).toBeGreaterThanOrEqual(12);
    expect(s.spread1).toBeGreaterThan(0.45);
    expect(s.spread1 / s.spread0).toBeGreaterThan(5);
  });

  it('随机摆法 8 种子：位移与分散度稳定在健康区间', () => {
    let displacedSum = 0;
    let spreadSum = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      const s = breakStats(createInitialWorld(mulberry32(seed)));
      // 实测单种子最低：位移 10、spread 0.363；阈值留余量
      expect(s.displaced).toBeGreaterThanOrEqual(8);
      expect(s.spread1).toBeGreaterThan(0.28);
      displacedSum += s.displaced;
      spreadSum += s.spread1;
    }
    // 实测均值：位移 12.3、spread 0.537
    expect(displacedSum / 8).toBeGreaterThanOrEqual(10);
    expect(spreadSum / 8).toBeGreaterThan(0.45);
  });

  it('峰值速度分布：多球获得实质速度且无能量创生', () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const s = breakStats(createInitialWorld(mulberry32(seed)));
      // 防"单球火箭+球堆蠕行"回潮：至少 2 球峰值 ≥2.5（实测每局 top2 ≥4.1）
      expect(s.peaks.filter((v) => v >= 2.5).length).toBeGreaterThanOrEqual(2);
      // 出杆速度 9.23 m/s，任何球峰值不得明显超出（能量守恒护栏，实测最高 7.8）
      expect(Math.max(...s.peaks)).toBeLessThan(9.4);
    }
  });

  it('开球仿真必定收敛停止（防永动）', () => {
    const world = createInitialWorld(mulberry32(42));
    simulateUntilStop(world, 90);
    expect(world.moving).toBe(false);
    expect(world.time).toBeLessThan(90);
  });
});
