/*
[INPUT]: 依赖 vitest 与 physics 的确定/随机摆球、击球和停止仿真接口
[OUTPUT]: 开球结果确定性、随机落袋组合与球堆分布方差回归
[POS]: 物理随机性可失败测试网，不参与运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 验证：相同力度/角度开球时，结果是否过于相似。
 * 指标：落袋球列表、首进球号、球堆最终分布的方差。
 */
import { describe, it, expect } from 'vitest';
import {
  createInitialWorld,
  strikeCueBall,
  simulateUntilStop,
  pocketedThisShot,
  type BilliardsWorld,
} from './physics';

function breakOutcome(world: BilliardsWorld) {
  const pocketed = pocketedThisShot(world).slice().sort((a, b) => a - b);
  const active = world.balls.filter((b) => b.active && b.number !== 0);
  const cx = active.reduce((s, b) => s + b.x, 0) / active.length;
  const cz = active.reduce((s, b) => s + b.z, 0) / active.length;
  const spread = active.reduce((s, b) => s + Math.hypot(b.x - cx, b.z - cz), 0) / active.length;
  return {
    pocketedKey: pocketed.join(','),
    pocketedCount: pocketed.length,
    firstPocketed: pocketed[0] ?? null,
    spread,
    positions: active.map((b) => ({ n: b.number, x: b.x, z: b.z })),
  };
}

function runBreak(seed: number, power = 92, angle = 0) {
  // 用确定性的伪随机，方便复现
  const rng = mulberry32(seed);
  const world = createInitialWorld(rng);
  strikeCueBall(world, angle, power);
  simulateUntilStop(world, 90);
  return breakOutcome(world);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('开球结果差异性验证', () => {
  it('确定性摆法：同力度 10 局结果完全相同', () => {
    const results = Array.from({ length: 10 }, () => {
      const world = createInitialWorld(); // 无 rng，固定摆法
      strikeCueBall(world, 0, 92);
      simulateUntilStop(world, 90);
      return breakOutcome(world);
    });
    const keys = new Set(results.map((r) => r.pocketedKey));
    expect(keys.size).toBe(1);
  });

  it('随机摆法：同力度连续 30 局应有不同落袋结果', () => {
    const results = Array.from({ length: 30 }, (_, i) => runBreak(i + 1));
    const keys = new Set(results.map((r) => r.pocketedKey));
    const counts = results.map((r) => r.pocketedCount);
    const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    const maxCount = Math.max(...counts);

    console.log('=== 随机摆法同力度开球结果 ===');
    console.log('不同落袋组合数:', keys.size, '/ 30');
    console.log('平均落袋数:', avgCount.toFixed(2));
    console.log('最大单局落袋数:', maxCount);
    console.log('前 8 局落袋:', results.slice(0, 8).map((r) => `[${r.pocketedKey || '-'}]`).join(' '));

    // 如果 30 局落袋组合完全相同，说明抖动不足或物理仍过对称
    expect(keys.size).toBeGreaterThan(1);
  });

  it('随机摆法：球堆最终分布不应完全相同', () => {
    const spreads = Array.from({ length: 20 }, (_, i) => runBreak(i + 100).spread);
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const variance = spreads.reduce((a, b) => a + (b - mean) ** 2, 0) / spreads.length;

    console.log('=== 球堆分布方差 ===');
    console.log('平均 spread:', mean.toFixed(3));
    console.log('spread 方差:', variance.toFixed(6));

    expect(variance).toBeGreaterThan(0.0001);
  });
});
