/*
[INPUT]: React 生命周期、canShoot 门禁、onCommit 回调与 pointer/keyboard 原始事件
[OUTPUT]: 对外提供 useShotInput 协调器：世界角 aim、spin/previewPower/charging 状态与 begin/update/cancel/release/commit 动作
[POS]: 输入协调层,只做会话管理与事件归一;力度与击球点的事实计算委托 shot-input 纯函数
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CueSpin, BilliardsWorld } from '../physics';
import { getCueBall, clampAimToForwardHalf } from '../physics';
import {
  buildShotIntent,
  powerFromDrag,
  powerFromHold,
  type ChargeSession,
  type ShotIntent,
} from './shot-input';

export const AIM_BASE_SPEED = 0.35;   // rad/s
export const AIM_ACCEL = 0.45;        // rad/s²
export const AIM_MAX_SPEED = 1.6;     // rad/s

// 瞄准为全周角：幽灵球靶点范式允许 360° 旋转，取值归一到 (-π, π]
function wrapAim(v: number) {
  return Math.atan2(Math.sin(v), Math.cos(v));
}

/** 帧率无关的持续按键瞄准积分；frameSeconds 钳制防标签页恢复后一帧跳角。 */
export function aimDeltaForHold(
  direction: -1 | 0 | 1,
  heldSeconds: number,
  frameSeconds: number,
): number {
  const speed = Math.min(AIM_MAX_SPEED, AIM_BASE_SPEED + Math.max(0, heldSeconds) * AIM_ACCEL);
  return direction * speed * Math.min(0.05, Math.max(0, frameSeconds));
}

export type ShotInputApi = {
  aim: number;
  spin: CueSpin;
  previewPower: number;
  charging: boolean;
  setAim: React.Dispatch<React.SetStateAction<number>>;
  setSpin: React.Dispatch<React.SetStateAction<CueSpin>>;
  beginCharge: (clientY: number, availableTravel: number) => void;
  updateCharge: (clientY: number) => void;
  cancelCharge: () => void;
  releaseCharge: () => void;
  commitShot: (intent: ShotIntent) => void;
};

type Options = {
  /** 只有 true 时允许开始蓄力与提交出杆;rolling/opponent/placing/disabled 一律拒绝 */
  canShoot: boolean;
  /** 每次用户动作至多触发一次;由调用方执行球杆动画与物理击球 */
  onCommit: (intent: ShotIntent) => void;
  /** 物理世界 ref，用于把瞄准角限制在母球朝向对面半台的合理范围内 */
  worldRef: React.MutableRefObject<BilliardsWorld>;
  /** 是否处于开球阶段：开球时限制只能朝球堆半台瞄准，常规回合允许 360° */
  breaking: boolean;
};

export function useShotInput({ canShoot, onCommit, worldRef, breaking }: Options): ShotInputApi {
  const [aim, setAimState] = useState(0);
  const [spin, setSpin] = useState<CueSpin>({ x: 0, y: 0 });
  const [previewPower, setPreviewPower] = useState(0);
  const [charging, setCharging] = useState(false);

  const sessionRef = useRef<ChargeSession | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const canShootRef = useRef(canShoot);
  const onCommitRef = useRef(onCommit);
  const spinRef = useRef(spin);
  const aimKeysRef = useRef<{
    left: boolean;
    right: boolean;
    leftStart: number;
    rightStart: number;
    lastFrame: number;
    raf: number | null;
  }>({
    left: false, right: false, leftStart: 0, rightStart: 0, lastFrame: 0, raf: null,
  });

  useEffect(() => { canShootRef.current = canShoot; }, [canShoot]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { spinRef.current = spin; }, [spin]);

  const setAim: React.Dispatch<React.SetStateAction<number>> = useCallback((v) => {
    setAimState(a => {
      const raw = typeof v === 'function' ? (v as (p: number) => number)(a) : v;
      const worldRaw = wrapAim(raw);
      // 只有开球阶段才把杆向限制在母球前方半台；常规回合允许 360° 瞄准
      const worldClamped = breaking
        ? clampAimToForwardHalf(getCueBall(worldRef.current), worldRaw)
        : worldRaw;
      return wrapAim(worldClamped);
    });
  }, [worldRef, breaking]);

  const stopPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
  }, []);

  const beginCharge = useCallback((clientY: number, availableTravel: number) => {
    if (!canShootRef.current || sessionRef.current) return;
    sessionRef.current = { kind: 'drag', startY: clientY, currentY: clientY, availableTravel };
    setCharging(true);
    setPreviewPower(0);
  }, []);

  const updateCharge = useCallback((clientY: number) => {
    const s = sessionRef.current;
    if (!s || s.kind !== 'drag') return;
    s.currentY = clientY;
    // 预览与最终用同一纯函数,只是中间值
    setPreviewPower(powerFromDrag(s.startY, clientY, s.availableTravel));
  }, []);

  const beginHoldCharge = useCallback(() => {
    if (!canShootRef.current || sessionRef.current) return;
    sessionRef.current = { kind: 'hold', startTime: performance.now() };
    setCharging(true);
    setPreviewPower(0);
    // rAF 只做视觉预览,最终力度在松开时按真实时长重算
    const loop = () => {
      const cur = sessionRef.current;
      if (!cur || cur.kind !== 'hold') return;
      setPreviewPower(powerFromHold(cur.startTime, performance.now()));
      previewRafRef.current = requestAnimationFrame(loop);
    };
    previewRafRef.current = requestAnimationFrame(loop);
  }, []);

  const cancelCharge = useCallback(() => {
    stopPreview();
    sessionRef.current = null;
    setCharging(false);
  }, [stopPreview]);

  const commitShot = useCallback((intent: ShotIntent) => {
    if (!canShootRef.current) return;
    onCommitRef.current(intent);
  }, []);

  const releaseCharge = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    stopPreview();
    sessionRef.current = null;
    setCharging(false);
    if (!canShootRef.current) return;
    // 唯一事实出口:松开这一刻一次性算出 ShotIntent
    const intent = buildShotIntent(s, spinRef.current, performance.now());
    setPreviewPower(intent.power);
    onCommitRef.current(intent);
  }, [stopPreview]);

  // 键盘:空格按住蓄力(松开按真实时长结算),A/D/方向键持续加速微调瞄准
  useEffect(() => {
    const aimLoop = () => {
      const keys = aimKeysRef.current;
      const now = performance.now();
      const direction = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) as -1 | 0 | 1;
      const heldStart = direction < 0 ? keys.leftStart : direction > 0 ? keys.rightStart : now;
      const delta = aimDeltaForHold(direction, (now - heldStart) / 1000, (now - keys.lastFrame) / 1000);
      keys.lastFrame = now;
      if (delta !== 0) setAim(a => a + delta);
      if (keys.left || keys.right) keys.raf = requestAnimationFrame(aimLoop);
      else keys.raf = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        beginHoldCharge();
        return;
      }
      if (!canShootRef.current) return;
      if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') && !aimKeysRef.current.left) {
        e.preventDefault();
        aimKeysRef.current.left = true;
        aimKeysRef.current.leftStart = performance.now();
        aimKeysRef.current.lastFrame = aimKeysRef.current.leftStart;
        aimKeysRef.current.raf ??= requestAnimationFrame(aimLoop);
      }
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') && !aimKeysRef.current.right) {
        e.preventDefault();
        aimKeysRef.current.right = true;
        aimKeysRef.current.rightStart = performance.now();
        aimKeysRef.current.lastFrame = aimKeysRef.current.rightStart;
        aimKeysRef.current.raf ??= requestAnimationFrame(aimLoop);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        releaseCharge();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') aimKeysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') aimKeysRef.current.right = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (aimKeysRef.current.raf) cancelAnimationFrame(aimKeysRef.current.raf);
      aimKeysRef.current = {
        left: false,
        right: false,
        leftStart: 0,
        rightStart: 0,
        lastFrame: 0,
        raf: null,
      };
      stopPreview();
    };
  }, [beginHoldCharge, releaseCharge, setAim, stopPreview]);

  return {
    aim,
    spin,
    previewPower,
    charging,
    setAim,
    setSpin,
    beginCharge,
    updateCharge,
    cancelCharge,
    releaseCharge,
    commitShot,
  };
}
