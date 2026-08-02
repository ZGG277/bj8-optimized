/*
[INPUT]: presentation-cadence 纯函数与 vitest
[OUTPUT]: 验证高刷新输入按 60Hz 发布展示快照且可重置
[POS]: 移动端运动帧降载回归测试
[PROTOCOL]: 发布语义变化时同步更新本文件与 presentation-cadence.ts
*/
import { describe, expect, it } from 'vitest';
import { createPresentationCadence } from './presentation-cadence';

describe('presentation cadence', () => {
  it('120Hz 物理调度下发布约 60Hz 快照', () => {
    const cadence = createPresentationCadence(1000 / 60);
    const published = Array.from({ length: 121 }, (_, index) => index * (1000 / 120))
      .filter(now => cadence.shouldPublish(now));
    expect(published.length).toBeGreaterThanOrEqual(60);
    expect(published.length).toBeLessThanOrEqual(61);
  });

  it('重置后下一帧立即可发布', () => {
    const cadence = createPresentationCadence(100);
    expect(cadence.shouldPublish(0)).toBe(true);
    expect(cadence.shouldPublish(20)).toBe(false);
    cadence.reset();
    expect(cadence.shouldPublish(20)).toBe(true);
  });
});
