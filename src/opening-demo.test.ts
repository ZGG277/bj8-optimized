import { describe, expect, it } from 'vitest';
import {
  OPENING_DEMO_DURATION_MS,
  OPENING_DEMO_FAR_DISTANCE,
  openingDemoCopyForWorld,
  openingDemoEnabledForWorld,
  openingDemoFrame,
} from './opening-demo';

const handoff = {
  position: { x: 0.015, y: 0.16, z: 1.42 },
  lookAt: { x: 0, y: 0.03, z: 0.28 },
};

describe('opening demo camera path', () => {
  it('湖面、云海都触发开场，室内不开场', () => {
    expect(openingDemoEnabledForWorld('lake')).toBe(true);
    expect(openingDemoEnabledForWorld('cloud-sea')).toBe(true);
    expect(openingDemoEnabledForWorld('studio')).toBe(false);
  });

  it('湖面开场文案：湖面正在亮起 / 向湖心靠近', () => {
    expect(openingDemoCopyForWorld('lake')).toEqual({
      title: '湖面正在亮起',
      subtitle: '向湖心靠近',
    });
  });

  it('云海开场文案：云海正在亮起 / 穿过云海', () => {
    expect(openingDemoCopyForWorld('cloud-sea')).toEqual({
      title: '云海正在亮起',
      subtitle: '穿过云海',
    });
  });

  it('室内世界不开场，文案为 null', () => {
    expect(openingDemoCopyForWorld('studio')).toBeNull();
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
