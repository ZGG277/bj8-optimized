/*
[INPUT]: 依赖 camera-state 纯状态机与 React reducer/timer 生命周期
[OUTPUT]: 对外提供相机模式、高度/方位、母球/点台/幽灵球有效落位聚焦、完整临时快照、瞄准锁镜与触球后保持→全景计时动作
[POS]: 相机 React 适配层；只调度领域事件和清理计时器，不读取 DOM、不直接操作 Scene3D
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type SetStateAction,
} from 'react';
import {
  cameraReducer,
  createCameraState,
  currentCameraAzimuth,
  currentCameraLevel,
  renderCameraState,
  snapshotCamera,
  type CameraAnchor,
  type CameraMode,
  type TemporaryCameraOwner,
} from '../camera-state';

const TOUCH_AIM_CAMERA_RELEASE_MS = 650;
const MOUSE_AIM_CAMERA_RELEASE_MS = 80;
const STRIKE_HOLD_MS = 300;

type ResetCameraOptions = {
  mode?: CameraMode;
  level?: number;
  azimuth?: number;
};

export function useCameraController() {
  const [state, dispatch] = useReducer(cameraReducer, undefined, () => createCameraState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const aimReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strikeHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAimReleaseTimer = useCallback(() => {
    if (aimReleaseTimerRef.current === null) return;
    clearTimeout(aimReleaseTimerRef.current);
    aimReleaseTimerRef.current = null;
  }, []);

  const clearStrikeHoldTimer = useCallback(() => {
    if (strikeHoldTimerRef.current === null) return;
    clearTimeout(strikeHoldTimerRef.current);
    strikeHoldTimerRef.current = null;
  }, []);

  useEffect(() => () => {
    clearAimReleaseTimer();
    clearStrikeHoldTimer();
  }, [clearAimReleaseTimer, clearStrikeHoldTimer]);

  const setViewLevel = useCallback((value: SetStateAction<number>) => {
    const current = currentCameraLevel(stateRef.current);
    const next = typeof value === 'function' ? value(current) : value;
    dispatch({ type: 'SET_LEVEL', level: next });
  }, []);

  const setCameraAzimuth = useCallback((value: SetStateAction<number>) => {
    const current = currentCameraAzimuth(stateRef.current);
    const next = typeof value === 'function' ? value(current) : value;
    dispatch({ type: 'SET_AZIMUTH', azimuth: next });
  }, []);

  const enterShot = useCallback((aim: number) => {
    clearAimReleaseTimer();
    dispatch({ type: 'ENTER_SHOT', aim });
  }, [clearAimReleaseTimer]);

  const establishAim = useCallback((aim: number) => {
    clearAimReleaseTimer();
    dispatch({ type: 'AIM_ESTABLISHED', aim });
  }, [clearAimReleaseTimer]);

  const enterTactical = useCallback((options: { level?: number; azimuth?: number } = {}) => {
    clearAimReleaseTimer();
    dispatch({ type: 'ENTER_TACTICAL', ...options });
  }, [clearAimReleaseTimer]);

  const enterSpectator = useCallback((level: number, azimuth: number) => {
    clearAimReleaseTimer();
    clearStrikeHoldTimer();
    dispatch({ type: 'SPECTATOR_ENTER', level, azimuth });
  }, [clearAimReleaseTimer, clearStrikeHoldTimer]);

  const exitSpectator = useCallback(() => {
    dispatch({ type: 'SPECTATOR_EXIT' });
  }, []);

  const toggleOrbit = useCallback(() => {
    clearAimReleaseTimer();
    dispatch({ type: 'TOGGLE_ORBIT' });
  }, [clearAimReleaseTimer]);

  const recenter = useCallback((level: number, azimuth: number) => {
    dispatch({ type: 'RECENTER', level, azimuth });
  }, []);

  const lockAimCamera = useCallback((azimuth: number): boolean => {
    if (stateRef.current.mode !== 'shot') return false;
    clearAimReleaseTimer();
    dispatch({ type: 'AIM_LOCK', azimuth });
    return true;
  }, [clearAimReleaseTimer]);

  const releaseAimCameraLater = useCallback((pointerType: string) => {
    clearAimReleaseTimer();
    const delay = pointerType === 'mouse'
      ? MOUSE_AIM_CAMERA_RELEASE_MS
      : TOUCH_AIM_CAMERA_RELEASE_MS;
    aimReleaseTimerRef.current = setTimeout(() => {
      aimReleaseTimerRef.current = null;
      dispatch({ type: 'AIM_RELEASE' });
    }, delay);
  }, [clearAimReleaseTimer]);

  const releaseAimCameraNow = useCallback(() => {
    clearAimReleaseTimer();
    dispatch({ type: 'AIM_RELEASE' });
  }, [clearAimReleaseTimer]);

  const beginTemporary = useCallback((
    owner: TemporaryCameraOwner,
    level: number,
    azimuth: number,
  ) => {
    clearAimReleaseTimer();
    dispatch({ type: 'TEMP_ENTER', owner, level, azimuth });
  }, [clearAimReleaseTimer]);

  const restoreTemporary = useCallback((owner: TemporaryCameraOwner) => {
    dispatch({ type: 'TEMP_EXIT', owner });
  }, []);

  const strikeContact = useCallback((options: {
    anchor: CameraAnchor;
    level: number;
    azimuth: number;
    previewPower: number;
  }) => {
    clearAimReleaseTimer();
    clearStrikeHoldTimer();
    dispatch({ type: 'STRIKE_CONTACT', ...options });
    const reducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    strikeHoldTimerRef.current = setTimeout(() => {
      strikeHoldTimerRef.current = null;
      dispatch({ type: 'STRIKE_HOLD_ELAPSED' });
    }, reducedMotion ? 0 : STRIKE_HOLD_MS);
  }, [clearAimReleaseTimer, clearStrikeHoldTimer]);

  const settleShot = useCallback(() => {
    clearStrikeHoldTimer();
    dispatch({ type: 'SHOT_SETTLED' });
  }, [clearStrikeHoldTimer]);

  const reset = useCallback((options: ResetCameraOptions = {}) => {
    clearAimReleaseTimer();
    clearStrikeHoldTimer();
    dispatch({ type: 'RESET', ...options });
  }, [clearAimReleaseTimer, clearStrikeHoldTimer]);

  const getRenderState = useCallback((options: {
    aim: number;
    liveCue: CameraAnchor;
    previewPower: number;
  }) => renderCameraState(stateRef.current, options), []);

  return useMemo(() => ({
    state,
    stateRef,
    mode: state.mode,
    phase: state.phase.kind,
    orbitActive: state.orbitActive,
    viewLevel: currentCameraLevel(state),
    cameraAzimuth: currentCameraAzimuth(state),
    setViewLevel,
    setCameraAzimuth,
    enterShot,
    establishAim,
    enterTactical,
    enterSpectator,
    exitSpectator,
    toggleOrbit,
    recenter,
    lockAimCamera,
    releaseAimCameraLater,
    releaseAimCameraNow,
    beginTemporary,
    restoreTemporary,
    strikeContact,
    settleShot,
    reset,
    getRenderState,
    snapshot: snapshotCamera(state),
  }), [
    beginTemporary,
    establishAim,
    enterShot,
    enterSpectator,
    enterTactical,
    exitSpectator,
    getRenderState,
    lockAimCamera,
    recenter,
    releaseAimCameraLater,
    releaseAimCameraNow,
    reset,
    restoreTemporary,
    setCameraAzimuth,
    setViewLevel,
    settleShot,
    state,
    strikeContact,
    toggleOrbit,
  ]);
}
