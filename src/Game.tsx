/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机、Scene3D 快照适配器、audio 合成音效与 React 状态
[OUTPUT]: 对外提供完整对局编排：陪练/挑战、动态能力记录、局间锁定 AI、独立观战/全局环绕、触屏瞄准锁镜、360° 瞄准/无限拨轮与走位复盘 HUD
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
import { useGameState } from './hooks/useGameState';
import { useAimInteraction } from './hooks/useAimInteraction';
import { useOpponentAI } from './hooks/useOpponentAI';
import { useAudioManager } from './hooks/useAudioManager';
import { usePositionPlan } from './hooks/usePositionPlan';
import { Scoreboard } from './components/Scoreboard';
import { TableStage } from './components/TableStage';
import { ControlDeck } from './components/ControlDeck';
import { PlanOverlay } from './components/PlanOverlay';
import { ReviewOverlay } from './components/ReviewOverlay';
import { IntroScreen } from './components/IntroScreen';
import { Scene3D } from './Scene3D';
import type { PositionPlan } from './planner/search';
import { buildShotReview, type ShotCapture, type ShotReview } from './planner/review';
import { findPrecisionAim } from './aim/aim-solution';
import {
  FULL_TABLE_AZIMUTH,
  OVERHEAD_VIEW,
  SPECTATOR_VIEW_LEVEL,
  cameraAzimuthAfterDrag,
  cameraAzimuthAtView,
  isGlobalCameraView,
} from './camera-view';
import type { GameMode, PositionOutcome } from './opponent/model';

type SkillShotCapture = {
  target: number;
  pocket: number;
  tolerance: number;
  assisted: boolean;
};

const TOUCH_AIM_CAMERA_RELEASE_MS = 650;

export default function Game() {
  // ── 对局编排状态 ──
  const {
    worldRef, worldView, setWorldView,
    match, matchRef, setMatch,
    viewLevel, setViewLevel,
    playerSkill, gameMode, opponentProfile,
    recordPlayerShot,
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
  const [cameraAzimuth, setCameraAzimuth] = useState(FULL_TABLE_AZIMUTH);
  const [cameraDetached, setCameraDetached] = useState(false);
  const [touchAimCameraLocked, setTouchAimCameraLocked] = useState(false);
  const touchAimCameraTimerRef = useRef<number | null>(null);
  const cameraAzimuthRef = useRef(cameraAzimuth);
  cameraAzimuthRef.current = cameraAzimuth;
  const spectatorActive =
    match.actor === 'opponent' && (match.phase === 'opponent' || match.phase === 'rolling');

  // 禁用移动端长按唤出复制/全选/分享菜单，避免干扰击球与蓄力
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventDefault);
    return () => document.removeEventListener('contextmenu', preventDefault);
  }, []);

  // ── 走位规划（后台预算 + 覆盖层状态机）──
  const positionPlan = usePositionPlan({ worldView, match });
  const planOpen = positionPlan.status === 'showing';
  // 规划视图打开期间禁用瞄准输入（最小侵入：只压低 canAim，不动交互层内部）
  const canAim = canAimBase && !planOpen;
  // positionPlan 对象每渲染换新身份；出杆捕获只需读 plans，用 ref 镜像避免 handleCommit 重建
  const positionPlanRef = useRef(positionPlan);
  positionPlanRef.current = positionPlan;
  const guidanceAllowed = gameMode === 'practice';
  const planConsultedRef = useRef(false);

  // ── 击球复盘（上一杆「计划 vs 实际」）──
  // 出杆瞬间在 handleCommit 的 doShot 里捕获快照；对手杆走 useOpponentAI 不经此路，天然只记玩家杆
  const shotCaptureRef = useRef<ShotCapture | null>(null);
  const skillShotCaptureRef = useRef<SkillShotCapture | null>(null);
  const [shotReview, setShotReview] = useState<ShotReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // 💡 是用户主动控制的总开关；默认熄灭，规划与复盘都只缓存、不主动弹出。
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);

  // 打开前的视角，关闭时恢复
  const prevViewLevelRef = useRef(viewLevel);
  const handleOpenPlan = useCallback(() => {
    if (!guidanceAllowed) return;
    planConsultedRef.current = true;
    prevViewLevelRef.current = viewLevel;
    positionPlan.open();
  }, [guidanceAllowed, viewLevel, positionPlan]);
  const handleClosePlan = useCallback(() => {
    positionPlan.close();
    setViewLevel(prevViewLevelRef.current);
    setGuidanceEnabled(false);
  }, [positionPlan, setViewLevel]);

  // ── 复盘开合：▶ 对比切俯视 + 场景叠加；✕/💡 收起回 chip ──
  const prevReviewViewLevelRef = useRef(viewLevel);
  const handleOpenReview = useCallback(() => {
    if (!shotReview) return;
    setGuidanceEnabled(true);
    prevReviewViewLevelRef.current = viewLevel;
    setReviewOpen(true);
    setViewLevel(OVERHEAD_VIEW);
    scene3DRef.current?.showReviewOverlay(shotReview);
  }, [shotReview, viewLevel, setViewLevel]);
  const handleCloseReview = useCallback(() => {
    setReviewOpen(false);
    scene3DRef.current?.showReviewOverlay(null);
    setViewLevel(prevReviewViewLevelRef.current);
    setGuidanceEnabled(false);
  }, [setViewLevel]);

  // 💡 是规划与复盘的总开关：默认熄灭；复盘优先，规划仅在用户主动点亮时打开。
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
  const { audioRef, playPhysicsEvents, playStrike, resetEvents } = useAudioManager();

  // ── 瞄准交互状态（ref，在 handleCommit 与 useAimInteraction 之间共享）──
  const aimGhostDistRef = useRef<number | null>(null);
  // 瞄准值同步到 3D 场景用的 ref
  const aimRef = useRef(0);
  const resetSpinRef = useRef<() => void>(() => {});
  const spectatorWasActiveRef = useRef(false);

  // 对手接管后切到竖屏友好的全台观战位；交棒后保留该高度与朝向。
  useEffect(() => {
    const wasActive = spectatorWasActiveRef.current;
    if (spectatorActive && !wasActive) {
      const element = containerRef.current;
      const portrait = Boolean(element && element.clientWidth < element.clientHeight);
      setCameraAzimuth(portrait ? FULL_TABLE_AZIMUTH : aimRef.current);
      setCameraDetached(true);
      setViewLevel(Math.max(viewLevel, SPECTATOR_VIEW_LEVEL));
    }
    spectatorWasActiveRef.current = spectatorActive;
  }, [spectatorActive, setViewLevel, viewLevel]);

  // ── 出杆提交：输入层只给 ShotIntent，这里负责球杆动画与物理击球 ──
  const handleCommit = useCallback((intent: ShotIntent) => {
    setTouchAimCameraLocked(false);
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
      const currentMatch = matchRef.current;
      const legal = legalNumbers(worldRef.current, 'player', currentMatch.playerGroup);
      const declaredIntent = currentMatch.breaking
        ? null
        : findPrecisionAim(worldRef.current, angle, legal);
      skillShotCaptureRef.current = declaredIntent
        ? {
            target: declaredIntent.target,
            pocket: declaredIntent.pocket,
            tolerance: declaredIntent.halfWidth,
            assisted: planConsultedRef.current,
          }
        : null;
      planConsultedRef.current = false;
      // 击球前快照（复盘捕获点）：strikeCueBall 会改写 worldRef，必须先克隆
      shotCaptureRef.current = {
        worldBefore: cloneWorld(worldRef.current),
        angle,
        power: intent.power,
        spin: intent.spin,
        planned: positionPlanRef.current.plans[0]?.steps[0] ?? null,
      };
      if (!strikeCueBall(worldRef.current, angle, intent.power, intent.spin)) {
        shotCaptureRef.current = null;
        skillShotCaptureRef.current = null;
        return;
      }
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
  }, [worldRef, matchRef, aimGhostDistRef, scene3DRef, playStrike, resetEvents, setWorldView, setMatch]);

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
  const cameraViewAzimuth = touchAimCameraLocked
    ? cameraAzimuth
    : cameraAzimuthAtView(
        cameraAzimuth,
        aim,
        viewLevel,
        cameraDetached,
      );
  const cameraViewAzimuthRef = useRef(cameraViewAzimuth);
  cameraViewAzimuthRef.current = cameraViewAzimuth;

  const clearTouchAimCameraTimer = useCallback(() => {
    if (touchAimCameraTimerRef.current === null) return;
    window.clearTimeout(touchAimCameraTimerRef.current);
    touchAimCameraTimerRef.current = null;
  }, []);

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

  useEffect(
    () => () => clearTouchAimCameraTimer(),
    [clearTouchAimCameraTimer],
  );

  // 回合交给顾燃时立即退出短暂的触屏锁镜，观战相机不等待计时器。
  useEffect(() => {
    if (!spectatorActive) return;
    clearTouchAimCameraTimer();
    setTouchAimCameraLocked(false);
  }, [clearTouchAimCameraTimer, spectatorActive]);

  // 玩家主动升到全局高度时冻结进入瞬间的方位；点台面此后只调整瞄准/幽灵球。
  useEffect(() => {
    if (
      !spectatorActive &&
      !cameraDetached &&
      isGlobalCameraView(viewLevel)
    ) {
      setCameraAzimuth(cameraViewAzimuthRef.current);
      setCameraDetached(true);
    }
  }, [cameraDetached, spectatorActive, viewLevel]);

  // 观战或主动进入全局视角后，只有确实拉到底才恢复“镜头跟杆向”。
  useEffect(() => {
    if (!spectatorActive && cameraDetached && viewLevel <= 0.005) {
      setCameraDetached(false);
    }
  }, [cameraDetached, spectatorActive, viewLevel]);

  // ── 瞄准交互（在 useShotInput 之后，以获取 setAim）──
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleAimDialAdjust,
    aimDialVisible,
    aimDialSolution,
  } = useAimInteraction({
    scene3DRef,
    worldRef,
    viewLevel,
    setAim,
    aimRef,
    cameraAzimuthRef: cameraViewAzimuthRef,
    aimGhostDistRef,
    canAim,
    matchPhase: match.phase,
    breaking: match.breaking,
    legalTargets,
    setMatch,
    setMessage,
    setWorldView,
    setViewLevel,
  });

  const orbitPointerRef = useRef<{ id: number; lastX: number } | null>(null);
  const handleStagePointerDown = useCallback((event: ReactPointerEvent) => {
    if (!spectatorActive) {
      if (event.pointerType === 'touch' && canAim) lockTouchAimCamera();
      handlePointerDown(event);
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    orbitPointerRef.current = { id: event.pointerId, lastX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [canAim, handlePointerDown, lockTouchAimCamera, spectatorActive]);

  const handleStagePointerMove = useCallback((event: ReactPointerEvent) => {
    const orbit = orbitPointerRef.current;
    if (!spectatorActive || !orbit || orbit.id !== event.pointerId) {
      if (!spectatorActive) handlePointerMove(event);
      return;
    }
    event.preventDefault();
    const delta = event.clientX - orbit.lastX;
    orbit.lastX = event.clientX;
    setCameraAzimuth(current => cameraAzimuthAfterDrag(current, delta));
  }, [handlePointerMove, spectatorActive]);

  const finishStagePointer = useCallback((
    event: ReactPointerEvent,
    aimHandler: (event: ReactPointerEvent) => void,
  ) => {
    const orbit = orbitPointerRef.current;
    if (spectatorActive && orbit?.id === event.pointerId) {
      event.preventDefault();
      orbitPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    aimHandler(event);
    if (event.pointerType === 'touch') releaseTouchAimCameraLater();
  }, [releaseTouchAimCameraLater, spectatorActive]);

  const handleStableAimDialAdjust = useCallback((pixelDelta: number) => {
    const coarsePointer = typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: coarse)').matches;
    if (coarsePointer && canAim && !isGlobalCameraView(viewLevel)) {
      lockTouchAimCamera();
      handleAimDialAdjust(pixelDelta);
      releaseTouchAimCameraLater();
      return;
    }
    handleAimDialAdjust(pixelDelta);
  }, [
    canAim,
    handleAimDialAdjust,
    lockTouchAimCamera,
    releaseTouchAimCameraLater,
    viewLevel,
  ]);

  const handleCameraRecenter = useCallback(() => {
    setCameraAzimuth(FULL_TABLE_AZIMUTH);
    setViewLevel(current => Math.max(current, SPECTATOR_VIEW_LEVEL));
  }, [setViewLevel]);

  // ── 重置游戏 ──
  const handleResetGame = useCallback((nextMode: GameMode) => {
    resetGame(setAim, nextMode);
    setSpin({ x: 0, y: 0 });
    setGuidanceEnabled(false);
    setCameraAzimuth(FULL_TABLE_AZIMUTH);
    setCameraDetached(false);
    clearTouchAimCameraTimer();
    setTouchAimCameraLocked(false);
    planConsultedRef.current = false;
    skillShotCaptureRef.current = null;
    aimGhostDistRef.current = null;
  }, [clearTouchAimCameraTimer, resetGame, setAim, setSpin, aimGhostDistRef]);
  const handleReplay = useCallback(() => {
    handleResetGame(gameMode);
  }, [gameMode, handleResetGame]);

  // ── 物理停止结算 ──
  const settleShot = useCallback(() => {
    const settlement = settleShotRaw(setViewLevel);
    // 复盘生成：有捕获（玩家杆）→ 判定；无捕获（对手杆）→ 清掉旧复盘
    const capture = shotCaptureRef.current;
    shotCaptureRef.current = null;
    const review = capture ? buildShotReview(capture) : null;
    setShotReview(review);
    // 只记录复盘，不主动打开；用户需要再次点亮 💡。
    setGuidanceEnabled(false);

    const skillCapture = skillShotCaptureRef.current;
    skillShotCaptureRef.current = null;
    if (settlement && skillCapture) {
      const { facts, resolution } = settlement;
      const messageKey = resolution.next.messageKey;
      const foul = messageKey === 'foul' || messageKey === 'lose-8-foul';
      const pocketed = facts.pocketed.includes(skillCapture.target);
      const samePlan =
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
  }, [recordPlayerShot, settleShotRaw, setViewLevel]);

  // ── 物理模拟循环 ──
  usePhysicsLoop({
    active: match.phase === 'rolling',
    worldRef,
    onFrame: useCallback(() => {
      playPhysicsEvents(worldRef.current.events);
      setWorldView(cloneWorld(worldRef.current));
    }, [worldRef, playPhysicsEvents, setWorldView]),
    onSettled: settleShot,
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

  // ── 初始化 3D 场景 ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new Scene3D(el);
    scene3DRef.current = scene;
    scene.start();

    // 开发模式暴露调试句柄
    if (import.meta.env.DEV) {
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
  }, []);

  // ── 同步世界状态到 3D 场景 ──
  useEffect(() => {
    const scene = scene3DRef.current;
    if (!scene) return;

    aimRef.current = aim;
    scene.setViewLevel(viewLevel);
    scene.setAim(aim);
    scene.setCameraAzimuth(cameraViewAzimuth);
    scene.setSpin(spin);
    scene.setAimGhostDist(aimGhostDistRef.current);
    // 合法目标高亮：只在玩家回合显示
    scene.setLegalTargets(legalTargets);
    scene.sync(worldView);

    const cue = getCueBall(worldView);
    scene.update(cue?.x ?? 0, cue?.z ?? 0, previewPower, match.phase);
  }, [worldView, viewLevel, aim, cameraViewAzimuth, previewPower, match, spin, aimGhostDistRef, legalTargets]);

  // ── 渲染 ──
  return (
    <div className="game-shell">
      <Scoreboard match={match} worldView={worldView} />
      <TableStage
        viewLevel={viewLevel}
        spectatorActive={spectatorActive}
        match={match}
        aimDialVisible={aimDialVisible}
        aimDialSolution={aimDialSolution}
        containerRef={containerRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={(event) => finishStagePointer(event, handlePointerUp)}
        onPointerCancel={(event) => finishStagePointer(event, handlePointerCancel)}
        onAimDialAdjust={handleStableAimDialAdjust}
        onCameraRecenter={handleCameraRecenter}
        onResetGame={handleReplay}
      />
      <ControlDeck
        viewLevel={viewLevel}
        canAim={canAim}
        spin={spin}
        charging={charging}
        previewPower={previewPower}
        breaking={match.breaking}
        planStatus={guidanceAllowed ? positionPlan.status : 'idle'}
        guidanceEnabled={guidanceAllowed && guidanceEnabled}
        hasReview={guidanceAllowed && Boolean(shotReview)}
        onViewLevel={setViewLevel}
        onSpinChange={setSpin}
        onTogglePlan={handleTogglePlan}
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
      {match.phase === 'intro' && (
        <IntroScreen playerSkill={playerSkill} onStart={handleResetGame} />
      )}
    </div>
  );
}
