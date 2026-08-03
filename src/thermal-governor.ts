/*
[INPUT]: WebGL GPU/CPU 单帧耗时、实际渲染帧间隔与当前目标帧率
[OUTPUT]: 带滞回和静止恢复的 balanced/warm/hot 温控档位与可诊断快照
[POS]: 纯性能策略状态机；不依赖 Three.js、React 或浏览器全局
[PROTOCOL]: 阈值或档位语义变化时，同步更新 thermal-governor.test.ts 与 src/CLAUDE.md
*/

import type { RenderQualityTier } from './render-policy';

export type ThermalSampleSource = 'gpu-timer' | 'cpu-fallback';

export type ThermalSample = {
  nowMs: number;
  renderMs: number;
  frameIntervalMs: number | null;
  source: ThermalSampleSource;
};

export type ThermalSnapshot = {
  tier: RenderQualityTier;
  source: ThermalSampleSource | 'none';
  estimatedGpuDuty: number;
  droppedFrameRatio: number;
  averageRenderMs: number;
  targetFps: number;
};

const WINDOW_MS = 2000;
const HIGH_DUTY = 0.45;
const SEVERE_DUTY = 0.72;
const COOL_DUTY = 0.28;
const HIGH_DROP_RATIO = 0.15;
const SEVERE_DROP_RATIO = 0.35;
const COOL_DROP_RATIO = 0.05;
export const THERMAL_IDLE_RECOVERY_MS = 2500;

export function createThermalGovernor(initialTargetFps: number) {
  let tier: RenderQualityTier = 'balanced';
  let targetFps = Math.max(1, initialTargetFps);
  let windowStartedAt: number | null = null;
  let renderTotalMs = 0;
  let renderSamples = 0;
  let intervalSamples = 0;
  let droppedFrames = 0;
  let highWindows = 0;
  let severeWindows = 0;
  let coolWindows = 0;
  let lastActiveSampleAt: number | null = null;
  let snapshot: ThermalSnapshot = {
    tier,
    source: 'none',
    estimatedGpuDuty: 0,
    droppedFrameRatio: 0,
    averageRenderMs: 0,
    targetFps,
  };

  const resetWindow = (nowMs: number) => {
    windowStartedAt = nowMs;
    renderTotalMs = 0;
    renderSamples = 0;
    intervalSamples = 0;
    droppedFrames = 0;
  };

  return {
    setTargetFps(nextTargetFps: number) {
      targetFps = Math.max(1, nextTargetFps);
      snapshot = { ...snapshot, targetFps };
    },

    sample(sample: ThermalSample): RenderQualityTier | null {
      if (!Number.isFinite(sample.nowMs) || !Number.isFinite(sample.renderMs)) return null;
      lastActiveSampleAt = sample.nowMs;
      if (windowStartedAt === null) resetWindow(sample.nowMs);

      renderTotalMs += Math.max(0, sample.renderMs);
      renderSamples += 1;
      if (sample.frameIntervalMs !== null && Number.isFinite(sample.frameIntervalMs)) {
        intervalSamples += 1;
        const expectedInterval = 1000 / targetFps;
        if (sample.frameIntervalMs > expectedInterval * 1.45) droppedFrames += 1;
      }

      if (sample.nowMs - (windowStartedAt ?? sample.nowMs) < WINDOW_MS) return null;

      const averageRenderMs = renderSamples > 0 ? renderTotalMs / renderSamples : 0;
      const estimatedGpuDuty = Math.min(1, averageRenderMs * targetFps / 1000);
      const droppedFrameRatio = intervalSamples > 0 ? droppedFrames / intervalSamples : 0;
      const severe = estimatedGpuDuty >= SEVERE_DUTY || droppedFrameRatio >= SEVERE_DROP_RATIO;
      const high = severe || estimatedGpuDuty >= HIGH_DUTY || droppedFrameRatio >= HIGH_DROP_RATIO;
      const cool = estimatedGpuDuty <= COOL_DUTY && droppedFrameRatio <= COOL_DROP_RATIO;

      snapshot = {
        tier,
        source: sample.source,
        estimatedGpuDuty,
        droppedFrameRatio,
        averageRenderMs,
        targetFps,
      };
      resetWindow(sample.nowMs);

      severeWindows = severe ? severeWindows + 1 : 0;
      highWindows = high ? highWindows + 1 : 0;
      coolWindows = cool ? coolWindows + 1 : 0;

      let nextTier = tier;
      if (tier === 'balanced' && highWindows >= 2) nextTier = 'warm';
      else if (tier === 'warm' && (severeWindows >= 2 || highWindows >= 3)) nextTier = 'hot';
      else if (tier === 'hot' && coolWindows >= 3) nextTier = 'warm';
      else if (tier === 'warm' && coolWindows >= 4) nextTier = 'balanced';

      if (nextTier === tier) return null;
      tier = nextTier;
      snapshot = { ...snapshot, tier };
      highWindows = 0;
      severeWindows = 0;
      coolWindows = 0;
      return tier;
    },

    /** 按需渲染停帧代表 GPU 已无连续工作，静置一段时间后逐级恢复清晰度。 */
    recoverAfterIdle(nowMs: number): RenderQualityTier | null {
      if (
        tier === 'balanced' ||
        !Number.isFinite(nowMs) ||
        lastActiveSampleAt === null ||
        nowMs - lastActiveSampleAt < THERMAL_IDLE_RECOVERY_MS
      ) {
        return null;
      }

      tier = tier === 'hot' ? 'warm' : 'balanced';
      lastActiveSampleAt = nowMs;
      highWindows = 0;
      severeWindows = 0;
      coolWindows = 0;
      snapshot = {
        ...snapshot,
        tier,
        source: 'none',
        estimatedGpuDuty: 0,
        droppedFrameRatio: 0,
        averageRenderMs: 0,
      };
      return tier;
    },

    snapshot(): ThermalSnapshot {
      return { ...snapshot, tier, targetFps };
    },
  };
}
