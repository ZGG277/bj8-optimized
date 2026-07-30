/*
[INPUT]: control-layout 纯函数与模拟 Storage
[OUTPUT]: 响应式档案、自由钳制、吸附、容量、轴向与 v2 迁移断言
[POS]: 五控件布局领域层回归测试
[PROTOCOL]: 布局协议变化时同步更新本文件
*/
import { describe, expect, it } from 'vitest';
import {
  CONTROL_LAYOUT_STORAGE_KEY,
  canDock,
  clampFreePlacement,
  controlAxisDelta,
  createDefaultControlLayouts,
  loadControlLayouts,
  nearestDockPosition,
  placeDockedControl,
  resolveLayoutProfile,
  snapEdgeAt,
  swapDockedControlPositions,
} from './control-layout';

describe('control layout geometry', () => {
  it('selects desktop, portrait and landscape profiles', () => {
    expect(resolveLayoutProfile(1280, 800)).toBe('desktop');
    expect(resolveLayoutProfile(390, 844)).toBe('portrait');
    expect(resolveLayoutProfile(844, 390)).toBe('landscape');
  });

  it('clamps a free item to the viewport safe gutter', () => {
    const result = clampFreePlacement(-100, 999, 54, 100, 390, 844);
    expect(result.x * 390).toBe(35);
    expect(result.y * 844).toBe(786);
  });

  it('snaps only near the right or bottom edge', () => {
    expect(snapEdgeAt(200, 300, 390, 844)).toBeNull();
    expect(snapEdgeAt(370, 300, 390, 844)).toBe('right');
    expect(snapEdgeAt(200, 830, 390, 844)).toBe('bottom');
  });

  it('switches the primary gesture axis with the dock edge', () => {
    expect(controlAxisDelta({
      mode: 'docked', edge: 'right', order: 0, position: 0.4,
    }, 5, 9)).toBe(9);
    expect(controlAxisDelta({
      mode: 'docked', edge: 'bottom', order: 0, position: 0.4,
    }, 5, 9)).toBe(5);
    expect(controlAxisDelta({ mode: 'free', x: 0.5, y: 0.5 }, 5, 9)).toBe(5);
  });

  it('rejects an overloaded short right rail', () => {
    const layout = createDefaultControlLayouts().layouts.landscape;
    expect(canDock(layout, 'aimDial', 'right', 844, 390)).toBe(false);
    expect(canDock(layout, 'aimDial', 'bottom', 844, 390)).toBe(true);
  });

  it('keeps the along-edge drop position and derives visual order from it', () => {
    const layout = createDefaultControlLayouts().layouts.desktop;
    const repositioned = placeDockedControl(layout, 'power', 'right', 0.23);
    expect(repositioned.power).toEqual({
      mode: 'docked', edge: 'right', order: 1, position: 0.23,
    });
    expect(repositioned.view).toMatchObject({ order: 0, position: 0.14 });
    expect(repositioned.bulb).toMatchObject({ order: 2, position: 0.32 });
    expect(repositioned.spin).toMatchObject({ order: 3, position: 0.42 });
  });

  it('finds the nearest collision-free center instead of packing to the rail start', () => {
    expect(nearestDockPosition(
      500,
      100,
      [{ start: 0, end: 180 }, { start: 300, end: 360 }],
      800,
    )).toBeCloseTo(0.625);
    expect(nearestDockPosition(50, 200, [{ start: 0, end: 250 }], 300)).toBeNull();
  });

  it('swaps two controls already docked on the same edge', () => {
    const layout = createDefaultControlLayouts().layouts.portrait;
    const swapped = swapDockedControlPositions(layout, 'view', 'spin');
    expect(swapped.view).toMatchObject({ edge: 'right', order: 2, position: 0.42 });
    expect(swapped.spin).toMatchObject({ edge: 'right', order: 0, position: 0.14 });
    expect(swapped.bulb).toMatchObject({ edge: 'right', order: 1, position: 0.32 });
  });

  it('ignores a swap across different dock edges', () => {
    const layout = placeDockedControl(
      createDefaultControlLayouts().layouts.portrait,
      'spin',
      'bottom',
      0.5,
    );
    expect(swapDockedControlPositions(layout, 'view', 'spin')).toBe(layout);
  });
});

describe('control layout persistence', () => {
  it('migrates old per-slot offsets into right-edge order without deleting them', () => {
    const data = new Map<string, string>([
      ['bj8-control-y:v2:view', '20'],
      ['bj8-control-y:v2:guidance', '-1100'],
      ['bj8-control-y:v2:spin', '0'],
      ['bj8-control-y:v2:shoot', '0'],
    ]);
    const layouts = loadControlLayouts({
      getItem: key => data.get(key) ?? null,
    });
    expect(layouts.layouts.portrait.bulb).toEqual({
      mode: 'docked',
      edge: 'right',
      order: 0,
      position: 0.14,
    });
    expect(data.has('bj8-control-y:v2:guidance')).toBe(true);
  });

  it('falls back safely from broken v3 JSON', () => {
    const layouts = loadControlLayouts({
      getItem: key => key === CONTROL_LAYOUT_STORAGE_KEY ? '{broken' : null,
    });
    expect(layouts.version).toBe(3);
    expect(layouts.layouts.desktop.aimDial.mode).toBe('free');
  });

  it('upgrades v3 dock order without position into distributed edge anchors', () => {
    const stored = {
      version: 3,
      layouts: {
        portrait: {
          view: { mode: 'docked', edge: 'right', order: 2 },
          bulb: { mode: 'docked', edge: 'right', order: 0 },
          spin: { mode: 'docked', edge: 'right', order: 1 },
          power: { mode: 'docked', edge: 'right', order: 3 },
          aimDial: { mode: 'free', x: 0.5, y: 0.84 },
        },
      },
    };
    const layouts = loadControlLayouts({
      getItem: key => key === CONTROL_LAYOUT_STORAGE_KEY
        ? JSON.stringify(stored)
        : null,
    });
    expect(layouts.layouts.portrait.bulb).toMatchObject({ order: 0, position: 0.14 });
    expect(layouts.layouts.portrait.view).toMatchObject({ order: 2, position: 0.42 });
  });
});
