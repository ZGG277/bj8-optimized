import { describe, expect, it } from 'vitest';
import { cropSquare, defaultCrop, moveCrop, restoreCrop } from './portrait-crop';

const photo = { width: 800, height: 400 };
const center = { x: .5, y: .5 };

describe('portrait crop', () => {
  it('starts with a centered square and anchors an off-center pinch', () => {
    expect(cropSquare(defaultCrop, photo)).toEqual({ left: 200, top: 0, side: 400 });
    const halfwayLeft = { x: .25, y: .5 };
    const square = cropSquare(moveCrop(defaultCrop, photo, halfwayLeft, halfwayLeft, 2), photo);
    expect(square).toEqual({ left: 250, top: 100, side: 200 });
    expect(square.left + square.side * halfwayLeft.x).toBe(300);
  });

  it('clamps zoom and panning to the source image', () => {
    const zoomed = moveCrop(defaultCrop, photo, center, center, 12);
    const panned = moveCrop(zoomed, photo, center, { x: 20, y: -20 });
    expect(cropSquare(panned, photo)).toEqual({ left: 0, top: 300, side: 100 });
    expect(moveCrop(panned, photo, center, center, .1).zoom).toBe(1);
  });
  it('restores saved photo framing and handles older or invalid crop data', () => {
    expect(restoreCrop()).toEqual(defaultCrop);
    expect(restoreCrop({ x: .3, y: .7, zoom: 2 })).toEqual({ x: .3, y: .7, zoom: 2 });
    expect(restoreCrop({ x: -1, y: 3, zoom: 12 })).toEqual({ x: 0, y: 1, zoom: 4 });
    expect(restoreCrop({ x: 0, y: NaN, zoom: 2 })).toEqual(defaultCrop);
  });
});
