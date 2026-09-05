/*
[INPUT]: 依赖 physics 台球世界、独立视觉相机方位、Scene3D 屏幕坐标映射与 match 状态
[OUTPUT]: 对外提供自由/跟随相机下统一的 360° 粗瞄、默认拨轮/可选方向键微调、母球点击/拖放、自由球预览与抬手后幽灵球落位事实
[POS]: 交互协调层，把当前视觉相机下的指针与微调控件映射为世界瞄准角；拨轮消费用户显式粗/精档位
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
import { isMeaningfulGuideAimChange } from '../first-match-guide';

const GUIDE_COARSE_AIM_MIN_RADIANS = 0.003;
const GUIDE_FINE_AIM_MIN_RADIANS = 0.000001;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface AimInteractionProps {
  scene3DRef: React.RefObject<Scene3D | null>;
  worldRef: React.MutableRefObject<BilliardsWorld>;
  viewLevel: number;
  setAim: (angle: number) => void;
  aimRef: React.MutableRefObject<number>;
  cameraAzimuthRef: React.MutableRefObject<number>;
  aimGhostDistRef: React.MutableRefObject<number | null>;
  canAim: boolean;
  aimDialEnabled: boolean;
  matchPhase: string;
  breaking: boolean;
  setMatch: React.Dispatch<React.SetStateAction<MatchState>>;
  setMessage: (key: MatchMessageKey, params?: MatchMessageParams) => void;
  setWorldView: React.Dispatch<React.SetStateAction<BilliardsWorld>>;
  onGhostPlaced: () => void;
  onCoarseAimAdjusted: () => void;
}

export function useAimInteraction({
  scene3DRef,
  worldRef,
  viewLevel,
  setAim,
  aimRef,
  cameraAzimuthRef,
  aimGhostDistRef,
  canAim,
  aimDialEnabled,
  matchPhase,
  breaking,
  setMatch,
  setMessage,
  setWorldView,
  onGhostPlaced,
  onCoarseAimAdjusted,
  }: AimInteractionProps) {
  const dragRef = useRef<{
    mode: 'aim' | 'ghost' | 'line' | 'cue';
    downX: number;
    downY: number;
    startAngle: number;
    dragging: boolean;
    ghostPlaced: boolean;
  } | null>(null);
  const placementPointerRef = useRef<number | null>(null);
  const placementErrorRef = useRef<MatchMessageKey | null>(null);
  // 'line' 模式下用相对增量旋转，避免手机端绝对映射导致的方向跳变
  const lineLastXRef = useRef<number | null>(null);
  const [aimDialPrecisionActive, setAimDialPrecisionActive] = useState(false);
  const aimDialVisible = canAim && aimDialEnabled;
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

  // 切换为方向键或离开瞄准态时同时退出拨轮精瞄档。
  useEffect(() => {
    if (!aimDialVisible) setAimDialPrecisionActive(false);
  }, [aimDialVisible]);

  /** 点哪打哪：把触点映射到台面坐标，瞄准线直接指向它。
   *  所有高度都用连续视角的目标相机位姿反算（screenToTableAt），避免活相机平滑插值造成反馈振荡；
   *  若用户点到了母球身后半台，把落点按 x 坐标投影到前方半台，避免视角天旋地转。 */
  const aimAtPointer = useCallback((clientX: number, clientY: number, keepDist = false) => {
    const scene = scene3DRef.current;
    if (!scene) return false;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return false;
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
    if (!hit) return false;
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
    return Math.abs(hit.x) <= TABLE.width / 2 - TABLE.ballRadius
      && Math.abs(hit.z) <= TABLE.length / 2 - TABLE.ballRadius;
  }, [viewLevel, breaking, scene3DRef, worldRef, cameraAzimuthRef, aimGhostDistRef, applyAim]);

  /** 抓影子球挪位：影子球跟随指针落到台面任意位置，白球过影子球心的延长线即杆向 */
  const moveGhostTo = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    if (!scene) return false;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return false;
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
    if (!hit) return false;
    const m = TABLE.ballRadius;
    const gx = clamp(hit.x, -TABLE.width / 2 + m, TABLE.width / 2 - m);
    const gz = clamp(hit.z, -TABLE.length / 2 + m, TABLE.length / 2 - m);
    const dx = gx - cue.x;
    const dz = gz - cue.z;
    // 开球阶段同样把身后落点投影到前方半台；常规回合允许 360° 瞄准
    const forwardDz = breaking
      ? (cue.z > 0 ? (dz < 0 ? dz : -0.01) : (dz > 0 ? dz : 0.01))
      : dz;
    const dist = Math.hypot(dx, forwardDz);
    if (dist < 0.05) return false; // 影子球不能贴到白球上
    aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -forwardDz);
    applyAim(worldAngle);
    return true;
  }, [viewLevel, breaking, scene3DRef, worldRef, cameraAzimuthRef, aimGhostDistRef, applyAim]);

  const cuePlacementAt = useCallback((clientX: number, clientY: number): {
    x: number;
    z: number;
    error: MatchMessageKey | null;
  } | null => {
    const scene = scene3DRef.current;
    const hit = scene?.screenToTableAt(
      clientX,
      clientY,
      cameraAzimuthRef.current,
      viewLevel,
    );
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
  }, [scene3DRef, worldRef, breaking, cameraAzimuthRef, viewLevel]);

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
    setMatch((current) => ({ ...current, phase: 'aiming', messageKey: 'placed', messageParams: {} }));
    setWorldView(cloneWorld(world));
  }, [cuePlacementAt, worldRef, scene3DRef, setMatch, setWorldView, setMessage]);

  const moveCueTo = useCallback((clientX: number, clientY: number) => {
    const placement = cuePlacementAt(clientX, clientY);
    if (!placement || placement.error) return placement;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return null;
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
    setWorldView(cloneWorld(worldRef.current));
    return placement;
  }, [cuePlacementAt, worldRef, setWorldView]);

  /** 指针落点判定：开球区合法点=点击/拖放白球；幽灵球上=抓球挪位；
   *  瞄准线段上=抓线转角；其余=点哪打哪。 */
  const pickDragMode = useCallback((clientX: number, clientY: number): 'aim' | 'ghost' | 'line' | 'cue' => {
    const scene = scene3DRef.current;
    const cue = getCueBall(worldRef.current);
    if (!scene || !cue) return 'aim';
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
    if (!hit) return 'aim';
    if (breaking) {
      const placement = cuePlacementAt(clientX, clientY);
      if (placement && !placement.error) return 'cue';
    }
    const ghost = scene.aimGhostPos();
    if (!ghost) return 'aim';
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
  }, [
    breaking,
    cameraAzimuthRef,
    cuePlacementAt,
    scene3DRef,
    viewLevel,
    worldRef,
  ]);

  /** 指针按下 */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (matchPhase === 'placing') {
      placementPointerRef.current = e.pointerId;
      previewCuePlacement(e.clientX, e.clientY);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (!canAim) return;
    const mode = pickDragMode(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      downX: e.clientX,
      downY: e.clientY,
      startAngle: aimRef.current,
      dragging: false,
      ghostPlaced: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'cue') {
      placementErrorRef.current = null;
      return;
    }
    if (mode === 'ghost') return; // 抓影子球：按下不跳变，等拖动。
    if (mode === 'line') {
      lineLastXRef.current = e.clientX; // 记录初始位置，后续用相对增量旋转
      return;
    }
    dragRef.current.ghostPlaced = aimAtPointer(e.clientX, e.clientY, false);
  }, [canAim, matchPhase, previewCuePlacement, pickDragMode, aimAtPointer, aimRef]);

  /** 指针移动 */
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // 放置模式：幽灵球预览（开球时限制在开球区）
    if (matchPhase === 'placing') {
      previewCuePlacement(e.clientX, e.clientY);
      return;
    }
    const drag = dragRef.current;
    if (!drag || !canAim) return;
    if (!drag.dragging) {
      if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 8) return;
      drag.dragging = true;
    }
    if (drag.mode === 'cue') {
      const placement = moveCueTo(e.clientX, e.clientY);
      placementErrorRef.current = placement?.error ?? null;
    } else if (drag.mode === 'line') {
      const lastX = lineLastXRef.current ?? e.clientX;
      const deltaX = e.clientX - lastX;
      // 球桌瞄准线始终是粗档：约 400px 转完整一周，保证 360° 可达。
      applyAim(aimRef.current + deltaX * (Math.PI / 200));
      lineLastXRef.current = e.clientX;
    } else if (drag.mode === 'ghost') {
      drag.ghostPlaced = moveGhostTo(e.clientX, e.clientY);
    } else {
      drag.ghostPlaced = aimAtPointer(e.clientX, e.clientY, false);
    }
  }, [canAim, matchPhase, previewCuePlacement, moveCueTo, aimAtPointer, moveGhostTo, aimRef, applyAim]);

  /** 指针抬起后才报告幽灵球落位，避免拖动途中切镜导致映射跳变；摆白球与取消不切镜。 */
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (matchPhase === 'placing' && placementPointerRef.current === e.pointerId) {
      commitCuePlacement(e.clientX, e.clientY);
      placementPointerRef.current = null;
      if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
      return;
    }
    const drag = dragRef.current;
    if (drag?.mode === 'cue') {
      const clickPlacement = drag.dragging
        ? null
        : moveCueTo(e.clientX, e.clientY);
      const placementError = drag.dragging
        ? placementErrorRef.current
        : clickPlacement?.error ?? null;
      if (placementError) setMessage(placementError);
      else if (drag.dragging || clickPlacement) setMessage('placed');
      placementErrorRef.current = null;
    }
    const coarseAimAdjusted = Boolean(
      drag?.mode !== 'cue' &&
      drag?.dragging &&
      isMeaningfulGuideAimChange(
        drag.startAngle,
        aimRef.current,
        GUIDE_COARSE_AIM_MIN_RADIANS,
      ),
    );
    dragRef.current = null;
    lineLastXRef.current = null;
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
    if (coarseAimAdjusted) onCoarseAimAdjusted();
    if (canAim && drag?.ghostPlaced) onGhostPlaced();
  }, [
    aimRef,
    canAim,
    commitCuePlacement,
    matchPhase,
    moveCueTo,
    onCoarseAimAdjusted,
    onGhostPlaced,
    setMessage,
  ]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    placementPointerRef.current = null;
    placementErrorRef.current = null;
    lineLastXRef.current = null;
    if (matchPhase === 'placing') {
      scene3DRef.current?.setGhostCue(0, 0, false);
    }
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, [matchPhase, scene3DRef]);

  const handleAimButtonAdjust = useCallback((angleDelta: number): boolean => {
    if (!canAim || !Number.isFinite(angleDelta) || angleDelta === 0) return false;
    const current = aimRef.current;
    const next = applyAim(current + angleDelta);
    return isMeaningfulGuideAimChange(
      current,
      next,
      GUIDE_FINE_AIM_MIN_RADIANS,
    );
  }, [canAim, aimRef, applyAim]);

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
    if (!canAim || !aimDialVisible) return false;
    setAimDialPrecisionActive(current => !current);
    return true;
  }, [canAim, aimDialVisible]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleAimButtonAdjust,
    handleAimDialAdjust,
    toggleAimDialPrecision,
    aimDialVisible,
    aimDialPrecisionActive,
  };
}
