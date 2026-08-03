/*
[INPUT]: 展示最小帧间隔与 rAF 时间戳
[OUTPUT]: 对外输出可热更新间隔的有界展示发布节流器，不改变物理步进
[POS]: 模拟展示策略纯函数，供 React Hook 装配与单测
[PROTOCOL]: 节流语义变化时同步更新 presentation-cadence.test.ts
*/

export function createPresentationCadence(minIntervalMs: number) {
  let interval = Number.isFinite(minIntervalMs) ? Math.max(0, minIntervalMs) : 0;
  let lastPublishedAt = Number.NEGATIVE_INFINITY;

  return {
    shouldPublish(nowMs: number): boolean {
      if (interval === 0 || nowMs - lastPublishedAt + 0.01 >= interval) {
        lastPublishedAt = nowMs;
        return true;
      }
      return false;
    },
    reset(): void {
      lastPublishedAt = Number.NEGATIVE_INFINITY;
    },
    setIntervalMs(nextIntervalMs: number): void {
      interval = Number.isFinite(nextIntervalMs) ? Math.max(0, nextIntervalMs) : 0;
    },
  };
}
