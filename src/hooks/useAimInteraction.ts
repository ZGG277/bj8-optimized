/*
[INPUT]: 依赖 physics 台球世界、独立视觉相机方位、Scene3D 屏幕坐标映射与 match 状态
[OUTPUT]: 对外提供自由/跟随相机下统一的 360° 粗瞄、幽灵球拨轮、跟手虚母球放置与真实瞄准变化事实
[POS]: 交互协调层，把当前视觉相机下的指针映射为世界瞄准角；袋口几何委托 aim/，拨轮传动委托 input/
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { clampAimToForwardHalf, getCueBall, POCKETS, TABLE, cloneWorld } from '../physics';
import type { BilliardsWorld } from '../physics';
import type { Scene3D } from '../Scene3D';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';
import {
  aimSolutionForPocket,
  findAimDialTarget,
  firstObjectHit,
  type PrecisionAimSolution,
} from '../aim/aim-solution';
import {
  AIM_DIAL_APPROACH_RATIO,
  AIM_DIAL_UNLOCK_RATIO,
  aimDialAngleDelta,
  aimDialRatio,
} from '../input/aim-dial';
import { FIRST_PERSON_VIEW } from '../camera-view';
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
  matchPhase: string;
  breaking: boolean;
  legalTargets: number[];
  setMatch: React.Dispatch<React.SetStateAction<MatchState>>;
  setMessage: (key: MatchMessageKey, params?: MatchMessageParams) => void;
  setWorldView: React.Dispatch<React.SetStateAction<BilliardsWorld>>;
  setViewLevel: React.Dispatch<React.SetStateAction<number>>;
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
  matchPhase,
  breaking,
  legalTargets,
  setMatch,
  setMessage,
  setWorldView,
  setViewLevel,
  onCoarseAimAdjusted,
  }: AimInteractionProps) {
  const dragRef = useRef<{
    mode: 'aim' | 'ghost' | 'line';
    downX: number;
    downY: number;
    startAngle: number;
    dragging: boolean;
  } | null>(null);
  const placementPointerRef = useRef<number | null>(null);
  // 'line' 模式下用相对增量旋转，避免手机端绝对映射导致的方向跳变
  const lineLastXRef = useRef<number | null>(null);
  const aimDialLockRef = useRef<Pick<PrecisionAimSolution, 'target' | 'pocket'> | null>(null);
  const pendingDialAfterPlacementRef = useRef(false);
  const [aimDialVisible, setAimDialVisible] = useState(false);
  const [aimDialSolution, setAimDialSolution] = useState<PrecisionAimSolution | null>(null);
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

  const resolveAimDialSolution = useCallback((angle: number): PrecisionAimSolution | null => {
    const world = worldRef.current;
    const lock = aimDialLockRef.current;
    if (
      lock &&
      legalTargets.includes(lock.target) &&
      firstObjectHit(world, angle) === lock.target
    ) {
      const locked = aimSolutionForPocket(world, lock.target, lock.pocket, angle);
      if (locked && (aimDialRatio(locked) ?? Infinity) <= AIM_DIAL_UNLOCK_RATIO) {
        return locked;
      }
      aimDialLockRef.current = null;
    }

    const nearest = findAimDialTarget(world, angle, legalTargets);
    if (nearest && (aimDialRatio(nearest) ?? Infinity) <= AIM_DIAL_APPROACH_RATIO) {
      aimDialLockRef.current = { target: nearest.target, pocket: nearest.pocket };
    }
    return nearest;
  }, [worldRef, legalTargets]);

  const showAimDial = useCallback((angle = aimRef.current) => {
    setAimDialVisible(true);
    setAimDialSolution(resolveAimDialSolution(angle));
  }, [aimRef, resolveAimDialSolution]);

  const clearAimDial = useCallback(() => {
    aimDialLockRef.current = null;
    setAimDialVisible(false);
    setAimDialSolution(null);
  }, []);

  // 出杆或回合切换清掉拨轮；开球/自由球落位后的下一帧立即呼出。
  useEffect(() => {
    if (!canAim) {
      clearAimDial();
      return;
    }
    if (pendingDialAfterPlacementRef.current) {
      pendingDialAfterPlacementRef.current = false;
      showAimDial();
    }
  }, [canAim, clearAimDial, showAimDial]);

  /** 点哪打哪：把触点映射到台面坐标，瞄准线直接指向它。
   *  所有高度都用连续视角的目标相机位姿反算（screenToTableAt），避免活相机平滑插值造成反馈振荡；
   *  若用户点到了母球身后半台，把落点按 x 坐标投影到前方半台，避免视角天旋地转。 */
  const aimAtPointer = useCallback((clientX: number, clientY: number, keepDist = false) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
    if (!hit) return;
    const dx = hit.x - cue.x;
    const dz = hit.z - cue.z;
    // 开球阶段只取前方半台的 z 偏移：身后点击按同 x 映射到前方极小距离，避免天旋地转
    const forwardDz = breaking
      ? (cue.z > 0 ? (dz < 0 ? dz : -0.01) : (dz > 0 ? dz : 0.01))
      : dz;
    const dist = Math.hypot(dx, forwardDz);
    if (dist < 0.035) return; // 离白球太近不响应，防抖动
    if (!keepDist) aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -forwardDz);
    applyAim(worldAngle);
  }, [viewLevel, breaking, scene3DRef, worldRef, cameraAzimuthRef, aimGhostDistRef, applyAim]);

  /** 抓影子球挪位：影子球跟随指针落到台面任意位置，白球过影子球心的延长线即杆向 */
  const moveGhostTo = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
    if (!hit) return;
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
    if (dist < 0.05) return; // 影子球不能贴到白球上
    aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -forwardDz);
    applyAim(worldAngle);
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
    pendingDialAfterPlacementRef.current = true;
    if (breaking) setViewLevel(FIRST_PERSON_VIEW);
    setMatch((current) => ({ ...current, phase: 'aiming', messageKey: 'placed', messageParams: {} }));
    setWorldView(cloneWorld(world));
  }, [cuePlacementAt, worldRef, scene3DRef, breaking, setViewLevel, setMatch, setWorldView, setMessage]);

  /** 指针落点判定：幽灵球上=抓球挪位；瞄准线段上=抓线转角；其余=点哪打哪 */
  const pickDragMode = useCallback((clientX: number, clientY: number): 'aim' | 'ghost' | 'line' => {
    const scene = scene3DRef.current;
    const cue = getCueBall(worldRef.current);
    if (!scene || !cue) return 'aim';
    const ghost = scene.aimGhostPos();
    if (!ghost) return 'aim';
    const hit = scene.screenToTableAt(clientX, clientY, cameraAzimuthRef.current, viewLevel);
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
  }, [scene3DRef, worldRef, viewLevel, cameraAzimuthRef]);

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
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'ghost') {
      clearAimDial();
      return; // 抓影子球：按下不跳变，等拖动；松手后才判断精瞄候选。
    }
    if (mode === 'line') {
      lineLastXRef.current = e.clientX; // 记录初始位置，后续用相对增量旋转
      return;
    }
    clearAimDial();
    aimAtPointer(e.clientX, e.clientY, false);
  }, [canAim, matchPhase, previewCuePlacement, pickDragMode, aimAtPointer, clearAimDial, aimRef]);

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
    if (drag.mode === 'line') {
      const lastX = lineLastXRef.current ?? e.clientX;
      const deltaX = e.clientX - lastX;
      // 球桌瞄准线始终是粗档：约 400px 转完整一周，保证 360° 可达。
      const nextAngle = applyAim(aimRef.current + deltaX * (Math.PI / 200));
      if (aimDialVisible) setAimDialSolution(resolveAimDialSolution(nextAngle));
      lineLastXRef.current = e.clientX;
    } else if (drag.mode === 'ghost') {
      moveGhostTo(e.clientX, e.clientY);
    } else {
      aimAtPointer(e.clientX, e.clientY, false);
    }
  }, [canAim, matchPhase, previewCuePlacement, aimAtPointer, moveGhostTo, aimRef, applyAim, aimDialVisible, resolveAimDialSolution]);

  /** 指针抬起：摆球落实体母球；粗瞄只有拖动结束且角度真实变化才对外发事实。 */
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
    if (drag && drag.mode !== 'line') {
      showAimDial();
    }
    const coarseAimAdjusted = Boolean(
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
  }, [matchPhase, commitCuePlacement, showAimDial, aimRef, onCoarseAimAdjusted]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    placementPointerRef.current = null;
    lineLastXRef.current = null;
    if (matchPhase === 'placing') {
      scene3DRef.current?.setGhostCue(0, 0, false);
    } else {
      clearAimDial();
    }
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, [matchPhase, scene3DRef, clearAimDial]);

  const handleAimDialAdjust = useCallback((pixelDelta: number, pressureGain = 1): boolean => {
    if (!canAim || !aimDialVisible || pixelDelta === 0) return false;
    const current = aimRef.current;
    const solution = resolveAimDialSolution(current);
    const next = applyAim(
      current + aimDialAngleDelta(pixelDelta, solution, pressureGain),
    );
    setAimDialSolution(resolveAimDialSolution(next));
    return isMeaningfulGuideAimChange(
      current,
      next,
      GUIDE_FINE_AIM_MIN_RADIANS,
    );
  }, [canAim, aimDialVisible, aimRef, resolveAimDialSolution, applyAim]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleAimDialAdjust,
    aimDialVisible,
    aimDialSolution,
  };
}
