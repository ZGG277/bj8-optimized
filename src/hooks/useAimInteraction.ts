/*
[INPUT]: 依赖 physics 台球世界、手势期冻结的 Scene3D 活相机、ghost-aim 近球稳定器与 match 状态
[OUTPUT]: 对外提供自由/跟随相机下统一的 360° 粗瞄、活相机坐标系幽灵球拖拽、默认精瞄拨轮、有效落位完成事实与单指针原子取消
[POS]: 交互协调层，把玩家实际所见画面映射为世界瞄准角；隔离副指针，并在有效 aim/ghost 落位抬指后通知相机编排
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { clampAimToForwardHalf, getCueBall, POCKETS, TABLE, cloneWorld } from '../physics';
import type { BilliardsWorld } from '../physics';
import type { Scene3D } from '../Scene3D';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';
import {
  aimDialAngleDelta,
  type AimDialMode,
} from '../input/aim-dial';
import { resolveGhostAim } from '../input/ghost-aim';
import { isMeaningfulGuideAimChange } from '../first-match-guide';

const GUIDE_COARSE_AIM_MIN_RADIANS = 0.003;
const GUIDE_FINE_AIM_MIN_RADIANS = 0.000001;
export const DEFAULT_AIM_DIAL_PRECISION_ACTIVE = true;

export type AimDragMode = 'aim' | 'ghost' | 'line';

export function shouldNotifyAimEstablished({
  ownsActivePointer,
  mode,
  aimEstablished,
}: {
  ownsActivePointer: boolean;
  mode: AimDragMode | null;
  aimEstablished: boolean;
}): boolean {
  return ownsActivePointer && mode !== null && mode !== 'line' && aimEstablished;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface AimInteractionProps {
  scene3DRef: React.RefObject<Scene3D | null>;
  worldRef: React.MutableRefObject<BilliardsWorld>;
  setAim: (angle: number) => void;
  aimRef: React.MutableRefObject<number>;
  aimGhostDistRef: React.MutableRefObject<number | null>;
  canAim: boolean;
  matchPhase: string;
  breaking: boolean;
  setMatch: React.Dispatch<React.SetStateAction<MatchState>>;
  setMessage: (key: MatchMessageKey, params?: MatchMessageParams) => void;
  setWorldView: React.Dispatch<React.SetStateAction<BilliardsWorld>>;
  onCuePlaced: () => void;
  onAimEstablished: () => void;
  onCoarseAimAdjusted: () => void;
}

export function useAimInteraction({
  scene3DRef,
  worldRef,
  setAim,
  aimRef,
  aimGhostDistRef,
  canAim,
  matchPhase,
  breaking,
  setMatch,
  setMessage,
  setWorldView,
  onCuePlaced,
  onAimEstablished,
  onCoarseAimAdjusted,
  }: AimInteractionProps) {
  const dragRef = useRef<{
    mode: AimDragMode;
    downX: number;
    downY: number;
    startAngle: number;
    ghostNearCue: boolean;
    ghostPreviousDx: number | null;
    ghostPreviousDz: number | null;
    aimEstablished: boolean;
    dragging: boolean;
  } | null>(null);
  const placementPointerRef = useRef<number | null>(null);
  const activePointerRef = useRef<{ id: number; target: HTMLElement } | null>(null);
  const cancelledPointerIdsRef = useRef(new Set<number>());
  // 'line' 模式下用相对增量旋转，避免手机端绝对映射导致的方向跳变
  const lineLastXRef = useRef<number | null>(null);
  const pendingDialAfterPlacementRef = useRef(false);
  const canAimRef = useRef(canAim);
  canAimRef.current = canAim;
  const [aimDialVisible, setAimDialVisible] = useState(false);
  const [aimDialPrecisionActive, setAimDialPrecisionActive] = useState(
    DEFAULT_AIM_DIAL_PRECISION_ACTIVE,
  );
  // 用 ref 持有 setAim 避免与 useShotInput 的循环依赖
  const setAimRef = useRef(setAim);
  setAimRef.current = setAim;

  const applyAim = useCallback((rawAngle: number): number => {
    const wrapped = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
    const next = breaking
      ? clampAimToForwardHalf(getCueBall(worldRef.current), wrapped)
      : wrapped;
    aimRef.current = next;
    setAimRef.current(next);
    return next;
  }, [breaking, worldRef, aimRef]);

  const showAimDial = useCallback(() => {
    setAimDialVisible(true);
  }, []);

  const clearAimDial = useCallback(() => {
    setAimDialVisible(false);
    setAimDialPrecisionActive(DEFAULT_AIM_DIAL_PRECISION_ACTIVE);
  }, []);

  const releaseActivePointerCapture = useCallback(() => {
    const active = activePointerRef.current;
    if (active?.target.hasPointerCapture(active.id)) {
      active.target.releasePointerCapture(active.id);
    }
    activePointerRef.current = null;
  }, []);

  /** 模式/回合迁移的统一出口：旧指针不得在新状态里复活拨轮或摆球预览。 */
  const cancelActiveInteraction = useCallback(() => {
    const activePointer = activePointerRef.current;
    if (activePointer) cancelledPointerIdsRef.current.add(activePointer.id);
    dragRef.current = null;
    placementPointerRef.current = null;
    lineLastXRef.current = null;
    scene3DRef.current?.setGhostCue(0, 0, false);
    clearAimDial();
    releaseActivePointerCapture();
  }, [clearAimDial, releaseActivePointerCapture, scene3DRef]);

  // 出杆或回合切换清掉拨轮；开球/自由球落位后的下一帧立即呼出。
  useEffect(() => {
    if (!canAim) {
      cancelActiveInteraction();
      return;
    }
    if (pendingDialAfterPlacementRef.current) {
      pendingDialAfterPlacementRef.current = false;
      showAimDial();
    }
  }, [canAim, cancelActiveInteraction, showAimDial]);

  /** 点哪打哪：把触点映射到台面坐标，瞄准线直接指向它。
   *  所有高度都用指针按下时冻结的活相机反算，保证看到哪里就落到哪里；
   *  若用户点到了母球身后半台，把落点按 x 坐标投影到前方半台，避免视角天旋地转。 */
  const aimAtPointer = useCallback((
    clientX: number,
    clientY: number,
    keepDist = false,
  ): boolean => {
    const scene = scene3DRef.current;
    if (!scene) return false;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return false;
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return false;
    const dx = hit.x - cue.x;
    const dz = hit.z - cue.z;
    // 开球阶段只取前方半台的 z 偏移：身后点击按同 x 映射到前方极小距离，避免天旋地转
    const forwardDz = breaking
      ? (cue.z > 0 ? (dz < 0 ? dz : -0.01) : (dz > 0 ? dz : 0.01))
      : dz;
    const dist = Math.hypot(dx, forwardDz);
    if (dist < 0.035) return false; // 离白球太近不响应，防抖动
    if (!keepDist) aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -forwardDz);
    applyAim(worldAngle);
    return true;
  }, [breaking, scene3DRef, worldRef, aimGhostDistRef, applyAim]);

  /** 抓影子球挪位：影子球跟随指针落到台面任意位置，白球过影子球心的延长线即杆向 */
  const moveGhostTo = useCallback((
    clientX: number,
    clientY: number,
    gesture: NonNullable<typeof dragRef.current>,
  ): boolean => {
    const scene = scene3DRef.current;
    if (!scene) return false;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return false;
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return false;
    const m = TABLE.ballRadius;
    const gx = clamp(hit.x, -TABLE.width / 2 + m, TABLE.width / 2 - m);
    const gz = clamp(hit.z, -TABLE.length / 2 + m, TABLE.length / 2 - m);
    const dx = gx - cue.x;
    const dz = gz - cue.z;
    // 开球阶段同样把身后落点投影到前方半台；常规回合允许 360° 瞄准
    const forwardDz = breaking
      ? (cue.z > 0 ? (dz < 0 ? dz : -0.01) : (dz > 0 ? dz : 0.01))
      : dz;
    const resolved = resolveGhostAim({
      dx,
      dz: forwardDz,
      previousDx: gesture.ghostPreviousDx,
      previousDz: gesture.ghostPreviousDz,
      previousAngle: aimRef.current,
      nearCue: gesture.ghostNearCue,
      minDistance: TABLE.ballRadius * 2,
    });
    gesture.ghostNearCue = resolved.nearCue;
    gesture.ghostPreviousDx = dx;
    gesture.ghostPreviousDz = forwardDz;
    aimGhostDistRef.current = resolved.distance;
    scene.setAimGhostDist(resolved.distance);
    if (!resolved.nearCue) applyAim(resolved.angle);
    return true;
  }, [breaking, scene3DRef, worldRef, aimRef, aimGhostDistRef, applyAim]);

  const cuePlacementAt = useCallback((clientX: number, clientY: number): {
    x: number;
    z: number;
    error: MatchMessageKey | null;
  } | null => {
    const scene = scene3DRef.current;
    const hit = scene?.screenToTable(clientX, clientY);
    if (!hit) return null;

    const xLimit = TABLE.width / 2 - TABLE.ballRadius;
    const zLimit = TABLE.length / 2 - TABLE.ballRadius;
    if (Math.abs(hit.x) > xLimit || Math.abs(hit.z) > zLimit) {
      return null;
    }
    if (breaking && hit.z < TABLE.length * 0.25) {
      return { x: hit.x, z: hit.z, error: 'place-outside-kitchen' };
    }

    const minDist = TABLE.ballRadius * 2.5;
    for (const ball of worldRef.current.balls) {
      if (!ball.active || ball.number === 0) continue;
      if (Math.hypot(ball.x - hit.x, ball.z - hit.z) < minDist) {
        return { x: hit.x, z: hit.z, error: 'place-occupied' };
      }
    }
    if (POCKETS.some((pocket) => Math.hypot(pocket.x - hit.x, pocket.z - hit.z) < TABLE.ballRadius * 3)) {
      return { x: hit.x, z: hit.z, error: 'place-near-pocket' };
    }
    return { x: hit.x, z: hit.z, error: null };
  }, [scene3DRef, worldRef, breaking]);

  const previewCuePlacement = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    const placement = cuePlacementAt(clientX, clientY);
    if (!scene) return null;
    if (!placement || placement.error) {
      scene.setGhostCue(0, 0, false);
      return placement;
    }
    scene.setGhostCue(placement.x, placement.z, true);
    return placement;
  }, [scene3DRef, cuePlacementAt]);

  const commitCuePlacement = useCallback((clientX: number, clientY: number) => {
    const placement = cuePlacementAt(clientX, clientY);
    if (!placement) return;
    if (placement.error) {
      setMessage(placement.error);
      return;
    }

    const world = worldRef.current;
    const cueBall = world.balls.find((ball) => ball.number === 0);
    if (!cueBall) return;
    Object.assign(cueBall, {
      x: placement.x,
      z: placement.z,
      vx: 0,
      vz: 0,
      wx: 0,
      wy: 0,
      wz: 0,
      active: true,
    });
    scene3DRef.current?.setGhostCue(0, 0, false);
    pendingDialAfterPlacementRef.current = true;
    if (breaking) onCuePlaced();
    setMatch((current) => ({ ...current, phase: 'aiming', messageKey: 'placed', messageParams: {} }));
    setWorldView(cloneWorld(world));
  }, [cuePlacementAt, worldRef, scene3DRef, breaking, onCuePlaced, setMatch, setWorldView, setMessage]);

  /** 指针落点判定：幽灵球上=抓球挪位；瞄准线段上=抓线转角；其余=点哪打哪 */
  const pickDragMode = useCallback((clientX: number, clientY: number): AimDragMode => {
    const scene = scene3DRef.current;
    const cue = getCueBall(worldRef.current);
    if (!scene || !cue) return 'aim';
    const ghost = scene.aimGhostPos();
    if (!ghost) return 'aim';
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit) return 'aim';
    if (Math.hypot(hit.x - ghost.x, hit.z - ghost.z) < 0.08) return 'ghost';
    const lx = ghost.x - cue.x;
    const lz = ghost.z - cue.z;
    const len = Math.hypot(lx, lz);
    if (len > 0.06) {
      const t = ((hit.x - cue.x) * lx + (hit.z - cue.z) * lz) / (len * len);
      const perp = Math.abs((hit.x - cue.x) * lz - (hit.z - cue.z) * lx) / len;
      if (t > 0.05 && t < 1.05 && perp < 0.022) return 'line';
    }
    return 'aim';
  }, [scene3DRef, worldRef]);

  /** 指针按下 */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 一个交互会话只允许一个所有者；第二根手指不得改写第一根手指的 dragRef。
    if (activePointerRef.current) return;
    cancelledPointerIdsRef.current.delete(e.pointerId);
    if (matchPhase === 'placing') {
      placementPointerRef.current = e.pointerId;
      previewCuePlacement(e.clientX, e.clientY);
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      activePointerRef.current = { id: e.pointerId, target };
      return;
    }
    if (!canAim) return;
    const mode = pickDragMode(e.clientX, e.clientY);
    const cue = getCueBall(worldRef.current);
    const ghost = mode === 'ghost' ? scene3DRef.current?.aimGhostPos() : null;
    dragRef.current = {
      mode,
      downX: e.clientX,
      downY: e.clientY,
      startAngle: aimRef.current,
      ghostNearCue: false,
      ghostPreviousDx: ghost && cue ? ghost.x - cue.x : null,
      ghostPreviousDz: ghost && cue ? ghost.z - cue.z : null,
      aimEstablished: false,
      dragging: false,
    };
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    activePointerRef.current = { id: e.pointerId, target };
    if (mode === 'ghost') {
      clearAimDial();
      return; // 抓影子球：按下不跳变，等拖动；松手后才判断精瞄候选。
    }
    if (mode === 'line') {
      lineLastXRef.current = e.clientX; // 记录初始位置，后续用相对增量旋转
      return;
    }
    clearAimDial();
    dragRef.current.aimEstablished = aimAtPointer(e.clientX, e.clientY, false);
  }, [canAim, matchPhase, previewCuePlacement, pickDragMode, aimAtPointer, clearAimDial, aimRef, scene3DRef, worldRef]);

  /** 指针移动 */
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (activePointerRef.current?.id !== e.pointerId) return;
    // 放置模式：幽灵球预览（开球时限制在开球区）
    if (matchPhase === 'placing') {
      if (placementPointerRef.current !== e.pointerId) return;
      previewCuePlacement(e.clientX, e.clientY);
      return;
    }
    const drag = dragRef.current;
    if (!drag || !canAimRef.current) return;
    if (!drag.dragging) {
      if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 8) return;
      drag.dragging = true;
    }
    if (drag.mode === 'line') {
      const lastX = lineLastXRef.current ?? e.clientX;
      const deltaX = e.clientX - lastX;
      // 球桌瞄准线始终是粗档：约 400px 转完整一周，保证 360° 可达。
      applyAim(aimRef.current + deltaX * (Math.PI / 200));
      lineLastXRef.current = e.clientX;
    } else if (drag.mode === 'ghost') {
      if (moveGhostTo(e.clientX, e.clientY, drag)) drag.aimEstablished = true;
    } else {
      if (aimAtPointer(e.clientX, e.clientY, false)) drag.aimEstablished = true;
    }
  }, [canAim, matchPhase, previewCuePlacement, aimAtPointer, moveGhostTo, aimRef, applyAim]);

  /** 指针抬起：摆球落实体母球；粗瞄只有拖动结束且角度真实变化才对外发事实。 */
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (cancelledPointerIdsRef.current.delete(e.pointerId)) {
      return;
    }
    const ownsActivePointer = activePointerRef.current?.id === e.pointerId;
    if (!ownsActivePointer) return;
    if (matchPhase === 'placing' && placementPointerRef.current === e.pointerId) {
      commitCuePlacement(e.clientX, e.clientY);
      placementPointerRef.current = null;
      releaseActivePointerCapture();
      return;
    }
    if (!canAimRef.current) {
      cancelActiveInteraction();
      return;
    }
    const drag = dragRef.current;
    if (drag && drag.mode !== 'line' && drag.aimEstablished) {
      showAimDial();
    }
    const coarseAimAdjusted = Boolean(
      ownsActivePointer &&
      drag?.dragging &&
      isMeaningfulGuideAimChange(
        drag.startAngle,
        aimRef.current,
        GUIDE_COARSE_AIM_MIN_RADIANS,
      ),
    );
    const aimEstablished = shouldNotifyAimEstablished({
      ownsActivePointer,
      mode: drag?.mode ?? null,
      aimEstablished: drag?.aimEstablished ?? false,
    });
    dragRef.current = null;
    lineLastXRef.current = null;
    releaseActivePointerCapture();
    if (coarseAimAdjusted) onCoarseAimAdjusted();
    if (aimEstablished) onAimEstablished();
  }, [cancelActiveInteraction, matchPhase, commitCuePlacement, releaseActivePointerCapture, showAimDial, aimRef, onAimEstablished, onCoarseAimAdjusted]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (cancelledPointerIdsRef.current.delete(e.pointerId)) return;
    if (activePointerRef.current?.id !== e.pointerId) return;
    cancelActiveInteraction();
  }, [cancelActiveInteraction]);

  const handleAimDialAdjust = useCallback((
    pixelDelta: number,
    pressureGain = 1,
  ): AimDialMode | null => {
    if (!canAim || !aimDialVisible || pixelDelta === 0) return null;
    const current = aimRef.current;
    const next = applyAim(
      current + aimDialAngleDelta(pixelDelta, aimDialPrecisionActive, pressureGain),
    );
    const adjusted = isMeaningfulGuideAimChange(
      current,
      next,
      GUIDE_FINE_AIM_MIN_RADIANS,
    );
    return adjusted ? (aimDialPrecisionActive ? 'fine' : 'coarse') : null;
  }, [canAim, aimDialVisible, aimRef, aimDialPrecisionActive, applyAim]);

  const toggleAimDialPrecision = useCallback(() => {
    if (!canAim || !aimDialVisible) return;
    setAimDialPrecisionActive(current => !current);
  }, [canAim, aimDialVisible]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    cancelActiveInteraction,
    handleAimDialAdjust,
    toggleAimDialPrecision,
    aimDialVisible,
    aimDialPrecisionActive,
  };
}
