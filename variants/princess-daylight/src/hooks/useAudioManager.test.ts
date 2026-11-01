import { describe, expect, it } from 'vitest';
import type { PhysicsEvent } from '../physics';
import { selectPhysicsAudioEvents } from './useAudioManager';

const collision = (speed: number): PhysicsEvent => ({ type: 'ball-collision', first: 0, second: 1, time: 0, speed });
const cushion = (speed: number): PhysicsEvent => ({ type: 'cushion', ball: 1, time: 0, speed });
const pocket = (speed: number, ball = 1): PhysicsEvent => ({
  type: 'pocket', ball, pocket: 0, time: 0, speed,
  entryX: 0, entryZ: 0, entryVx: speed, entryVz: 0,
});

describe('物理展示批次音效选择', () => {
  it('球碰与碰库各保留最强事件，不让先到的弱碰吞掉强碰', () => {
    const selected = selectPhysicsAudioEvents([collision(1), cushion(2), collision(4)]);
    expect(selected).toEqual([collision(4), cushion(2)]);
  });

  it('保留每个落袋并忽略非声音事件', () => {
    const firstContact: PhysicsEvent = { type: 'first-contact', ball: 1, time: 0, speed: 3 };
    expect(selectPhysicsAudioEvents([pocket(1), firstContact, pocket(2, 2)])).toEqual([pocket(1), pocket(2, 2)]);
  });
});
