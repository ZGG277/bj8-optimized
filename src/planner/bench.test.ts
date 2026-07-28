/*
[INPUT]: 依赖 vitest 与 ../physics 的世界创建、击球与步进接口
[OUTPUT]: 对外提供单杆全仿真耗时 benchmark（无导出），为走位规划搜索定采样预算
[POS]: 规划层的性能基线：240Hz 与降频仿真的单杆成本对比
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { describe, it } from 'vitest';
import {
  createInitialWorld,
  cloneWorld,
  strikeCueBall,
  simulateUntilStop,
  stepWorld,
} from '../physics';

// 临时 benchmark：测单杆全仿真的耗时（240Hz 与降频版），为走位规划搜索定采样预算。
function bench(label: string, fn: () => void, iters: number) {
  // warmup
  for (let i = 0; i < Math.min(5, iters); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`[bench] ${label}: ${ms.toFixed(2)} ms/iter (${iters} iters)`);
}

function simAtRate(base: ReturnType<typeof createInitialWorld>, rate: number) {
  const w = cloneWorld(base);
  strikeCueBall(w, 0.3, 55);
  if (rate === 240) {
    simulateUntilStop(w);
    return;
  }
  const dt = 1 / rate;
  const maxSteps = Math.ceil(30 * rate);
  for (let i = 0; i < maxSteps && w.moving; i++) stepWorld(w, dt);
}

describe('planner benchmark', () => {
  it('single shot sim cost', () => {
    const base = createInitialWorld();
    bench('sim 240Hz (simulateUntilStop)', () => simAtRate(base, 240), 30);
    bench('sim 120Hz (stepWorld dt=1/120)', () => simAtRate(base, 120), 30);
    bench('sim 60Hz (stepWorld dt=1/60)', () => simAtRate(base, 60), 30);
    bench('cloneWorld only', () => { cloneWorld(base); }, 1000);
  });
});
