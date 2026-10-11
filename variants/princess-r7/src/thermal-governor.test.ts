/*
[INPUT]: thermal-governor 纯状态机与 vitest
[OUTPUT]: 高负载降档、严重负载再降档、活动低压与停帧静置逐级恢复回归
[POS]: 自适应 GPU 温控策略回归测试
[PROTOCOL]: 档位阈值变化时同步更新本文件与 thermal-governor.ts 头部
*/
import { describe, expect, it } from 'vitest';
import {
  THERMAL_IDLE_RECOVERY_MS,
  createThermalGovernor,
} from './thermal-governor';

function feedWindows(
  governor: ReturnType<typeof createThermalGovernor>,
  startMs: number,
  windows: number,
  renderMs: number,
  frameIntervalMs: number,
) {
  let now = startMs;
  const tiers: string[] = [];
  for (let window = 0; window < windows; window += 1) {
    for (let sample = 0; sample < 5; sample += 1) {
      now += 500;
      const tier = governor.sample({
        nowMs: now,
        renderMs,
        frameIntervalMs,
        source: 'gpu-timer',
      });
      if (tier) tiers.push(tier);
    }
  }
  return { now, tiers };
}

describe('thermal governor', () => {
  it('持续高 GPU duty 会从均衡档降到温控档', () => {
    const governor = createThermalGovernor(30);
    const result = feedWindows(governor, 0, 3, 18, 1000 / 30);
    expect(result.tiers).toContain('warm');
    expect(governor.snapshot().tier).toBe('warm');
  });

  it('温控档仍持续严重负载时进入降温档', () => {
    const governor = createThermalGovernor(30);
    const warm = feedWindows(governor, 0, 3, 18, 1000 / 30);
    governor.setTargetFps(24);
    const hot = feedWindows(governor, warm.now, 3, 34, 1000 / 24);
    expect(hot.tiers).toContain('hot');
    expect(governor.snapshot().tier).toBe('hot');
  });

  it('降档后需多个低压窗口才逐级恢复，避免画质抖动', () => {
    const governor = createThermalGovernor(30);
    let result = feedWindows(governor, 0, 3, 18, 1000 / 30);
    governor.setTargetFps(24);
    result = feedWindows(governor, result.now, 3, 34, 1000 / 24);
    governor.setTargetFps(20);
    result = feedWindows(governor, result.now, 3, 2, 1000 / 20);
    expect(result.tiers).toContain('warm');
    expect(governor.snapshot().tier).toBe('warm');

    governor.setTargetFps(24);
    result = feedWindows(governor, result.now, 4, 2, 1000 / 24);
    expect(result.tiers).toContain('balanced');
    expect(governor.snapshot().tier).toBe('balanced');
  });

  it('按需渲染停帧后按冷却间隔逐级恢复，不会永久停在低清档', () => {
    const governor = createThermalGovernor(45);
    let result = feedWindows(governor, 0, 3, 15, 1000 / 45);
    governor.setTargetFps(30);
    result = feedWindows(governor, result.now, 3, 34, 1000 / 30);
    expect(governor.snapshot().tier).toBe('hot');

    expect(governor.recoverAfterIdle(result.now + THERMAL_IDLE_RECOVERY_MS - 1)).toBeNull();
    expect(governor.recoverAfterIdle(result.now + THERMAL_IDLE_RECOVERY_MS)).toBe('warm');
    governor.setTargetFps(30);
    expect(governor.recoverAfterIdle(result.now + THERMAL_IDLE_RECOVERY_MS * 2)).toBe('balanced');
    expect(governor.snapshot()).toMatchObject({
      tier: 'balanced',
      source: 'none',
      estimatedGpuDuty: 0,
    });
  });
});
