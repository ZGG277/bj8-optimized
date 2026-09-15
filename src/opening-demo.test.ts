import { describe, expect, it } from 'vitest';
import {
  OPENING_DEMO_DURATION_MS,
  OPENING_DEMO_FAR_DISTANCE,
  openingDemoEnabledForSearch,
  openingDemoFrame,
} from './opening-demo';

const handoff = {
  position: { x: 0.015, y: 0.16, z: 1.42 },
  lookAt: { x: 0, y: 0.03, z: 0.28 },
};

describe('opening demo camera path', () => {
  it('正式无参数入口与湖面入口播放一次开场，显式其他世界保持原入口', () => {
    expect(openingDemoEnabledForSearch('')).toBe(true);
    expect(openingDemoEnabledForSearch('?world=lake')).toBe(true);
    expect(openingDemoEnabledForSearch('?lake360=1')).toBe(true);
    expect(openingDemoEnabledForSearch('?world=studio')).toBe(false);
    expect(openingDemoEnabledForSearch('?world=cloud-sea')).toBe(false);
    expect(openingDemoEnabledForSearch('?openingDemo=0')).toBe(false);
  });

  it('约 5 秒并从远处连续靠近现有相机终点', () => {
    expect(OPENING_DEMO_DURATION_MS).toBe(5000);
    const frames = Array.from({ length: 101 }, (_, index) => openingDemoFrame(index / 100, handoff));
    expect(frames[0].distanceToHandoff).toBeGreaterThan(OPENING_DEMO_FAR_DISTANCE - 0.5);
    for (let index = 1; index < frames.length; index += 1) {
      expect(frames[index].distanceToHandoff).toBeLessThanOrEqual(
        frames[index - 1].distanceToHandoff + 1e-9,
      );
    }
  });

  it('末帧逐项等于现有可操作相机，不需要切镜头', () => {
    const end = openingDemoFrame(1, handoff);
    expect(end.position).toEqual(handoff.position);
    expect(end.lookAt).toEqual(handoff.lookAt);
    expect(end.distanceToHandoff).toBe(0);
  });

  it('首尾速度收敛且越界时间被安全钳制', () => {
    expect(openingDemoFrame(-1, handoff)).toEqual(openingDemoFrame(0, handoff));
    expect(openingDemoFrame(2, handoff)).toEqual(openingDemoFrame(1, handoff));
    const startStep = openingDemoFrame(0.001, handoff).distanceToHandoff;
    const start = openingDemoFrame(0, handoff).distanceToHandoff;
    const endStep = openingDemoFrame(0.999, handoff).distanceToHandoff;
    expect(start - startStep).toBeLessThan(0.00001);
    expect(endStep).toBeLessThan(0.00001);
  });
});
