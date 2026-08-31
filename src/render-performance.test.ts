import { describe, expect, it } from 'vitest';
import {
  SCENE_RENDER_FPS,
  claimFrameSlot,
  preferredPixelRatio,
} from './render-performance';

describe('render performance policy', () => {
  it('caps coarse-pointer devices at 1x and desktop displays at 1.5x', () => {
    expect(preferredPixelRatio(3, true)).toBe(1);
    expect(preferredPixelRatio(2, false)).toBe(1.5);
    expect(preferredPixelRatio(1.25, false)).toBe(1.25);
    expect(preferredPixelRatio(0, false)).toBe(1);
  });

  it('keeps a corrected frame clock instead of drifting on high-refresh displays', () => {
    let slot: number | null = null;
    let renders = 0;
    for (let frame = 1; frame <= 144; frame += 1) {
      const now = frame * (1000 / 144);
      const next = claimFrameSlot(now, slot, SCENE_RENDER_FPS);
      if (next === null) continue;
      slot = next;
      renders += 1;
    }
    expect(renders).toBeGreaterThanOrEqual(59);
    expect(renders).toBeLessThanOrEqual(61);
  });

  it('does not try to replay every missed frame after a long pause', () => {
    const next = claimFrameSlot(10_000, 100, 60);
    expect(next).not.toBeNull();
    expect(10_000 - (next ?? 0)).toBeLessThan(1000 / 60);
    expect(claimFrameSlot(10_001, next, 60)).toBeNull();
  });
});
