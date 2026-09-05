/*
[INPUT]: useAimInteraction 指针路由、真实初始球桌与可控的屏幕投影替身
[OUTPUT]: 幽灵球抬手触发、拖动不提前切镜、取消/无效点/母球落位不触发的回归
[POS]: 瞄准交互事实单测，不替代真实浏览器中的相机/指针验收
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { renderToStaticMarkup } from 'react-dom/server';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld, getCueBall } from '../physics';
import type { Scene3D } from '../Scene3D';
import { useAimInteraction } from './useAimInteraction';

function harness(breaking = false, phase = 'aiming') {
  const worldRef = { current: createInitialWorld(() => 0.5) };
  const ghostPlaced = vi.fn();
  let hit: { x: number; z: number } | null = { x: 0.3, z: 0.1 };
  let ghost: { x: number; z: number } | null = null;
  const scene = {
    screenToTableAt: () => hit,
    aimGhostPos: () => ghost,
    setGhostCue: vi.fn(),
  };
  let handlers!: ReturnType<typeof useAimInteraction>;
  function Harness() {
    handlers = useAimInteraction({
      scene3DRef: { current: scene as unknown as Scene3D },
      worldRef, viewLevel: 1, setAim: vi.fn(), aimRef: { current: 0 },
      cameraAzimuthRef: { current: 0 }, aimGhostDistRef: { current: null },
      canAim: phase === 'aiming', aimDialEnabled: true, matchPhase: phase, breaking,
      setMatch: vi.fn(), setMessage: vi.fn(), setWorldView: vi.fn(),
      onCoarseAimAdjusted: vi.fn(), onGhostPlaced: ghostPlaced,
    });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  const target = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
  const pointer = (x = 100) => ({ clientX: x, clientY: 100, pointerId: 1, target } as unknown as PointerEvent);
  return { handlers, pointer, ghostPlaced, worldRef,
    setHit: (next: typeof hit) => { hit = next; },
    setGhost: (next: typeof ghost) => { ghost = next; },
  };
}

describe('幽灵球落位事件', () => {
  it('合法点按只在抬手后确认，不在按下或拖动中切换', () => {
    const h = harness();
    h.handlers.handlePointerDown(h.pointer());
    expect(h.ghostPlaced).not.toHaveBeenCalled();
    h.handlers.handlePointerMove(h.pointer(130));
    expect(h.ghostPlaced).not.toHaveBeenCalled();
    h.handlers.handlePointerUp(h.pointer(130));
    expect(h.ghostPlaced).toHaveBeenCalledTimes(1);
  });

  it('幽灵球拖放确认，但仅抓住未移动不重复确认', () => {
    const h = harness();
    h.setGhost({ x: 0.3, z: 0.1 });
    h.handlers.handlePointerDown(h.pointer());
    h.handlers.handlePointerUp(h.pointer());
    expect(h.ghostPlaced).not.toHaveBeenCalled();
    h.handlers.handlePointerDown(h.pointer());
    h.setHit({ x: 0.4, z: 0.15 });
    h.handlers.handlePointerMove(h.pointer(130));
    h.handlers.handlePointerUp(h.pointer(130));
    expect(h.ghostPlaced).toHaveBeenCalledTimes(1);
  });

  it('取消手势、无投影或桌外点击不报告落位', () => {
    const h = harness();
    h.handlers.handlePointerDown(h.pointer());
    h.handlers.handlePointerCancel(h.pointer());
    h.handlers.handlePointerUp(h.pointer());
    for (const hit of [null, { x: 4, z: 4 }]) {
      h.setHit(hit);
      h.handlers.handlePointerDown(h.pointer());
      h.handlers.handlePointerUp(h.pointer());
    }
    expect(h.ghostPlaced).not.toHaveBeenCalled();
  });

  it.each(['aiming', 'placing'])('开球 %s 摆实体白球不误发瞄准幽灵球事件', phase => {
    const h = harness(true, phase);
    h.setHit({ x: 0.2, z: 0.95 });
    h.handlers.handlePointerDown(h.pointer());
    h.handlers.handlePointerUp(h.pointer());
    expect(getCueBall(h.worldRef.current)?.x).toBe(0.2);
    expect(h.ghostPlaced).not.toHaveBeenCalled();
  });
});
