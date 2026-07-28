/*
[INPUT]: 依赖 physics 台球世界、Scene3D 屏幕坐标映射、match 对局状态
[OUTPUT]: 对外提供 360° 世界角粗瞄、目标球近袋时的局部精瞄状态，以及 pointer 放置/瞄准处理器
[POS]: 交互协调层，把指针映射为世界瞄准角；精瞄几何委托 aim/aim-solution，不判断规则结果
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useCallback, useRef, useState } from 'react';
import { getCueBall, TABLE, cloneWorld } from '../physics';
import type { BilliardsWorld } from '../physics';
import type { Scene3D } from '../Scene3D';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';
import {
  aimAngleForPocketOffset,
  findPrecisionAim,
  precisionStillValid,
  type PrecisionAimSolution,
} from '../aim/aim-solution';

type ViewMode = 'first' | 'overhead';

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface AimInteractionProps {
  scene3DRef: React.RefObject<Scene3D | null>;
  worldRef: React.MutableRefObject<BilliardsWorld>;
  matchRef: React.RefObject<MatchState>;
  viewMode: ViewMode;
  setAim: (angle: number) => void;
  aimRef: React.MutableRefObject<number>;
  aimGhostDistRef: React.MutableRefObject<number | null>;
  canAim: boolean;
  matchPhase: string;
  breaking: boolean;
  legalTargets: number[];
  setMatch: React.Dispatch<React.SetStateAction<MatchState>>;
  setMessage: (key: MatchMessageKey, params?: MatchMessageParams) => void;
  setWorldView: React.Dispatch<React.SetStateAction<BilliardsWorld>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
}

export function useAimInteraction({
  scene3DRef,
  worldRef,
  matchRef,
  viewMode,
  setAim,
  aimRef,
  aimGhostDistRef,
  canAim,
  matchPhase,
  breaking,
  legalTargets,
  setMatch,
  setMessage,
  setWorldView,
  setViewMode,
  }: AimInteractionProps) {
  const dragRef = useRef<{ mode: 'aim' | 'ghost' | 'line'; downX: number; downY: number; dragging: boolean } | null>(null);
  // 'line' 模式下用相对增量旋转，避免手机端绝对映射导致的方向跳变
  const lineLastXRef = useRef<number | null>(null);
  const precisionRef = useRef<(PrecisionAimSolution & { offset: number }) | null>(null);
  const [precisionAim, setPrecisionAim] = useState<(PrecisionAimSolution & { offset: number }) | null>(null);
  // 用 ref 持有 setAim 避免与 useShotInput 的循环依赖
  const setAimRef = useRef(setAim);
  setAimRef.current = setAim;

  /** 点哪打哪：把触点映射到台面坐标，瞄准线直接指向它。
   *  第一人称下用目标相机位姿反算（screenToTableAt），避免活相机平滑插值造成反馈振荡；
   *  若用户点到了母球身后半台，把落点按 x 坐标投影到前方半台，避免视角天旋地转。 */
  const aimAtPointer = useCallback((clientX: number, clientY: number, keepDist = false) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const hit = viewMode === 'first'
      ? scene.screenToTableAt(clientX, clientY, aimRef.current)
      : scene.screenToTable(clientX, clientY);
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
    setAimRef.current(worldAngle);
  }, [viewMode, breaking, scene3DRef, worldRef, aimRef, aimGhostDistRef]);

  /** 抓影子球挪位：影子球跟随指针落到台面任意位置，白球过影子球心的延长线即杆向 */
  const moveGhostTo = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const hit = viewMode === 'first'
      ? scene.screenToTableAt(clientX, clientY, aimRef.current)
      : scene.screenToTable(clientX, clientY);
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
    setAimRef.current(worldAngle);
  }, [viewMode, breaking, scene3DRef, worldRef, aimRef, aimGhostDistRef]);

  /** 指针落点判定：幽灵球上=抓球挪位；瞄准线段上=抓线转角；其余=点哪打哪 */
  const pickDragMode = useCallback((clientX: number, clientY: number): 'aim' | 'ghost' | 'line' => {
    const scene = scene3DRef.current;
    const cue = getCueBall(worldRef.current);
    if (!scene || !cue) return 'aim';
    const ghost = scene.aimGhostPos();
    if (!ghost) return 'aim';
    const hit = viewMode === 'first'
      ? scene.screenToTableAt(clientX, clientY, aimRef.current)
      : scene.screenToTable(clientX, clientY);
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
  }, [scene3DRef, worldRef, viewMode, aimRef]);

  /** 指针按下 */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (matchPhase === 'placing') return;
    if (!canAim) return;
    const mode = pickDragMode(e.clientX, e.clientY);
    dragRef.current = { mode, downX: e.clientX, downY: e.clientY, dragging: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'ghost') return; // 抓影子球：按下不跳变，等拖动
    if (mode === 'line') {
      lineLastXRef.current = e.clientX; // 记录初始位置，后续用相对增量旋转
    }
    precisionRef.current = null;
    setPrecisionAim(null);
    aimAtPointer(e.clientX, e.clientY, mode === 'line');
  }, [canAim, matchPhase, pickDragMode, aimAtPointer]);

  /** 指针移动 */
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // 放置模式：幽灵球预览（开球时限制在开球区）
    if (matchPhase === 'placing') {
      const scene = scene3DRef.current;
      const hit = scene?.screenToTable(e.clientX, e.clientY);
      if (scene && hit) {
        const isBreak = matchRef.current?.breaking ?? false;
        const xLimit = TABLE.width / 2 - TABLE.ballRadius;
        const zLimit = TABLE.length / 2 - TABLE.ballRadius;
        let gx = Math.min(xLimit, Math.max(-xLimit, hit.x));
        let gz = Math.min(zLimit, Math.max(-zLimit, hit.z));
        if (isBreak) {
          const headString = TABLE.length * 0.25;
          gz = Math.min(zLimit, Math.max(headString, gz));
        }
        scene.setGhostCue(gx, gz, true);
      }
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
      const active = precisionRef.current;
      if (
        active &&
        Math.abs(e.clientY - drag.downY) <= 32 &&
        precisionStillValid(worldRef.current, aimRef.current, legalTargets, active)
      ) {
        // 局部窗口：约 144px 走完整个有效袋口，显示值与真实反解角一一对应。
        const offset = Math.max(-1, Math.min(1, active.offset + deltaX / 72));
        const angle = aimAngleForPocketOffset(
          worldRef.current,
          active.target,
          active.pocket,
          offset,
        );
        if (angle !== null) {
          const next = { ...active, offset };
          precisionRef.current = next;
          setPrecisionAim(next);
          setAimRef.current(angle);
        }
      } else {
        precisionRef.current = null;
        setPrecisionAim(null);
        // 粗瞄：约 400px 转完整一周。快速扫动永远留在粗瞄，保证 360° 可达。
        const nextAngle = aimRef.current + deltaX * (Math.PI / 200);
        setAimRef.current(nextAngle);
        if (Math.abs(deltaX) <= 8 && Math.abs(e.clientY - drag.downY) <= 32) {
          const solution = findPrecisionAim(worldRef.current, nextAngle, legalTargets);
          if (solution) {
            precisionRef.current = solution;
            setPrecisionAim(solution);
          }
        }
      }
      lineLastXRef.current = e.clientX;
    } else if (drag.mode === 'ghost') {
      moveGhostTo(e.clientX, e.clientY);
    } else {
      aimAtPointer(e.clientX, e.clientY, false);
    }
  }, [canAim, matchPhase, scene3DRef, aimAtPointer, moveGhostTo, worldRef, aimRef, legalTargets]);

  /** 指针抬起 */
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    lineLastXRef.current = null;
    precisionRef.current = null;
    setPrecisionAim(null);
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  /** 处理点击放置白球（自由球） */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!matchRef.current || matchRef.current.phase !== 'placing') return;

    const scene = scene3DRef.current;
    if (!scene) return;

    const hit = scene.screenToTable(e.clientX, e.clientY);
    if (!hit) return;

    let ballX = hit.x;
    let ballZ = hit.z;
    const isBreakPlacement = matchRef.current.breaking;

    // 检查点击是否在台面有效范围内
    const xLimit = TABLE.width / 2 - TABLE.ballRadius;
    const zLimit = TABLE.length / 2 - TABLE.ballRadius;
    if (Math.abs(ballX) > xLimit || Math.abs(ballZ) > zLimit) {
      return;
    }

    // 开球放置：必须在开球区（head string 之后，即 z >= TABLE.length/4）
    if (isBreakPlacement) {
      const headString = TABLE.length * 0.25;
      if (ballZ < headString) {
        setMessage('place-outside-kitchen');
        return;
      }
      // 吸附到开球区边界内
      ballZ = Math.min(zLimit, Math.max(headString, ballZ));
      ballX = Math.min(xLimit, Math.max(-xLimit, ballX));
    }

    // 检查是否与其他球重叠
    const world = worldRef.current;
    const minDist = TABLE.ballRadius * 2.5;
    for (const ball of world.balls) {
      if (!ball.active || ball.number === 0) continue;
      const dx = ball.x - ballX;
      const dz = ball.z - ballZ;
      if (Math.sqrt(dx * dx + dz * dz) < minDist) {
        setMessage('place-occupied');
        return;
      }
    }

    // 检查是否在袋口附近（6 个袋口）
    const pocketPositions = [
      { x: -TABLE.width / 2, z: -TABLE.length / 2 },
      { x: TABLE.width / 2, z: -TABLE.length / 2 },
      { x: -TABLE.width / 2, z: 0 },
      { x: TABLE.width / 2, z: 0 },
      { x: -TABLE.width / 2, z: TABLE.length / 2 },
      { x: TABLE.width / 2, z: TABLE.length / 2 },
    ];
    const pocketDist = TABLE.ballRadius * 3;
    for (const pocket of pocketPositions) {
      const dx = pocket.x - ballX;
      const dz = pocket.z - ballZ;
      if (Math.sqrt(dx * dx + dz * dz) < pocketDist) {
        setMessage('place-near-pocket');
        return;
      }
    }

    // 放置白球
    const cueBall = world.balls.find(b => b.number === 0);
    if (cueBall) {
      cueBall.x = ballX;
      cueBall.z = ballZ;
      cueBall.vx = 0;
      cueBall.vz = 0;
      cueBall.active = true;
    }

    scene.setGhostCue(0, 0, false);
    if (isBreakPlacement) {
      setViewMode('first');
    }
    setMatch(m => ({ ...m, phase: 'aiming', messageKey: 'placed', messageParams: {} }));
    setWorldView(cloneWorld(world));
  }, [scene3DRef, worldRef, matchRef, setMatch, setMessage, setWorldView, setViewMode]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCanvasClick,
    precisionAim,
  };
}
