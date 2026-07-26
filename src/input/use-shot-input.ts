/*
[INPUT]: React 生命周期、canShoot 门禁、onCommit 回调与 pointer/keyboard 原始事件
[OUTPUT]: 对外提供 useShotInput 协调器:aim/spin/previewPower/charging 状态与 begin/update/cancel/release/commit 动作
[POS]: 输入协调层,只做会话管理与事件归一;力度与击球点的事实计算委托 shot-input 纯函数
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CueSpin } from '../physics';
import {
  buildShotIntent,
  powerFromDrag,
  powerFromHold,
  type ChargeSession,
  type ShotIntent,
} from './shot-input';

const AIM_LIMIT = 0.72;
const AIM_BASE_SPEED = 0.0008;
const AIM_ACCEL = 0.0012;

function clampAim(v: number) {
  return Math.min(AIM_LIMIT, Math.max(-AIM_LIMIT, v));
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
};

export function useShotInput({ canShoot, onCommit }: Options): ShotInputApi {
  const [aim, setAimState] = useState(0);
  const [spin, setSpin] = useState<CueSpin>({ x: 0, y: 0 });
  const [previewPower, setPreviewPower] = useState(0);
  const [charging, setCharging] = useState(false);

  const sessionRef = useRef<ChargeSession | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const canShootRef = useRef(canShoot);
  const onCommitRef = useRef(onCommit);
  const spinRef = useRef(spin);
  const aimKeysRef = useRef<{ left: boolean; right: boolean; leftStart: number; rightStart: number; raf: number | null }>({
    left: false, right: false, leftStart: 0, rightStart: 0, raf: null,
  });

  useEffect(() => { canShootRef.current = canShoot; }, [canShoot]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { spinRef.current = spin; }, [spin]);

  const setAim: React.Dispatch<React.SetStateAction<number>> = useCallback((v) => {
    setAimState(a => clampAim(typeof v === 'function' ? (v as (p: number) => number)(a) : v));
  }, []);

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
      let delta = 0;
      if (keys.left) delta -= AIM_BASE_SPEED + (now - keys.leftStart) * AIM_ACCEL;
      if (keys.right) delta += AIM_BASE_SPEED + (now - keys.rightStart) * AIM_ACCEL;
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
        aimKeysRef.current.raf ??= requestAnimationFrame(aimLoop);
      }
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') && !aimKeysRef.current.right) {
        e.preventDefault();
        aimKeysRef.current.right = true;
        aimKeysRef.current.rightStart = performance.now();
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
      aimKeysRef.current = { left: false, right: false, leftStart: 0, rightStart: 0, raf: null };
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
