import { ControlHelp } from './components/ControlHelp';
import { positionAfterPot } from './opponent/position-observation';
/*
[INPUT]: 离线 H3 动画 WebP 开场；局前 world 参数与选择；依赖 physics 确定性世界、match 纯规则状态机、Scene3D 快照适配器、audio 合成音效与 React 状态
[OUTPUT]: 对外提供陪练/挑战、复盘/训练总结与局后可选留言、默认拨轮、延迟 3D、运动快照、按需走位、幽灵球落位瞄准/击球后目标近景→全台、双指回退视角、目标袋口自适应取景与逐陪练赞美卡册
[POS]: 正式产品编排层，只消费物理快照与规则迁移；不得在此重新实现规则判定或底层蓄力时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { gameStorage } from './minitool/persistent-storage';
import { createShotLease } from './shot-lifecycle';
import { rewardForStoppedShot, type ShotReward } from './shot-reward';
import { PauseMenu } from './components/PauseMenu';
import { CompanionCollectionBook } from './components/CompanionCollection';
import { RoyalIcon } from './components/RoyalIcon';
import { OpeningFilm } from './components/OpeningFilm';
import openingMovie from './assets/opening/arrival.webp?url';
import { actionForEvent, actionForStep, createGuideLearning, type GuideAction } from './guide-learning';
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
  TABLE,
  strikeCueBall,
  cloneWorld,
} from './physics';
import { legalNumbers } from './match/match-machine';
import { useShotInput } from './input/use-shot-input';
import { MIN_POWER, type ShotIntent } from './input/shot-input';
import { followFeelSpin, type FollowFeel } from './input/follow-feel';
import { usePhysicsLoop } from './simulation/use-physics-loop';
import { renderBudgetFor } from './render-policy';
import { useGameState } from './hooks/useGameState';
import { useStageGesture } from './hooks/useStageGesture';
import { useAimInteraction } from './hooks/useAimInteraction';
import { useOpponentAI } from './hooks/useOpponentAI';
import { useAudioManager } from './hooks/useAudioManager';
import { usePositionPlan } from './hooks/usePositionPlan';
import { useAimAssist } from './hooks/useAimAssist';
import { Scoreboard } from './components/Scoreboard';
import { TableStage } from './components/TableStage';
import { ControlDeck } from './components/ControlDeck';
import { PlanOverlay } from './components/PlanOverlay';
import { PlanStatusNotice } from './components/PlanStatusNotice';
import { ReviewOverlay } from './components/ReviewOverlay';
import { FirstMatchGuide } from './components/FirstMatchGuide';
import { ScenePicker } from './components/ScenePicker';
import { Scene3D } from './Scene3D';
import type { PlannedStep, PositionPlan } from './planner/search';
import { buildShotReview, type ShotCapture, type ShotReview } from './planner/review';
import { findPrecisionAim } from './aim/aim-solution';
import { cameraFramingForAim } from './camera-aim-intent';
import {
  cameraSafetyFromControlRects,
  DEFAULT_CAMERA_SAFETY,
  type CameraFraming,
  type CameraSafetyInsets,
} from './camera-framing';
import {
  FULL_TABLE_AZIMUTH,
  OVERHEAD_VIEW,
  SHOT_AIM_VIEW,
  cameraAzimuthAfterDrag,
  cameraAzimuthAtView,
  cameraInteractionMode,
  isGlobalCameraView,
  isOverheadCameraView,
  fullTableAzimuth,
} from './camera-view';
import { controlLearning, markControlLearned } from './control-onboarding';
import {
  createShotCameraFollow,
  observeShotCameraFollow,
  type ShotCameraFollowState,
} from './shot-camera-follow';
import type { GameMode, PositionOutcome } from './opponent/model';
import {
  guideStepAfterEvent,
  guideAfterSettlement, GUIDE_PROGRESS_KEY,
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

const TOUCH_AIM_CAMERA_RELEASE_MS = 650;
const POCKETED_SHOT_CAMERA_HOLD_MS = 420;
const STOPPED_SHOT_CAMERA_HOLD_MS = 260;

function browserStorage(): ReturnType<typeof gameStorage> {
  if (typeof window === 'undefined') return null;
  try {
    return gameStorage();
  } catch {
    return null;
  }
}

/** 控件透明悬浮在球桌上，仅避开比分栏和屏幕边界。 */
function aimCameraSafetyFor(viewport: HTMLElement) {
  const bounds = viewport.getBoundingClientRect();
  const controls: Array<{ left: number; top: number; right: number; bottom: number; dockEdge: 'top' }> = [];
  // 横屏比分栏悬浮在画布上；竖屏比分栏在画布外，由重叠检查自然跳过。
  const scoreboard = document.querySelector<HTMLElement>('.scoreboard');
  if (scoreboard) {
    const { left, top, right, bottom } = scoreboard.getBoundingClientRect();
    controls.push({ left, top, right, bottom, dockEdge: 'top' });
  }
  const x = 4 / Math.max(1, bounds.width);
  const y = 4 / Math.max(1, bounds.height);
  return cameraSafetyFromControlRects(bounds, controls, { left: x, right: x, top: y, bottom: y }, 4);
}

function sameCameraSafety(a: CameraSafetyInsets, b: CameraSafetyInsets) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

export default function Game() {
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const gamePaused = paused || collectionOpen || helpOpen;
  useEffect(() => {
    const hidden = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [openingActive, setOpeningActive] = useState(true);
  const openingCompletedRef = useRef(false);
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [followFeel, setFollowFeel] = useState<FollowFeel>('current');
  const [followShotPending, setFollowShotPending] = useState(false);
  const followShotPendingRef = useRef(false);
  const [shotReward, setShotReward] = useState<ShotReward | null>(null);
  useEffect(() => {
    if (!shotReward) return;
    const timer = window.setTimeout(() => {
      setShotReward(current => current?.shotId === shotReward.shotId ? null : current);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [shotReward]);
  const [selectedWorld, setSelectedWorld] = useState<'lake' | 'castle'>(() => {
    const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('world');
    if (query === 'lake' || query === 'castle') return query;
    try { return browserStorage()?.getItem('princess-billiards:scene:v1') === 'lake' ? 'lake' : 'castle'; } catch { return 'castle'; }
  });
  // ── 对局编排状态 ──
  const {
    worldRef, worldView, setWorldView,
    match, matchRef, setMatch,
    viewLevel, setViewLevel,
    playerSkill, trainingSummary, gameMode, opponentProfile,
    collection, collectionReward, collectionSaveFailed, victoryPraise,
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

  // Optional browser-native read-only game context; never an alternate physics path.
  useEffect(() => {
    type ToolRegistry = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => object }, options: { signal: AbortSignal }) => unknown };
    const context = (document as Document & { modelContext?: ToolRegistry }).modelContext;
    if (!context?.registerTool || typeof AbortController !== 'function') return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: 'read_princess_billiards_state',
        description: 'Read the current visible billiards match, ball groups and remaining balls. Does not play a shot or change the game.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: input => {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
          return { product: '公主请开球', world: selectedWorld, ...matchRef.current, activeBalls: worldRef.current.balls.filter(ball => ball.active).map(ball => ball.number) };
        },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Unsupported registries do not affect play. */ }
    return () => lifecycle.abort();
  }, [matchRef, worldRef, selectedWorld]);

  // ── 3D 场景 ──
  const containerRef = useRef<HTMLDivElement>(null);
  const scene3DRef = useRef<Scene3D | null>(null);
  const [cameraAzimuth, setCameraAzimuth] = useState(FULL_TABLE_AZIMUTH);
  const [cameraDetached, setCameraDetached] = useState(false);
  const [touchAimCameraLocked, setTouchAimCameraLocked] = useState(false);
  const [manualCameraActive, setManualCameraActive] = useState(false);
  const [manualCameraPinned, setManualCameraPinned] = useState(false);
  const [cameraSafety, setCameraSafety] = useState<CameraSafetyInsets>(DEFAULT_CAMERA_SAFETY);
  const [aimCameraFraming, setAimCameraFraming] = useState<CameraFraming | null>(null);
  const [shotCameraTarget, setShotCameraTarget] = useState<number | null>(null);
  const touchAimCameraTimerRef = useRef<number | null>(null);
  const shotCameraFollowRef = useRef<ShotCameraFollowState | null>(null);
  const shotCameraReturnTimerRef = useRef<number | null>(null);
  const manualAimTransitionPointerRef = useRef<number | null>(null);
  const cameraAzimuthRef = useRef(cameraAzimuth);
  cameraAzimuthRef.current = cameraAzimuth;
  const spectatorActive =
    match.actor === 'opponent' && (match.phase === 'opponent' || match.phase === 'rolling');
  const clearTouchAimCameraTimer = useCallback(() => {
    if (touchAimCameraTimerRef.current === null) return;
    window.clearTimeout(touchAimCameraTimerRef.current);
    touchAimCameraTimerRef.current = null;
  }, []);
  const clearAimCameraFraming = useCallback(() => {
    setAimCameraFraming(null);
  }, []);
  const orientFullTable = useCallback(() => {
    const element = containerRef.current;
    setCameraAzimuth(fullTableAzimuth(
      element?.clientWidth || window.innerWidth,
      element?.clientHeight || window.innerHeight,
    ));
    setCameraDetached(true);
  }, []);
  const clearShotCameraFollow = useCallback(() => {
    if (shotCameraReturnTimerRef.current !== null) {
      window.clearTimeout(shotCameraReturnTimerRef.current);
      shotCameraReturnTimerRef.current = null;
    }
    shotCameraFollowRef.current = null;
    setShotCameraTarget(null);
  }, []);
  const showFullTable = useCallback(() => {
    clearShotCameraFollow();
    clearTouchAimCameraTimer();
    clearAimCameraFraming();
    manualAimTransitionPointerRef.current = null;
    setTouchAimCameraLocked(false);
    setManualCameraActive(false);
    setManualCameraPinned(false);
    orientFullTable();
    setViewLevel(OVERHEAD_VIEW);
  }, [clearShotCameraFollow, clearTouchAimCameraTimer, clearAimCameraFraming, orientFullTable, setViewLevel]);
  const showFullTableAfterShot = useCallback(() => {
    scene3DRef.current?.beginShotCameraReturn();
    showFullTable();
  }, [showFullTable]);
  const finishShotCameraFollow = useCallback((delayMs: number) => {
    if (!shotCameraFollowRef.current || shotCameraReturnTimerRef.current !== null) return;
    shotCameraReturnTimerRef.current = window.setTimeout(() => {
      shotCameraReturnTimerRef.current = null;
      showFullTableAfterShot();
    }, delayMs);
  }, [showFullTableAfterShot]);
  const renderBudget = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        mobile: true,
        pixelRatio: 1,
        shadowMapSize: 1024 as const,
        powerPreference: 'low-power' as WebGLPowerPreference,
        movingPresentationFps: 45,
      };
    }
    return renderBudgetFor({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
  }, []);
  const [presentationFps, setPresentationFps] = useState<number>(
    renderBudget.movingPresentationFps,
  );
  const physicsPresentationIntervalMs = 1000 / presentationFps;
  const handleThermalQualityChange = useCallback((nextPresentationFps: number) => {
    setPresentationFps(current => current === nextPresentationFps ? current : nextPresentationFps);
  }, []);

  // 禁用移动端长按唤出复制/全选/分享菜单，避免干扰击球与蓄力
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefault);
    return () => document.removeEventListener('contextmenu', preventDefault);
  }, []);

  // ── 走位规划（后台预算 + 覆盖层状态机）──
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);
  const positionPlan = usePositionPlan({
    worldView,
    match,
    enabled: guidanceEnabled && !gamePaused && !renderError,
  });
  const planOpen = positionPlan.status === 'showing';
  // 规划视图打开期间禁用瞄准输入（最小侵入：只压低 canAim，不动交互层内部）
  const canAim = !gamePaused && !renderError && !openingActive && !followShotPending && canAimBase && !planOpen && !scenePickerOpen && shotCameraTarget === null;
  const planConsultedRef = useRef(false);
  /** 规划视图关闭会停用 Worker/清空 plans；另存用户真正看过的首杆直到本次出杆。 */
  const consultedPlanStepRef = useRef<PlannedStep | null>(null);

  // ── 击球复盘（默认收起；玩家从灯泡打开后才显示最新复盘）──
  // 出杆瞬间在 handleCommit 的 doShot 里捕获快照；对手杆走 useOpponentAI 不经此路，天然只记玩家杆
  const shotCaptureRef = useRef<ShotCapture | null>(null);
  const skillShotCaptureRef = useRef<SkillShotCapture | null>(null);
  const [shotReview, setShotReview] = useState<ShotReview | null>(null);
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const aimAssist = useAimAssist();
  // 拨轮是默认瞄准器；灯泡里可切换回方向键。
  const [aimDialEnabled, setAimDialEnabled] = useState(true);
  const [guideLearning] = useState(() => createGuideLearning(browserStorage()));
  const [, refreshGuideLearning] = useState(0);
  const guideGesture = useRef(0);
  const pendingGuideActions = useRef(new Set<GuideAction>());
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [manualGuide, setManualGuide] = useState(false);
  const recordGuideAction = useCallback((action: GuideAction) => {
    setManualGuide(false);
    if (guideLearning.record(action, guideGesture.current)) refreshGuideLearning(n => n + 1);
  }, [guideLearning]);
  useEffect(() => {
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (finishTimer !== null) clearTimeout(finishTimer);
      finishTimer = null;
      pendingGuideActions.current.clear();
    };
    const begin = (event: Event) => {
      if (event instanceof KeyboardEvent && event.repeat) return;
      cancel();
      guideGesture.current += 1;
    };
    const finish = () => {
      // React's pointer-up handler can report a completed table gesture after
      // this capture listener. Count it only once the whole event has finished.
      finishTimer = setTimeout(() => {
        finishTimer = null;
        pendingGuideActions.current.forEach(recordGuideAction);
        pendingGuideActions.current.clear();
      }, 0);
    };
    window.addEventListener('pointerdown', begin, true);
    window.addEventListener('keydown', begin, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('keyup', finish, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('pointerdown', begin, true);
      window.removeEventListener('keydown', begin, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('keyup', finish, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
    };
  }, [recordGuideAction]);
  const [firstMatchGuideStep, setFirstMatchGuideStep] =
    useState<FirstMatchGuideStep | null>(() =>
      !controlLearning.hasCompletedMatch() && playerSkill.matchesEvaluated === 0 && shouldRunFirstMatchGuide(
        browserStorage(),
        playerSkill.totalPlayerShots,
      )
        ? 'first-power'
        : null);
  const firstMatchGuideStepRef = useRef(firstMatchGuideStep);
  firstMatchGuideStepRef.current = firstMatchGuideStep;
  const finishFirstMatchGuide = useCallback(() => {
    saveFirstMatchGuideCompleted(browserStorage());
    firstMatchGuideStepRef.current = null;
    setFirstMatchGuideStep(null);
  }, []);
  const advanceFirstMatchGuide = useCallback((event: FirstMatchGuideEvent) => {
    const action = actionForEvent(event);
    if (action) {
      if (action === 'power' || action === 'ghost' || action === 'place') recordGuideAction(action);
      else pendingGuideActions.current.add(action);
    }
    const current = firstMatchGuideStepRef.current;
    if (!current) return;
    const next = guideStepAfterEvent(current, event);
    if (!next) {
      finishFirstMatchGuide();
      return;
    }
    firstMatchGuideStepRef.current = next;
    setFirstMatchGuideStep(next);
  }, [finishFirstMatchGuide, recordGuideAction]);

  // 胜负都算完整一局；中途重开不算。历史已结算局数使老用户直接免提示。
  useEffect(() => {
    if (match.phase === 'finished') {
      controlLearning.completeMatch();
      if (firstMatchGuideStepRef.current) finishFirstMatchGuide();
    }
  }, [match.phase, playerSkill.matchesEvaluated, finishFirstMatchGuide]);
  useEffect(() => {
    if (firstMatchGuideStep) {
      try { browserStorage()?.setItem(GUIDE_PROGRESS_KEY, JSON.stringify({ step: firstMatchGuideStep })); } catch { /* Keep this session operable. */ }
    }
    if (firstMatchGuideStep === 'turn-wait' && match.actor === 'player') {
      if (match.phase === 'placing') setFirstMatchGuideStep('free-place');
      else if (match.phase === 'aiming') advanceFirstMatchGuide('player-ready');
    }
    if (firstMatchGuideStep === 'free-place' && match.phase === 'aiming') advanceFirstMatchGuide('cue-placed');
  }, [firstMatchGuideStep, match.actor, match.phase, advanceFirstMatchGuide]);

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

  // 打开前的视角，关闭时恢复
  const prevViewLevelRef = useRef(viewLevel);
  const handleOpenPlan = useCallback(() => {
    planConsultedRef.current = true;
    consultedPlanStepRef.current = positionPlan.plans[0]?.steps[0] ?? null;
    prevViewLevelRef.current = viewLevel;
    positionPlan.open();
  }, [viewLevel, positionPlan]);
  const handleClosePlan = useCallback(() => {
    positionPlan.close();
    setViewLevel(prevViewLevelRef.current);
    setGuidanceEnabled(false);
  }, [positionPlan, setViewLevel]);

  // 灯泡点亮后才启动 Worker；结果到达时自动展开，不要求用户重复点击。
  useEffect(() => {
    if (
      guidanceEnabled &&
      positionPlan.status === 'ready' &&
      !planOpen
    ) {
      handleOpenPlan();
    }
  }, [guidanceEnabled, positionPlan.status, planOpen, handleOpenPlan]);

  // ── 复盘开合：▶ 对比切俯视 + 场景叠加；✕/💡 收起回 chip ──
  const prevReviewViewLevelRef = useRef(viewLevel);
  const handleOpenReview = useCallback(() => {
    if (!shotReview?.planned) return;
    prevReviewViewLevelRef.current = viewLevel;
    setReviewOpen(true);
    setViewLevel(OVERHEAD_VIEW);
    scene3DRef.current?.showReviewOverlay(shotReview);
  }, [shotReview, viewLevel, setViewLevel]);
  const handleCloseReview = useCallback(() => {
    setReviewOpen(false);
    scene3DRef.current?.showReviewOverlay(null);
    setViewLevel(prevReviewViewLevelRef.current);
  }, [setViewLevel]);

  // 规划与复盘是灯泡中的两个独立开关，避免查看复盘时意外启动规划 Worker。
  const handleTogglePlan = useCallback(() => {
    if (guidanceEnabled) {
      if (planOpen) handleClosePlan();
      setGuidanceEnabled(false);
      return;
    }
    if (reviewOpen) handleCloseReview();
    setGuidanceEnabled(true);
    if (positionPlan.status === 'ready') handleOpenPlan();
  }, [
    guidanceEnabled,
    planOpen,
    positionPlan.status,
    reviewOpen,
    handleCloseReview,
    handleClosePlan,
    handleOpenPlan,
  ]);

  const handleToggleReview = useCallback(() => {
    if (reviewEnabled && reviewOpen) handleCloseReview();
    setReviewEnabled(current => !current);
  }, [handleCloseReview, reviewEnabled, reviewOpen]);

  // 复盘被清空（对手杆结算/新一杆出杆）时，同步收起可能还展开着的场景叠加
  useEffect(() => {
    if (!shotReview && reviewOpen) {
      setReviewOpen(false);
      scene3DRef.current?.showReviewOverlay(null);
    }
  }, [shotReview, reviewOpen]);

  // 打开规划视图自动切俯视（轨迹/走位区域在俯视下可读性最好）
  useEffect(() => {
    if (planOpen && viewLevel !== OVERHEAD_VIEW) setViewLevel(OVERHEAD_VIEW);
  }, [planOpen, viewLevel, setViewLevel]);

  const handleShowPlanStep = useCallback((plan: PositionPlan | null, stepIndex: number) => {
    scene3DRef.current?.showPlanStep(plan, stepIndex);
  }, []);

  // ── 音效 ──
  const { audioRef, playPhysicsEvents, playStrike, playVictory, resetEvents, muted, toggleMuted } = useAudioManager(
    gamePaused || !!renderError,
    !openingActive && match.phase !== 'intro' && (selectedWorld === 'castle' || selectedWorld === 'lake'),
  );

  // ── 瞄准交互状态（ref，在 handleCommit 与 useAimInteraction 之间共享）──
  const aimGhostDistRef = useRef<number | null>(null);
  // 瞄准值同步到 3D 场景用的 ref
  const aimRef = useRef(0);
  const resetSpinRef = useRef<() => void>(() => {});
  // 全台视角统一按球桌视口重排；击球目标近景完成前不被观战状态抢走。
  useEffect(() => {
    if (spectatorActive && shotCameraTarget === null) showFullTable();
    else if (!isOverheadCameraView(viewLevel) || manualCameraActive || manualCameraPinned) return;
    orientFullTable();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(orientFullTable) : null;
    if (containerRef.current) observer?.observe(containerRef.current);
    window.addEventListener('resize', orientFullTable);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', orientFullTable);
    };
  }, [spectatorActive, shotCameraTarget, viewLevel, manualCameraActive, manualCameraPinned, orientFullTable, showFullTable]);

  // 没有可靠目标/袋口的出杆（如开球）仍立即回全台；有跟随状态时等目标结果。
  useEffect(() => {
    if (match.phase === 'rolling' && shotCameraTarget === null) showFullTable();
  }, [match.phase, shotCameraTarget, showFullTable]);

  const handleGhostPlaced = useCallback(() => {
    advanceFirstMatchGuide('ghost-placed');
    const world = worldRef.current;
    const legal = legalNumbers(world, 'player', matchRef.current.playerGroup);
    setAimCameraFraming(cameraFramingForAim(world, aimRef.current, legal,
      containerRef.current ? aimCameraSafetyFor(containerRef.current) : DEFAULT_CAMERA_SAFETY));
    clearTouchAimCameraTimer();
    manualAimTransitionPointerRef.current = null;
    setTouchAimCameraLocked(false);
    setManualCameraActive(false);
    setManualCameraPinned(false);
    setCameraDetached(false);
    setCameraAzimuth(aimRef.current);
    setViewLevel(SHOT_AIM_VIEW);
  }, [advanceFirstMatchGuide, clearAimCameraFraming, clearTouchAimCameraTimer, matchRef, setViewLevel, worldRef]);

  // 首碰目标与袋口身份只在抬手时冻结；横竖旋转、窗口大小和比分栏尺寸会改变
  // 可用屏幕区域。全台和瞄准共用这个实时 safety；仅在存在构图帧时复制 safety，绝不重选目标或口袋。
  useEffect(() => {
    const viewport = containerRef.current;
    if (!viewport) return;
    const refreshSafety = () => {
      const nextSafety = aimCameraSafetyFor(viewport);
      setCameraSafety(current => sameCameraSafety(current, nextSafety) ? current : nextSafety);
      setAimCameraFraming(current => {
        if (!current || sameCameraSafety(current.safety, nextSafety)) return current;
        return { ...current, safety: nextSafety };
      });
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshSafety) : null;
    resizeObserver?.observe(viewport);
    const scoreboard = document.querySelector('.scoreboard');
    if (scoreboard) resizeObserver?.observe(scoreboard);
    window.addEventListener('resize', refreshSafety);
    refreshSafety();
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', refreshSafety);
    };
  }, []);

  // ── 出杆提交：输入层只给 ShotIntent，这里负责球杆动画与物理击球 ──
  const handleCommit = useCallback((intent: ShotIntent) => {
    if (followShotPendingRef.current) return;
    const lease = createShotLease(worldRef, matchRef, 'player');
    if (!lease.current()) return;
    setShotReward(null);
    setTouchAimCameraLocked(false);
    const angle = aimRef.current;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return;
    const effectiveSpin = followFeelSpin(intent.spin, followFeel);
    followShotPendingRef.current = true;
    setFollowShotPending(true);
    // 出杆后靶点回自动：下一杆幽灵球重新贴首触点
    aimGhostDistRef.current = null;
    // 新一杆出杆：上一杆复盘自动消失
    setShotReview(null);
    setReviewOpen(false);
    setGuidanceEnabled(false);
    scene3DRef.current?.showReviewOverlay(null);

    const doShot = () => lease.commit(() => {
      followShotPendingRef.current = false;
      setFollowShotPending(false);
      const currentMatch = matchRef.current;
      const legal = legalNumbers(worldRef.current, 'player', currentMatch.playerGroup);
      const declaredIntent = currentMatch.breaking
        ? null
        : findPrecisionAim(worldRef.current, angle, legal);
      skillShotCaptureRef.current = {
        target: declaredIntent?.target ?? null,
        pocket: declaredIntent?.pocket ?? null,
        tolerance: declaredIntent?.halfWidth ?? null,
        assisted: planConsultedRef.current,
      };
      planConsultedRef.current = false;
      // 击球前快照（复盘捕获点）：strikeCueBall 会改写 worldRef，必须先克隆
      shotCaptureRef.current = {
        worldBefore: cloneWorld(worldRef.current),
        angle,
        power: intent.power,
        spin: intent.spin,
        planned: consultedPlanStepRef.current,
        intent: declaredIntent
          ? {
              target: declaredIntent.target,
              pocket: declaredIntent.pocket,
              centerAngle: declaredIntent.centerAngle,
              halfWidth: declaredIntent.halfWidth,
            }
          : null,
        breaking: currentMatch.breaking,
      };
      consultedPlanStepRef.current = null;
      if (!strikeCueBall(worldRef.current, angle, intent.power, intent.spin)) {
        shotCaptureRef.current = null;
        skillShotCaptureRef.current = null;
        return;
      }
      advanceFirstMatchGuide('shot-committed');
      markControlLearned('shoot');
      const followedTarget = declaredIntent && aimCameraFraming &&
        declaredIntent.target === aimCameraFraming.targetNumber &&
        declaredIntent.pocket === aimCameraFraming.pocketIndex
          ? declaredIntent.target
          : null;
      if (followedTarget === null) {
        showFullTableAfterShot();
      } else {
        shotCameraFollowRef.current = createShotCameraFollow(followedTarget);
        setShotCameraTarget(followedTarget);
      }
      // 每杆只在物理确认击球成功后复位中杆，避免动画取消时误清用户设置。
      resetSpinRef.current();
      playStrike(intent.power);
      resetEvents();
      setWorldView(cloneWorld(worldRef.current));
      setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
    });

    const scene = scene3DRef.current;
    if (scene) {
      scene.triggerStrike({ cueX: cueBall.x, cueZ: cueBall.z, angle, power: intent.power, spin: effectiveSpin, onContact: doShot });
    } else {
      doShot();
    }
  }, [followFeel, advanceFirstMatchGuide, aimCameraFraming, worldRef, matchRef, aimGhostDistRef, scene3DRef, playStrike, resetEvents, setWorldView, setMatch, showFullTableAfterShot]);

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
  const cameraViewAzimuth =
    touchAimCameraLocked || manualCameraActive || manualCameraPinned
      ? cameraAzimuth
      : cameraAzimuthAtView(
          cameraAzimuth,
          aim,
          viewLevel,
          cameraDetached,
        );
  const cameraViewAzimuthRef = useRef(cameraViewAzimuth);
  cameraViewAzimuthRef.current = cameraViewAzimuth;

  const lockTouchAimCamera = useCallback(() => {
    if (isGlobalCameraView(viewLevel)) return;
    clearTouchAimCameraTimer();
    setCameraAzimuth(cameraViewAzimuthRef.current);
    setTouchAimCameraLocked(true);
  }, [clearTouchAimCameraTimer, viewLevel]);

  const releaseTouchAimCameraLater = useCallback(() => {
    clearTouchAimCameraTimer();
    touchAimCameraTimerRef.current = window.setTimeout(() => {
      touchAimCameraTimerRef.current = null;
      setTouchAimCameraLocked(false);
    }, TOUCH_AIM_CAMERA_RELEASE_MS);
  }, [clearTouchAimCameraTimer]);

  const handleToggleManualCamera = useCallback(() => {
    clearTouchAimCameraTimer();
    clearAimCameraFraming();
    manualAimTransitionPointerRef.current = null;
    setTouchAimCameraLocked(false);
    if (manualCameraActive) {
      setManualCameraActive(false);
      setManualCameraPinned(true);
      return;
    }
    setCameraAzimuth(cameraViewAzimuthRef.current);
    setCameraDetached(true);
    setManualCameraPinned(false);
    setManualCameraActive(true);
  }, [clearAimCameraFraming, clearTouchAimCameraTimer, manualCameraActive]);

  useEffect(
    () => () => {
      clearTouchAimCameraTimer();
      if (shotCameraReturnTimerRef.current !== null) {
        window.clearTimeout(shotCameraReturnTimerRef.current);
        shotCameraReturnTimerRef.current = null;
      }
    },
    [clearTouchAimCameraTimer],
  );

  // 回合交给谢不赢时立即退出短暂的触屏锁镜，观战相机不等待计时器。
  useEffect(() => {
    if (!spectatorActive) return;
    clearTouchAimCameraTimer();
    setTouchAimCameraLocked(false);
  }, [clearTouchAimCameraTimer, spectatorActive]);

  // 谢不赢交棒后，只要玩家选择非俯视视角就立即恢复“镜头跟杆向”。
  useEffect(() => {
    if (!spectatorActive && cameraDetached && !isOverheadCameraView(viewLevel)) {
      setCameraDetached(false);
    }
  }, [cameraDetached, spectatorActive, viewLevel]);

  // ── 瞄准交互（在 useShotInput 之后，以获取 setAim）──
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    cancelForPinch,
    handleAimButtonAdjust,
    handleAimDialAdjust,
    toggleAimDialPrecision,
    aimDialVisible,
    aimDialPrecisionActive,
  } = useAimInteraction({
    scene3DRef,
    worldRef,
    viewLevel,
    setAim,
    aimRef,
    cameraAzimuthRef: cameraViewAzimuthRef,
    aimGhostDistRef,
    canAim,
    aimDialEnabled,
    matchPhase: match.phase,
    breaking: match.breaking,
    setMatch,
    setMessage,
    setWorldView,
    onGhostPlaced: handleGhostPlaced,
    onCuePlaced: () => advanceFirstMatchGuide('cue-placed'),
    onCoarseAimAdjusted: () => {
      advanceFirstMatchGuide('coarse-aim-adjusted');
    },
  });

  const stageInteractionMode = cameraInteractionMode(
    spectatorActive,
    manualCameraActive,
  );
  const orbitPointerRef = useRef<{ id: number; lastX: number } | null>(null);
  const handleStagePointerDown = useCallback((event: ReactPointerEvent) => {
    if (stageInteractionMode === 'locked') return;
    if (stageInteractionMode === 'orbit') {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      orbitPointerRef.current = { id: event.pointerId, lastX: event.clientX };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (manualCameraPinned && canAim) {
      clearTouchAimCameraTimer();
      setCameraAzimuth(cameraViewAzimuthRef.current);
      setManualCameraPinned(false);
      if (!isGlobalCameraView(viewLevel)) {
        setTouchAimCameraLocked(true);
        manualAimTransitionPointerRef.current = event.pointerId;
      }
    }
    if (event.pointerType === 'touch' && canAim) lockTouchAimCamera();
    handlePointerDown(event);
  }, [
    canAim,
    clearTouchAimCameraTimer,
    handlePointerDown,
    lockTouchAimCamera,
    manualCameraPinned,
    stageInteractionMode,
    viewLevel,
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
    if (stageInteractionMode === 'locked') return;
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
    const manualTransition =
      manualAimTransitionPointerRef.current === event.pointerId;
    if (manualTransition) manualAimTransitionPointerRef.current = null;
    if (event.pointerType === 'touch' || manualTransition) {
      releaseTouchAimCameraLater();
    }
  }, [releaseTouchAimCameraLater, stageInteractionMode]);

  const handleStableAimDialAdjust = useCallback((
    pixelDelta: number,
    pressureGain = 1,
  ) => {
    const coarsePointer = typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches;
    const resumePinnedCamera = manualCameraPinned && canAim;
    if (resumePinnedCamera) {
      clearTouchAimCameraTimer();
      setCameraAzimuth(cameraViewAzimuthRef.current);
      setManualCameraPinned(false);
      if (!isGlobalCameraView(viewLevel)) setTouchAimCameraLocked(true);
    }
    if ((coarsePointer || resumePinnedCamera) && canAim) {
      if (!isGlobalCameraView(viewLevel)) lockTouchAimCamera();
      const adjustedMode = handleAimDialAdjust(pixelDelta, pressureGain);
      if (adjustedMode !== null) advanceFirstMatchGuide(adjustedMode === 'fine' ? 'fine-aim-adjusted' : 'coarse-aim-adjusted');
      releaseTouchAimCameraLater();
      return adjustedMode !== null;
    }
    const adjustedMode = handleAimDialAdjust(pixelDelta, pressureGain);
    if (adjustedMode !== null) advanceFirstMatchGuide(adjustedMode === 'fine' ? 'fine-aim-adjusted' : 'coarse-aim-adjusted');
    return adjustedMode !== null;
  }, [
    advanceFirstMatchGuide,
    canAim,
    clearTouchAimCameraTimer,
    handleAimDialAdjust,
    lockTouchAimCamera,
    manualCameraPinned,
    releaseTouchAimCameraLater,
    viewLevel,
  ]);

  const handleStableAimButtonAdjust = useCallback((angleDelta: number) => {
    const coarsePointer = typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches;
    const resumePinnedCamera = manualCameraPinned && canAim;
    if (resumePinnedCamera) {
      clearTouchAimCameraTimer();
      setCameraAzimuth(cameraViewAzimuthRef.current);
      setManualCameraPinned(false);
      if (!isGlobalCameraView(viewLevel)) setTouchAimCameraLocked(true);
    }
    if ((coarsePointer || resumePinnedCamera) && canAim &&
      !isGlobalCameraView(viewLevel)) {
      lockTouchAimCamera();
    }
    const adjusted = handleAimButtonAdjust(angleDelta);
    if (adjusted) {
      advanceFirstMatchGuide('fine-aim-adjusted');
    }
    if ((coarsePointer || resumePinnedCamera) && canAim) {
      releaseTouchAimCameraLater();
    }
    return adjusted;
  }, [
    advanceFirstMatchGuide,
    canAim,
    clearTouchAimCameraTimer,
    handleAimButtonAdjust,
    lockTouchAimCamera,
    manualCameraPinned,
    releaseTouchAimCameraLater,
    viewLevel,
  ]);

  // Update normal first-person aiming too, including button entry and dial adjustments.
  // Manual orbit and active touch gestures retain their deliberate camera lock.
  useEffect(() => {
    if (!canAimBase || isOverheadCameraView(viewLevel) || manualCameraActive || manualCameraPinned || touchAimCameraLocked || openingActive) return;
    const next = cameraFramingForAim(worldRef.current, aim, legalTargets, cameraSafety);
    setAimCameraFraming(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, [aim, canAimBase, worldView, viewLevel, manualCameraActive, manualCameraPinned, touchAimCameraLocked, openingActive, legalTargets, cameraSafety, worldRef]);

  const handleGuideViewLevel = useCallback((level: number) => {
    const adjusted = Math.abs(level - viewLevel) > 0.0005;
    if (isOverheadCameraView(level) && !manualCameraActive) showFullTable();
    else {
      setAimCameraFraming(manualCameraActive ? null : cameraFramingForAim(worldRef.current, aimRef.current,
        legalNumbers(worldRef.current, 'player', matchRef.current.playerGroup), cameraSafety));
      setViewLevel(level);
    }
    if (canAim && adjusted) advanceFirstMatchGuide('view-adjusted');
  }, [advanceFirstMatchGuide, canAim, cameraSafety, setViewLevel, viewLevel, manualCameraActive, showFullTable, worldRef, matchRef]);

  const stageGesture = useStageGesture({
    enabled: !gamePaused && !renderError && !openingActive && !scenePickerOpen && !followShotPending && !spectatorActive && match.phase !== 'finished' && !charging && !worldRef.current.moving,
    mode: stageInteractionMode, level: viewLevel,
    hitTable: (x,y) => scene3DRef.current?.hitVisibleTable(x,y) ?? true,
    onHeight: handleGuideViewLevel,
    pinchStart: event => {
      cancelForPinch(event);
      clearTouchAimCameraTimer();clearAimCameraFraming();
      setTouchAimCameraLocked(false);
      orbitPointerRef.current=null;manualAimTransitionPointerRef.current=null;
    },
    down: handleStagePointerDown, move: handleStagePointerMove,
    up: event => finishStagePointer(event,handlePointerUp),
    cancel: event => { handlePointerCancel(event); orbitPointerRef.current=null; manualAimTransitionPointerRef.current=null; releaseTouchAimCameraLater(); },
  });

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
    scene3DRef.current?.cancelStrike();
    cancelCharge();
    shotCaptureRef.current = null;
    setShotReview(null); setReviewOpen(false);
    resetEvents();
    followShotPendingRef.current = false;
    setFollowShotPending(false);
    setCollectionOpen(false);
    setShotReward(null);
    resetGame(setAim, nextMode);
    markControlLearned(nextMode === 'practice' ? 'start-practice' : 'start-challenge');
    setSpin({ x: 0, y: 0 });
    setGuidanceEnabled(false);
    showFullTable();
    planConsultedRef.current = false;
    consultedPlanStepRef.current = null;
    skillShotCaptureRef.current = null;
    aimGhostDistRef.current = null;
    if (firstMatchGuideStepRef.current) { firstMatchGuideStepRef.current = 'first-power'; setFirstMatchGuideStep('first-power'); }
  }, [showFullTable, resetGame, setAim, setSpin, aimGhostDistRef, cancelCharge, resetEvents]);
  const handleReplay = useCallback(() => {
    handleResetGame(gameMode);
  }, [gameMode, handleResetGame]);

  // ── 物理停止结算 ──
  const settleShot = useCallback(() => {
    const settlement = settleShotRaw(setViewLevel);
    setShotReward(settlement ? rewardForStoppedShot(settlement.facts, settlement.resolution) : null);
    if (settlement && firstMatchGuideStepRef.current) {
      const next = guideAfterSettlement(firstMatchGuideStepRef.current, settlement.resolution.next, settlement.facts.pocketed);
      if (next === null) finishFirstMatchGuide();
      else { firstMatchGuideStepRef.current = next; setFirstMatchGuideStep(next); }
    }
    // 复盘生成：有捕获（玩家杆）→ 判定；无捕获（对手杆）→ 清掉旧复盘
    const capture = shotCaptureRef.current;
    shotCaptureRef.current = null;
    const review = capture && settlement
      ? buildShotReview(capture, {
          pocketed: settlement.facts.pocketed,
          firstContact: settlement.facts.firstContact,
          foulReason: settlement.resolution.next.messageParams.reason ?? null,
        })
      : null;
    setShotReview(review);
    // 复盘只生成数据；是否显示由灯泡中的独立开关决定。
    setGuidanceEnabled(false);

    const skillCapture = skillShotCaptureRef.current;
    skillShotCaptureRef.current = null;
    if (settlement && skillCapture && capture) {
      const { facts, resolution } = settlement;
      const messageKey = resolution.next.messageKey;
      const foul = messageKey === 'foul' || messageKey === 'lose-8-foul';
      const pocketed =
        skillCapture.target !== null && facts.pocketed.includes(skillCapture.target);
      const plannedCandidate = review?.planned?.candidate;
      const samePlan =
        skillCapture.target !== null &&
        skillCapture.pocket !== null &&
        plannedCandidate?.target === skillCapture.target &&
        plannedCandidate.pocket === skillCapture.pocket;
      let position: PositionOutcome = 'unknown';
      if (pocketed && !foul && resolution.next.phase !== 'finished') {
        position = samePlan
          ? (review?.verdict === 'perfect' ? 'success' : 'miss')
          : positionAfterPot(worldRef.current, legalNumbers(worldRef.current, 'player', resolution.next.playerGroup));
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
      completeMatchAssessment(settlement.resolution.next.winner);
      if (settlement.resolution.next.winner === 'player') playVictory();
    }
  }, [completeMatchAssessment, finishFirstMatchGuide, playVictory, recordPlayerShot, settleShotRaw, setViewLevel]);

  // ── 物理模拟循环 ──
  usePhysicsLoop({
    active: match.phase === 'rolling' && !renderError && !gamePaused,
    worldRef,
    onFrame: useCallback(() => {
      playPhysicsEvents(worldRef.current.events);
      scene3DRef.current?.sync(worldRef.current);
      const follow = shotCameraFollowRef.current;
      if (!follow) return;
      const observation = observeShotCameraFollow(follow, worldRef.current);
      shotCameraFollowRef.current = observation.state;
      if (observation.outcome === 'pocketed') {
        finishShotCameraFollow(POCKETED_SHOT_CAMERA_HOLD_MS);
      } else if (observation.outcome === 'stopped') {
        finishShotCameraFollow(STOPPED_SHOT_CAMERA_HOLD_MS);
      }
    }, [finishShotCameraFollow, worldRef, playPhysicsEvents]),
    onSettled: settleShot,
    presentationIntervalMs: physicsPresentationIntervalMs,
  });

  // ── 对手 AI 回合 ──
  useOpponentAI({
    active: match.phase === 'opponent' && !renderError && !gamePaused,
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

  // ── 初始化 3D 场景：介绍页不创建 WebGL/纹理，开始对局后再一次性装配 ──
  const sceneEnabled = match.phase !== 'intro';
  useEffect(() => {
    if (!sceneEnabled) return;
    const el = containerRef.current;
    if (!el) return;

    let scene: Scene3D;
    try {
      scene = new Scene3D(el, {
        worldId: selectedWorld,
        skipOpening: openingCompletedRef.current,
        openingFilm: selectedWorld === 'castle',
        onOpeningChange: active => { if (!active) openingCompletedRef.current = true; setOpeningActive(active); },
        onRenderUnavailable: setRenderError,
        onThermalQualityChange: quality => handleThermalQualityChange(quality.movingPresentationFps),
      });
    } catch (error) {
      setRenderError('当前设备暂不支持此球桌画面。请更新客户端后重新进入；已有存档保留。');
      return;
    }
    scene3DRef.current = scene;
    setOpeningActive(!openingCompletedRef.current);
    scene.start();

    // 开发服务器或显式隔离验收构建暴露调试句柄；正式构建不携带该入口。
    if (import.meta.env.DEV || import.meta.env.VITE_BJ8_ACCEPTANCE === '1') {
      (window as unknown as { __bj8: unknown }).__bj8 = {
        world: worldRef,
        scene: scene3DRef,
        aim: aimRef,
        match: matchRef,
        cameraAzimuth: cameraAzimuthRef,
        cameraViewAzimuth: cameraViewAzimuthRef,
        // 专项门禁读取纯几何解，验证真实指针落点是否跨过精瞄边界。
        precisionAt: (angle: number, multiplier?: number) => findPrecisionAim(
          worldRef.current,
          angle,
          legalNumbers(worldRef.current, 'player', matchRef.current.playerGroup),
          multiplier,
        ),
        // 摆球调试后手动同步快照到 React 世界视图（正常对局中由物理循环/结算自动同步）
        sync: () => setWorldView(cloneWorld(worldRef.current)),
        // 浏览器专项门禁用于固定 actor/phase；只在 DEV 暴露，真实瞄准与出杆仍走指针事件
        setMatch: (patch: Partial<typeof match>) => setMatch(current => ({ ...current, ...patch })),
      };
    }

    return () => {
      scene.dispose();
      scene3DRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneEnabled, selectedWorld]);

  useEffect(() => { scene3DRef.current?.setPaused(gamePaused || !!renderError); }, [gamePaused, renderError, selectedWorld]);

  // ── 同步世界状态到 3D 场景 ──
  useEffect(() => {
    const scene = scene3DRef.current;
    if (!scene) return;

    aimRef.current = aim;
    scene.setViewLevel(viewLevel);
    scene.setCameraSafety(cameraSafety);
    scene.setCameraFraming(aimCameraFraming);
    scene.setShotCameraTarget(shotCameraTarget);
    scene.setAim(aim);
    scene.setCameraAzimuth(cameraViewAzimuth);
    scene.setAimAssistVisible(aimAssist.enabled);
    scene.setSpin(spin);
    scene.setAimGhostDist(aimGhostDistRef.current);
    // 合法目标高亮：只在玩家回合显示
    scene.setLegalTargets(legalTargets);
    scene.sync(worldView);

    const cue = getCueBall(worldView);
    scene.update(cue?.x ?? 0, cue?.z ?? 0, previewPower, match.phase);
  }, [
    worldView,
    selectedWorld,
    viewLevel,
    cameraSafety,
    aimCameraFraming,
    shotCameraTarget,
    aim,
    cameraViewAzimuth,
    aimAssist.enabled,
    previewPower,
    match,
    spin,
    aimGhostDistRef,
    legalTargets,
  ]);

  // Each gesture retires independently after two valid uses, including free-ball placement.
  let displayGuide: FirstMatchGuideStep | null = null;
  if (!guideDismissed && match.actor === 'player') {
    if (match.phase === 'placing' && (manualGuide || !guideLearning.learned('place'))) displayGuide = 'free-place';
    else if (match.phase === 'aiming') {
      const preferred = firstMatchGuideStep && actionForStep(firstMatchGuideStep);
      if (firstMatchGuideStep && preferred && (manualGuide || !guideLearning.learned(preferred))) displayGuide = firstMatchGuideStep;
      else if (match.breaking && !guideLearning.learned('power')) displayGuide = 'first-power';
      else if (!match.breaking) displayGuide = !guideLearning.learned('ghost') ? 'ghost-place' : !guideLearning.learned('aim') ? 'aim-direction' : !guideLearning.learned('power') ? 'next-power' : null;
    }
  }
  const getGuideTablePoint = useCallback(() => {
    const scene = scene3DRef.current;
    if (!scene) return null;
    if (matchRef.current.phase !== 'placing') return scene.guideTargetScreen(false);
    // Illustrate a genuinely empty legal spot; the user still chooses and places the ball.
    for (const z of [.45, 0, -.45, .8, -.8]) for (const x of [0, -.3, .3]) {
      if (matchRef.current.breaking && z < TABLE.length * .25) continue;
      if (worldRef.current.balls.every(ball => !ball.active || ball.number === 0 || Math.hypot(ball.x-x, ball.z-z) > TABLE.ballRadius * 2.5)) return scene.tableToScreen(x,z);
    }
    return scene.guideTargetScreen(true);
  }, [matchRef, worldRef]);

  // ── 渲染 ──
  return (
    <div className={`game-shell royal-game${import.meta.env.DEV ? ' follow-ab' : ''}`} data-paused={gamePaused ? 'true' : undefined} data-guide={displayGuide ?? undefined} data-world={selectedWorld} data-match-finished={match.phase === 'finished' ? 'true' : undefined} data-opening={openingActive && !renderError ? 'true' : undefined}>
      {renderError && <div role="alert" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9998, background: '#10251b', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p>{renderError}</p><button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: 12 }}>重新进入</button>
      </div>}
      {openingActive && !renderError && (selectedWorld === 'castle'
        ? <OpeningFilm src={openingMovie} muted={muted} onFinish={() => scene3DRef.current?.finishOpening()}/>
        : <div className="royal-opening"><button className="opening-skip" aria-label="跳过开场" onClick={() => scene3DRef.current?.finishOpening()}><RoyalIcon name="skip"/></button></div>)}
      {paused && !collectionOpen && !renderError && <PauseMenu onCollection={() => setCollectionOpen(true)} gameMode={gameMode} onModeChange={worldView.shot === 0 ? handleResetGame : undefined} muted={muted} onMute={toggleMuted} onResume={() => setPaused(false)} onRestart={() => { handleReplay(); setPaused(false); }} />}
      {helpOpen && <ControlHelp onClose={() => setHelpOpen(false)}/>}
      {collectionOpen && <CompanionCollectionBook collection={collection} initialCompanionId={collectionReward?.companionId} saveFailed={collectionSaveFailed} onClose={() => setCollectionOpen(false)} />}
      <div className="royal-entry" role="group" aria-label="场景、教学与暂停">
        <button className="scene-entry" aria-label="场景" disabled={gamePaused || charging || followShotPending || openingActive || (!canAim && match.phase !== 'finished')} onClick={() => setScenePickerOpen(v => !v)}><RoyalIcon name="scene"/></button>
        <button className="help-entry" aria-label="操作说明" disabled={openingActive || !!renderError} onClick={() => { cancelCharge(); setScenePickerOpen(false); setHelpOpen(true); }}><RoyalIcon name="help"/></button>
        {match.phase !== 'finished' && <button className="cardbook-entry" aria-label="查看赞美卡册" disabled={openingActive || !!renderError} onClick={() => { cancelCharge(); setScenePickerOpen(false); setCollectionOpen(true); }}><RoyalIcon name="cards"/></button>}
        <button className="pause-entry" aria-label="暂停与设置" disabled={openingActive || !!renderError} onClick={() => { cancelCharge(); setScenePickerOpen(false); setPaused(true); }}><RoyalIcon name="pause"/></button>
      </div>
      {scenePickerOpen && <ScenePicker value={selectedWorld} disabled={(!canAimBase && match.phase !== 'finished') || openingActive || charging || followShotPending || worldView.moving} onClose={() => setScenePickerOpen(false)} onChange={next => { if ((!canAimBase && match.phase !== 'finished') || openingActive || charging || worldRef.current.moving || followShotPendingRef.current) return; try { browserStorage()?.setItem('princess-billiards:scene:v1', next); } catch { /* Current scene still switches. */ } const url = new URL(location.href); url.searchParams.set('world', next); url.searchParams.delete('lake360'); history.replaceState(null, '', url.href); setSelectedWorld(next); setScenePickerOpen(false); }} />}
      {import.meta.env.DEV && <div className="follow-comparison" aria-label="开发手感对照">
        <label>场景 <select aria-label="场景" value={selectedWorld} disabled={!canAim || charging || followShotPending} onChange={event => {
          const next = event.target.value as 'lake' | 'castle';
          const url = new URL(location.href); url.searchParams.set('world', next); url.searchParams.delete('lake360');
          history.replaceState(null, '', url.href); setSelectedWorld(next);
        }}><option value="lake">安静湖面</option><option value="castle">日光城堡</option></select></label>
        <label>手感对照 <select aria-label="跟进手感" aria-describedby="follow-feel-description" title="双方中杆附近略抬击点；短距离停球也可能多跟一点。刷新回到当前。" value={followFeel}
          disabled={!canAim || charging || followShotPending}
          onChange={event => {
            if (!canAim || charging || followShotPendingRef.current || worldRef.current.moving) return;
            const next = event.target.value as FollowFeel;
            if (next !== 'current' && next !== 'light-follow') return;
            worldRef.current.followFeel = next;
            setFollowFeel(next);
            setWorldView(cloneWorld(worldRef.current));
            setGuidanceEnabled(false);
            consultedPlanStepRef.current = null;
          }}>
          <option value="current">当前</option><option value="light-follow">轻跟进</option>
        </select></label>
        <span id="follow-feel-description">轻跟进：双方中杆略抬击点，停球也会稍跟；刷新回当前</span>
      </div>}
      <Scoreboard
        match={match}
        worldView={worldView}
        playerSkill={playerSkill}
        opponentProfile={opponentProfile}
        gameMode={gameMode}
        onModeChange={handleResetGame}
        shotReward={shotReward}
      />
      <TableStage
        victoryPraise={victoryPraise}
        shotReward={shotReward}
        collectionReward={collectionReward}
        collectionSaveFailed={collectionSaveFailed}
        onCollection={() => setCollectionOpen(true)}
        eightReady={legalTargets.length === 1 && legalTargets[0] === 8}
        viewLevel={viewLevel}
        spectatorActive={spectatorActive}
        manualCameraActive={manualCameraActive}
        firstMatchGuideActive={Boolean(displayGuide)}
        match={match}
        trainingSummary={trainingSummary}
        gameMode={gameMode}
        containerRef={containerRef}
        onPointerDown={stageGesture.down}
        onPointerMove={stageGesture.move}
        onPointerUp={(event) => stageGesture.finish(event)}
        onPointerCancel={(event) => stageGesture.finish(event,true)}
        onResetGame={handleReplay}
      />
      <ControlDeck
        viewLevel={viewLevel}
        manualCameraActive={manualCameraActive}
        viewLocked={spectatorActive}
        canAim={canAim}
        spin={spin}
        charging={charging}
        previewPower={previewPower}
        breaking={match.breaking}
        planStatus={positionPlan.status}
        guidanceEnabled={guidanceEnabled}
        reviewEnabled={reviewEnabled}
        hasReview={Boolean(shotReview)}
        aimAssistEnabled={aimAssist.enabled}
        aimDialEnabled={aimDialEnabled}
        aimDialVisible={aimDialVisible}
        aimDialPrecisionActive={aimDialPrecisionActive}
        onViewLevel={handleGuideViewLevel}
        onToggleManualCamera={handleToggleManualCamera}
        onSpinChange={handleGuideSpinChange}
        onLayoutAdjusted={handleGuideLayoutAdjusted}
        onToggleGuidance={handleTogglePlan}
        onToggleReview={handleToggleReview}
        onToggleAimAssist={aimAssist.toggle}
        onToggleAimDial={() => setAimDialEnabled(current => !current)}
        onAimButtonAdjust={handleStableAimButtonAdjust}
        onAimDialAdjust={handleStableAimDialAdjust}
        onToggleAimDialPrecision={toggleAimDialPrecision}
        onBeginCharge={beginCharge}
        onUpdateCharge={updateCharge}
        onReleaseCharge={releaseCharge}
        onCancelCharge={cancelCharge}
        onTapShot={() => commitShot({ power: MIN_POWER, spin })}
      />
      {match.phase !== 'finished' && guidanceEnabled && !planOpen && (
        positionPlan.status === 'computing' || positionPlan.status === 'failed'
      ) && (
        <PlanStatusNotice
          status={positionPlan.status}
          onClose={handleTogglePlan}
        />
      )}
      {match.phase !== 'finished' && guidanceEnabled && planOpen && (
        <PlanOverlay
          plans={positionPlan.plans}
          onClose={handleClosePlan}
          onShowStep={handleShowPlanStep}
        />
      )}
      {/* 复盘讲上一杆、规划讲下一杆可共存；planOpen 时提示条位置让位给引导，chip 隐藏 */}
      {reviewEnabled && shotReview && !guidanceEnabled && match.phase !== 'finished' && (
        <ReviewOverlay
          review={shotReview}
          open={reviewOpen}
          onOpen={handleOpenReview}
          onClose={handleCloseReview}
        />
      )}
      {displayGuide && match.phase !== 'finished' && (
        <FirstMatchGuide
          step={displayGuide}
          getTablePoint={getGuideTablePoint}
          visible={
            !gamePaused && !renderError && !openingActive && !charging &&
            !scenePickerOpen &&
            !planOpen &&
            !guidanceEnabled &&
            !reviewOpen &&
            (
              firstMatchGuideStep === 'turn-wait' ||
              match.phase === 'placing' ||
              (match.phase === 'aiming' && match.actor === 'player')
            )
          }
          onSkip={() => { setGuideDismissed(true); setManualGuide(false); finishFirstMatchGuide(); }}
        />
      )}

    </div>
  );
}
