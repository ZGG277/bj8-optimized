/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机、Scene3D 快照适配器、audio 合成音效与 React 状态
[OUTPUT]: 对外提供完整对局编排：陪练/挑战、首局分阶段引导、整局结束能力评估、移动端运动快照降频、按需走位预算与已查看方案快照、幽灵球落位自动第一人称、击球后全局观察与显式 shot/tactical/spectator 视角
[POS]: 实验场的产品编排层，只消费物理快照与规则迁移；不得在此重新实现规则判定或底层蓄力时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getCueBall,
  strikeCueBall,
  cloneWorld,
} from './physics';
import { legalNumbers } from './match/match-machine';
import { useShotInput } from './input/use-shot-input';
import { MIN_POWER, type ShotIntent } from './input/shot-input';
import { usePhysicsLoop } from './simulation/use-physics-loop';
import { renderBudgetFor } from './render-policy';
import { useGameState } from './hooks/useGameState';
import { useAimInteraction } from './hooks/useAimInteraction';
import { useOpponentAI } from './hooks/useOpponentAI';
import { useAudioManager } from './hooks/useAudioManager';
import { usePositionPlan } from './hooks/usePositionPlan';
import { useAimAssist } from './hooks/useAimAssist';
import { useCameraController } from './hooks/useCameraController';
import { useSceneBridge } from './hooks/useSceneBridge';
import { Scoreboard } from './components/Scoreboard';
import { TableStage } from './components/TableStage';
import { ControlDeck } from './components/ControlDeck';
import { PlanOverlay } from './components/PlanOverlay';
import { ReviewOverlay } from './components/ReviewOverlay';
import { IntroScreen } from './components/IntroScreen';
import { FirstMatchGuide } from './components/FirstMatchGuide';
import type { Scene3D } from './Scene3D';
import type { PositionPlan } from './planner/search';
import { buildShotReview, type ShotCapture, type ShotReview } from './planner/review';
import { findPrecisionAim } from './aim/aim-solution';
import {
  OVERHEAD_VIEW,
  SPECTATOR_VIEW_LEVEL,
  cameraAzimuthAfterDrag,
  fullTableAzimuthForViewport,
} from './camera-view';
import { cameraInteractionFor } from './camera-state';
import type { GameMode, PositionOutcome } from './opponent/model';
import {
  guideStepAfterEvent,
  saveFirstMatchGuideCompleted,
  shouldRunFirstMatchGuide,
  type FirstMatchGuideEvent,
  type FirstMatchGuideStep,
} from './first-match-guide';

type SkillShotCapture = {
  target: number | null;
  pocket: number | null;
  tolerance: number | null;
  assisted: boolean;
};

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function Game() {
  // ── 对局编排状态 ──
  const {
    worldRef, worldView, setWorldView,
    match, matchRef, setMatch,
    playerSkill, gameMode, opponentProfile,
    recordPlayerShot, completeMatchAssessment,
    canAim: canAimBase, setMessage, resetGame, settleShotRaw,
  } = useGameState();

  const legalTargets = useMemo(
    () =>
      match.phase === 'aiming' && match.actor === 'player' && !worldView.moving
        ? legalNumbers(worldView, 'player', match.playerGroup)
        : [],
    [match.phase, match.actor, match.playerGroup, worldView],
  );

  // ── 3D 场景 ──
  const containerRef = useRef<HTMLDivElement>(null);
  const scene3DRef = useRef<Scene3D | null>(null);
  const camera = useCameraController();
  const { viewLevel, setCameraAzimuth } = camera;
  const cancelAimInteractionRef = useRef<() => void>(() => {});
  const aimCameraPointerRef = useRef<number | null>(null);
  const cameraGesturePointerRef = useRef<number | null>(null);
  const orbitPointerRef = useRef<{
    id: number; lastX: number; target: HTMLElement;
  } | null>(null);
  const cameraAzimuthRef = useRef(camera.cameraAzimuth);
  const endCameraInteraction = useCallback(() => {
    cancelAimInteractionRef.current();
    camera.releaseAimCameraNow();
    aimCameraPointerRef.current = null;
    cameraGesturePointerRef.current = null;
    const orbit = orbitPointerRef.current;
    if (orbit?.target.hasPointerCapture(orbit.id)) orbit.target.releasePointerCapture(orbit.id);
    orbitPointerRef.current = null;
    scene3DRef.current?.endCameraGesture();
  }, [camera]);
  const spectatorActive =
    match.actor === 'opponent' && (match.phase === 'opponent' || match.phase === 'rolling');
  const canonicalTableAzimuth = useCallback(() => {
    const element = containerRef.current;
    const width = element?.clientWidth ?? (typeof window === 'undefined' ? 1280 : window.innerWidth);
    const height = element?.clientHeight ?? (typeof window === 'undefined' ? 800 : window.innerHeight);
    return fullTableAzimuthForViewport(width, height);
  }, []);
  const physicsPresentationIntervalMs = useMemo(() => {
    if (typeof window === 'undefined') return 0;
    const budget = renderBudgetFor({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    return budget.mobile ? 1000 / budget.movingPresentationFps : 0;
  }, []);

  // 禁用移动端长按唤出复制/全选/分享菜单，避免干扰击球与蓄力
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefault);
    return () => document.removeEventListener('contextmenu', preventDefault);
  }, []);

  // ── 走位规划（后台预算 + 覆盖层状态机）──
  const guidanceAllowed = gameMode === 'practice';
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);
  const positionPlan = usePositionPlan({
    worldView,
    match,
    enabled: guidanceAllowed && guidanceEnabled,
  });
  const planOpen = positionPlan.status === 'showing';
  // positionPlan 对象每渲染换新身份；出杆捕获只需读 plans，用 ref 镜像避免 handleCommit 重建
  const positionPlanRef = useRef(positionPlan);
  positionPlanRef.current = positionPlan;
  const planConsultedRef = useRef<PositionPlan['steps'][number] | null>(null);

  // ── 击球复盘（上一杆「计划 vs 实际」）──
  // 出杆瞬间在 handleCommit 的 doShot 里捕获快照；对手杆走 useOpponentAI 不经此路，天然只记玩家杆
  const shotCaptureRef = useRef<ShotCapture | null>(null);
  const skillShotCaptureRef = useRef<SkillShotCapture | null>(null);
  const [shotReview, setShotReview] = useState<ShotReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // 临时全台视图拥有完整相机快照；展开时不允许出杆丢失恢复点。
  const canAim = canAimBase && !planOpen && !reviewOpen;
  // “走位与击球复盘”是独立开关；默认关闭，规划与复盘都只缓存、不主动弹出。
  const aimAssist = useAimAssist();
  const [firstMatchGuideStep, setFirstMatchGuideStep] =
    useState<FirstMatchGuideStep | null>(() =>
      shouldRunFirstMatchGuide(
        browserStorage(),
        playerSkill.totalPlayerShots,
      )
        ? 'break-place'
        : null);
  const firstMatchGuideStepRef = useRef(firstMatchGuideStep);
  firstMatchGuideStepRef.current = firstMatchGuideStep;
  const finishFirstMatchGuide = useCallback(() => {
    saveFirstMatchGuideCompleted(browserStorage());
    firstMatchGuideStepRef.current = null;
    setFirstMatchGuideStep(null);
  }, []);
  const advanceFirstMatchGuide = useCallback((event: FirstMatchGuideEvent) => {
    const current = firstMatchGuideStepRef.current;
    if (!current) return;
    const next = guideStepAfterEvent(current, event);
    if (!next) {
      finishFirstMatchGuide();
      return;
    }
    firstMatchGuideStepRef.current = next;
    setFirstMatchGuideStep(next);
  }, [finishFirstMatchGuide]);

  // 放球完成直接进入开球瞄准；首局结束即永久收起，避免第二局继续打扰。
  useEffect(() => {
    if (!firstMatchGuideStep) return;
    if (match.phase === 'finished') {
      finishFirstMatchGuide();
      return;
    }
    if (
      firstMatchGuideStep === 'break-place' &&
      match.phase === 'aiming' &&
      match.actor === 'player'
    ) {
      advanceFirstMatchGuide('cue-placed');
    }
  }, [
    advanceFirstMatchGuide,
    finishFirstMatchGuide,
    firstMatchGuideStep,
    match.actor,
    match.phase,
  ]);

  // 规划/复盘向相机控制器申请临时全台视图；关闭时原子恢复完整快照。
  const handleOpenPlan = useCallback(() => {
    if (!guidanceAllowed) return;
    endCameraInteraction();
    planConsultedRef.current = positionPlan.plans[0]?.steps[0] ?? null;
    camera.beginTemporary('plan', OVERHEAD_VIEW, canonicalTableAzimuth());
    positionPlan.open();
  }, [camera, canonicalTableAzimuth, endCameraInteraction, guidanceAllowed, positionPlan]);
  const handleClosePlan = useCallback(() => {
    endCameraInteraction();
    positionPlan.close();
    camera.restoreTemporary('plan');
    setGuidanceEnabled(false);
  }, [camera, endCameraInteraction, positionPlan]);

  // 用户显式开启走位/复盘后才启动 Worker；结果到达时自动展开，不要求重复点击。
  useEffect(() => {
    if (
      guidanceEnabled &&
      !shotReview &&
      positionPlan.status === 'ready' &&
      !planOpen
    ) {
      handleOpenPlan();
    }
  }, [guidanceEnabled, shotReview, positionPlan.status, planOpen, handleOpenPlan]);

  // ── 复盘开合：▶ 对比切俯视 + 场景叠加；✕/💡 收起回 chip ──
  const handleOpenReview = useCallback(() => {
    if (!shotReview) return;
    endCameraInteraction();
    setGuidanceEnabled(true);
    camera.beginTemporary('review', OVERHEAD_VIEW, canonicalTableAzimuth());
    setReviewOpen(true);
    scene3DRef.current?.showReviewOverlay(shotReview);
  }, [camera, canonicalTableAzimuth, endCameraInteraction, shotReview]);
  const handleCloseReview = useCallback(() => {
    endCameraInteraction();
    setReviewOpen(false);
    scene3DRef.current?.showReviewOverlay(null);
    camera.restoreTemporary('review');
    setGuidanceEnabled(false);
  }, [camera, endCameraInteraction]);

  // 走位/复盘开关默认关闭；复盘优先，规划仅在用户主动开启时打开。
  const handleTogglePlan = useCallback(() => {
    if (!guidanceAllowed) return;
    if (guidanceEnabled) {
      if (planOpen) handleClosePlan();
      if (reviewOpen) handleCloseReview();
      setGuidanceEnabled(false);
      return;
    }
    setGuidanceEnabled(true);
    if (!shotReview && positionPlan.status === 'ready') handleOpenPlan();
  }, [
    guidanceEnabled,
    guidanceAllowed,
    planOpen,
    reviewOpen,
    shotReview,
    positionPlan.status,
    handleCloseReview,
    handleClosePlan,
    handleOpenPlan,
  ]);

  // 复盘被清空（对手杆结算/新一杆出杆）时，同步收起可能还展开着的场景叠加
  useEffect(() => {
    if (!shotReview && reviewOpen) {
      setReviewOpen(false);
      scene3DRef.current?.showReviewOverlay(null);
      camera.restoreTemporary('review');
    }
  }, [camera, shotReview, reviewOpen]);

  const handleShowPlanStep = useCallback((plan: PositionPlan | null, stepIndex: number) => {
    scene3DRef.current?.showPlanStep(plan, stepIndex);
  }, []);

  // ── 音效 ──
  const { audioRef, playPhysicsEvents, playStrike, resetEvents } = useAudioManager();

  // ── 瞄准交互状态（ref，在 handleCommit 与 useAimInteraction 之间共享）──
  const aimGhostDistRef = useRef<number | null>(null);
  // 瞄准值同步到 3D 场景用的 ref
  const aimRef = useRef(0);
  const resetSpinRef = useRef<() => void>(() => {});
  const spectatorWasActiveRef = useRef(false);

  // 对手接管进入 spectator；交棒后显式落到 tactical，保留观战高度与朝向供规划。
  useEffect(() => {
    const wasActive = spectatorWasActiveRef.current;
    if (spectatorActive && !wasActive) {
      endCameraInteraction();
      camera.enterSpectator(
        Math.max(viewLevel, SPECTATOR_VIEW_LEVEL),
        canonicalTableAzimuth(),
      );
    } else if (!spectatorActive && wasActive) {
      endCameraInteraction();
      camera.exitSpectator();
    }
    spectatorWasActiveRef.current = spectatorActive;
  }, [camera, canonicalTableAzimuth, endCameraInteraction, spectatorActive, viewLevel]);

  // ── 出杆提交：输入层只给 ShotIntent，这里负责球杆动画与物理击球 ──
  const handleCommit = useCallback((intent: ShotIntent) => {
    endCameraInteraction();
    const angle = aimRef.current;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return;
    // 出杆后靶点回自动：下一杆幽灵球重新贴首触点
    aimGhostDistRef.current = null;
    // 新一杆出杆：上一杆复盘自动消失
    setShotReview(null);
    setReviewOpen(false);
    setGuidanceEnabled(false);
    scene3DRef.current?.showReviewOverlay(null);

    const doShot = () => {
      const consultedPlan = planConsultedRef.current;
      const currentMatch = matchRef.current;
      const legal = legalNumbers(worldRef.current, 'player', currentMatch.playerGroup);
      const declaredIntent = currentMatch.breaking
        ? null
        : findPrecisionAim(worldRef.current, angle, legal);
      skillShotCaptureRef.current = {
        target: declaredIntent?.target ?? null,
        pocket: declaredIntent?.pocket ?? null,
        tolerance: declaredIntent?.halfWidth ?? null,
        assisted: consultedPlan !== null,
      };
      planConsultedRef.current = null;
      // 击球前快照（复盘捕获点）：strikeCueBall 会改写 worldRef，必须先克隆
      shotCaptureRef.current = {
        worldBefore: cloneWorld(worldRef.current),
        angle,
        power: intent.power,
        spin: intent.spin,
        planned: consultedPlan ?? positionPlanRef.current.plans[0]?.steps[0] ?? null,
      };
      if (!strikeCueBall(worldRef.current, angle, intent.power, intent.spin)) {
        shotCaptureRef.current = null;
        skillShotCaptureRef.current = null;
        return;
      }
      const cameraAtContact = camera.getRenderState({
        aim: angle,
        liveCue: { cueX: cueBall.x, cueZ: cueBall.z },
        previewPower: intent.power,
      });
      camera.strikeContact({
        anchor: { cueX: cueBall.x, cueZ: cueBall.z },
        level: cameraAtContact.viewLevel,
        azimuth: cameraAtContact.cameraAzimuth,
        previewPower: intent.power,
      });
      advanceFirstMatchGuide('shot-committed');
      // 每杆只在物理确认击球成功后复位中杆，避免动画取消时误清用户设置。
      resetSpinRef.current();
      playStrike(intent.power);
      resetEvents();
      setWorldView(cloneWorld(worldRef.current));
      setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
    };

    const scene = scene3DRef.current;
    if (scene) {
      scene.triggerStrike({ cueX: cueBall.x, cueZ: cueBall.z, angle, power: intent.power, spin: intent.spin, onContact: doShot });
    } else {
      doShot();
    }
  }, [advanceFirstMatchGuide, camera, endCameraInteraction, worldRef, matchRef, aimGhostDistRef, scene3DRef, playStrike, resetEvents, setWorldView, setMatch]);

  // ── 出杆输入协调器 ──
  const {
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
  } = useShotInput({ canShoot: canAim, onCommit: handleCommit, worldRef, breaking: match.breaking });
  resetSpinRef.current = () => setSpin({ x: 0, y: 0 });
  aimRef.current = aim;
  const liveCue = getCueBall(worldView);
  const cameraRender = camera.getRenderState({
    aim,
    liveCue: { cueX: liveCue?.x ?? 0, cueZ: liveCue?.z ?? 0 },
    previewPower,
  });
  const cameraViewAzimuth = cameraRender.cameraAzimuth;
  const cameraViewAzimuthRef = useRef(cameraViewAzimuth);
  cameraViewAzimuthRef.current = cameraViewAzimuth;
  cameraAzimuthRef.current = cameraViewAzimuth;

  const handleEnterShotCamera = useCallback(
    () => { endCameraInteraction(); camera.enterShot(aimRef.current); }, [camera, endCameraInteraction]);
  const handleAimEstablishedCamera = useCallback(
    () => camera.establishAim(aimRef.current), [camera]);

  const handleEnterTacticalCamera = useCallback(() => {
    endCameraInteraction();
    camera.enterTactical({ level: OVERHEAD_VIEW, azimuth: canonicalTableAzimuth() });
  }, [camera, canonicalTableAzimuth, endCameraInteraction]);

  const handleToggleCameraOrbit = useCallback(() => {
    endCameraInteraction(); camera.toggleOrbit();
  }, [camera, endCameraInteraction]);

  // ── 瞄准交互（在 useShotInput 之后，以获取 setAim）──
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    cancelActiveInteraction,
    handleAimDialAdjust,
    toggleAimDialPrecision,
    aimDialVisible,
    aimDialPrecisionActive,
  } = useAimInteraction({
    scene3DRef,
    worldRef,
    setAim,
    aimRef,
    aimGhostDistRef,
    canAim,
    matchPhase: match.phase,
    breaking: match.breaking,
    setMatch,
    setMessage,
    setWorldView,
    onCuePlaced: handleAimEstablishedCamera,
    onAimEstablished: handleAimEstablishedCamera,
    onCoarseAimAdjusted: () => {
      advanceFirstMatchGuide('coarse-aim-adjusted');
    },
  });
  cancelAimInteractionRef.current = cancelActiveInteraction;

  const stageInteractionMode = cameraInteractionFor(
    camera.state,
    match.phase === 'placing',
  );
  const handleStagePointerDown = useCallback((event: ReactPointerEvent) => {
    if (stageInteractionMode === 'orbit') {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const activeOrbit = orbitPointerRef.current;
      if (activeOrbit && activeOrbit.id !== event.pointerId) return;
      event.preventDefault();
      orbitPointerRef.current = {
        id: event.pointerId,
        lastX: event.clientX,
        target: event.currentTarget as HTMLElement,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (cameraGesturePointerRef.current !== null && cameraGesturePointerRef.current !== event.pointerId) return;
    if (canAim || match.phase === 'placing') {
      scene3DRef.current?.beginCameraGesture();
      cameraGesturePointerRef.current = event.pointerId;
    }
    if (canAim && camera.lockAimCamera(cameraViewAzimuthRef.current)) {
      aimCameraPointerRef.current = event.pointerId;
    }
    handlePointerDown(event);
  }, [
    camera,
    canAim,
    handlePointerDown,
    match.phase,
    stageInteractionMode,
  ]);

  const handleStagePointerMove = useCallback((event: ReactPointerEvent) => {
    const orbit = orbitPointerRef.current;
    if (stageInteractionMode !== 'orbit' || !orbit || orbit.id !== event.pointerId) {
      if (stageInteractionMode === 'aim') handlePointerMove(event);
      return;
    }
    event.preventDefault();
    const delta = event.clientX - orbit.lastX;
    orbit.lastX = event.clientX;
    setCameraAzimuth(current => cameraAzimuthAfterDrag(current, delta));
  }, [handlePointerMove, stageInteractionMode]);

  const finishStagePointer = useCallback((
    event: ReactPointerEvent,
    aimHandler: (event: ReactPointerEvent) => void,
  ) => {
    const orbit = orbitPointerRef.current;
    if (stageInteractionMode === 'orbit' && orbit?.id === event.pointerId) {
      event.preventDefault();
      orbitPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    aimHandler(event);
    if (cameraGesturePointerRef.current === event.pointerId) {
      cameraGesturePointerRef.current = null;
      scene3DRef.current?.endCameraGesture();
    }
    const ownsAimCameraLock = aimCameraPointerRef.current === event.pointerId;
    if (ownsAimCameraLock) {
      aimCameraPointerRef.current = null;
      camera.releaseAimCameraLater(event.pointerType);
    }
  }, [camera, stageInteractionMode]);

  const handleStableAimDialAdjust = useCallback((
    pixelDelta: number,
    pressureGain = 1,
  ) => {
    const coarsePointer = typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches;
    if (canAim && camera.mode === 'shot') {
      camera.lockAimCamera(cameraViewAzimuthRef.current);
      const adjustedMode = handleAimDialAdjust(pixelDelta, pressureGain);
      if (adjustedMode === 'fine') advanceFirstMatchGuide('fine-aim-adjusted');
      camera.releaseAimCameraLater(coarsePointer ? 'touch' : 'mouse');
      return;
    }
    const adjustedMode = handleAimDialAdjust(pixelDelta, pressureGain);
    if (adjustedMode === 'fine') advanceFirstMatchGuide('fine-aim-adjusted');
  }, [
    advanceFirstMatchGuide,
    camera,
    canAim,
    handleAimDialAdjust,
  ]);

  const handleCameraRecenter = useCallback(() => {
    camera.recenter(
      Math.max(viewLevel, SPECTATOR_VIEW_LEVEL),
      canonicalTableAzimuth(),
    );
  }, [camera, canonicalTableAzimuth, viewLevel]);

  const handleGuideViewLevel = useCallback((level: number) => {
    const adjusted = Math.abs(level - viewLevel) > 0.0005;
    camera.setViewLevel(level);
    if (canAim && adjusted) advanceFirstMatchGuide('view-adjusted');
  }, [advanceFirstMatchGuide, camera, canAim, viewLevel]);

  const handleGuideSpinChange = useCallback((nextSpin: typeof spin) => {
    const adjusted =
      Math.abs(nextSpin.x - spin.x) > 0.0005 ||
      Math.abs(nextSpin.y - spin.y) > 0.0005;
    setSpin(nextSpin);
    if (canAim && adjusted) advanceFirstMatchGuide('spin-adjusted');
  }, [advanceFirstMatchGuide, canAim, setSpin, spin]);

  const handleGuideLayoutAdjusted = useCallback(() => {
    advanceFirstMatchGuide('layout-adjusted');
  }, [advanceFirstMatchGuide]);

  // ── 重置游戏 ──
  const handleResetGame = useCallback((nextMode: GameMode) => {
    endCameraInteraction();
    resetGame(setAim, nextMode);
    setSpin({ x: 0, y: 0 });
    setGuidanceEnabled(false);
    camera.reset({
      mode: 'tactical',
      level: OVERHEAD_VIEW,
      azimuth: canonicalTableAzimuth(),
    });
    planConsultedRef.current = null;
    skillShotCaptureRef.current = null;
    aimGhostDistRef.current = null;
    scene3DRef.current?.setAimGhostDist(null);
  }, [camera, canonicalTableAzimuth, endCameraInteraction, resetGame, setAim, setSpin, aimGhostDistRef]);
  const handleReplay = useCallback(() => {
    handleResetGame(gameMode);
  }, [gameMode, handleResetGame]);

  // ── 物理停止结算 ──
  const settleShot = useCallback(() => {
    const settlement = settleShotRaw();
    if (settlement) {
      camera.settleShot();
      const needsPlacement = settlement.resolution.effects.some(
        effect => effect.type === 'request-player-placement',
      );
      if (needsPlacement) {
        camera.enterTactical({
          level: OVERHEAD_VIEW,
          azimuth: canonicalTableAzimuth(),
        });
      }
    }
    // 复盘生成：有捕获（玩家杆）→ 判定；无捕获（对手杆）→ 清掉旧复盘
    const capture = shotCaptureRef.current;
    shotCaptureRef.current = null;
    const review = capture ? buildShotReview(capture) : null;
    setShotReview(review);
    // 只记录复盘，不主动打开；用户需要再次开启“走位与击球复盘”。
    setGuidanceEnabled(false);

    const skillCapture = skillShotCaptureRef.current;
    skillShotCaptureRef.current = null;
    if (settlement && skillCapture && capture) {
      const { facts, resolution } = settlement;
      const messageKey = resolution.next.messageKey;
      const foul = messageKey === 'foul' || messageKey === 'lose-8-foul';
      const pocketed =
        skillCapture.target !== null && facts.pocketed.includes(skillCapture.target);
      const samePlan =
        skillCapture.target !== null &&
        skillCapture.pocket !== null &&
        review?.planned.candidate.target === skillCapture.target &&
        review.planned.candidate.pocket === skillCapture.pocket;
      let position: PositionOutcome = 'unknown';
      if (pocketed && samePlan) {
        position = review.verdict === 'perfect' ? 'success' : 'miss';
      }
      recordPlayerShot({
        tolerance: skillCapture.tolerance,
        pocketed,
        foul,
        position,
        assisted: skillCapture.assisted,
      });
    }
    if (settlement?.resolution.next.phase === 'finished') {
      completeMatchAssessment();
    }
  }, [camera, canonicalTableAzimuth, completeMatchAssessment, recordPlayerShot, settleShotRaw]);

  // ── 物理模拟循环 ──
  usePhysicsLoop({
    active: match.phase === 'rolling',
    worldRef,
    onFrame: useCallback(() => {
      playPhysicsEvents(worldRef.current.events);
      setWorldView(cloneWorld(worldRef.current));
    }, [worldRef, playPhysicsEvents, setWorldView]),
    onSettled: settleShot,
    presentationIntervalMs: physicsPresentationIntervalMs,
  });

  // ── 对手 AI 回合 ──
  useOpponentAI({
    active: match.phase === 'opponent',
    worldRef,
    matchRef,
    scene3DRef,
    audioRef,
    opponentProfile,
    playerGroup: match.playerGroup,
    setWorldView,
    setMatch,
    setMessage,
    onShot: resetEvents,
  });

  useSceneBridge({
    containerRef,
    scene3DRef,
    worldRef,
    worldView,
    setWorldView,
    matchRef,
    setMatch,
    matchPhase: match.phase,
    aim,
    aimRef,
    spin,
    previewPower,
    aimGhostDistRef,
    aimAssistVisible: aimAssist.enabled,
    legalTargets,
    cameraRender,
    cameraStateRef: camera.stateRef,
    cameraAzimuthRef,
    cameraViewAzimuthRef,
  });

  // ── 渲染 ──
  return (
    <div className="game-shell">
      <Scoreboard
        match={match}
        worldView={worldView}
        playerSkill={playerSkill}
        opponentProfile={opponentProfile}
      />
      <TableStage
        viewLevel={cameraRender.viewLevel}
        spectatorActive={spectatorActive}
        cameraMode={camera.mode}
        cameraPhase={camera.phase}
        cameraInteraction={stageInteractionMode}
        firstMatchGuideActive={Boolean(firstMatchGuideStep)}
        match={match}
        containerRef={containerRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={(event) => finishStagePointer(event, handlePointerUp)}
        onPointerCancel={(event) => finishStagePointer(event, handlePointerCancel)}
        onCameraRecenter={handleCameraRecenter}
        onResetGame={handleReplay}
      />
      <ControlDeck
        viewLevel={viewLevel}
        cameraMode={camera.mode}
        cameraOrbitActive={camera.orbitActive}
        canAim={canAim}
        spin={spin}
        charging={charging}
        previewPower={previewPower}
        breaking={match.breaking}
        planStatus={guidanceAllowed ? positionPlan.status : 'idle'}
        guidanceEnabled={guidanceAllowed && guidanceEnabled}
        hasReview={guidanceAllowed && Boolean(shotReview)}
        aimAssistEnabled={aimAssist.enabled}
        aimDialVisible={aimDialVisible}
        aimDialPrecisionActive={aimDialPrecisionActive}
        onViewLevel={handleGuideViewLevel}
        onEnterTacticalCamera={handleEnterTacticalCamera}
        onEnterShotCamera={handleEnterShotCamera}
        onToggleCameraOrbit={handleToggleCameraOrbit}
        onSpinChange={handleGuideSpinChange}
        onLayoutAdjusted={handleGuideLayoutAdjusted}
        onToggleGuidance={handleTogglePlan}
        onToggleAimAssist={aimAssist.toggle}
        onAimDialAdjust={handleStableAimDialAdjust}
        onToggleAimDialPrecision={toggleAimDialPrecision}
        onBeginCharge={beginCharge}
        onUpdateCharge={updateCharge}
        onReleaseCharge={releaseCharge}
        onCancelCharge={cancelCharge}
        onTapShot={() => commitShot({ power: MIN_POWER, spin })}
      />
      {guidanceAllowed && guidanceEnabled && planOpen && (
        <PlanOverlay
          plans={positionPlan.plans}
          onClose={handleClosePlan}
          onShowStep={handleShowPlanStep}
        />
      )}
      {/* 复盘讲上一杆、规划讲下一杆可共存；planOpen 时提示条位置让位给引导，chip 隐藏 */}
      {guidanceAllowed && guidanceEnabled && shotReview && !planOpen && (
        <ReviewOverlay
          review={shotReview}
          open={reviewOpen}
          onOpen={handleOpenReview}
          onClose={handleCloseReview}
        />
      )}
      {firstMatchGuideStep && (
        <FirstMatchGuide
          step={firstMatchGuideStep}
          visible={
            !planOpen &&
            !reviewOpen &&
            (
              (match.phase === 'placing' && match.breaking) ||
              (match.phase === 'aiming' && match.actor === 'player')
            )
          }
          onSkip={finishFirstMatchGuide}
        />
      )}
      {match.phase === 'intro' && (
        <IntroScreen playerSkill={playerSkill} onStart={handleResetGame} />
      )}
    </div>
  );
}
