/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机、Scene3D 快照适配器、audio 合成音效与 React 状态
[OUTPUT]: 对外提供完整对局编排：开球、双视角、桌内瞄准/杆法/蓄力输入、规则轮转、AI 回合、可拖动走位/复盘与竖屏 HUD
[POS]: 实验场的产品编排层，只消费物理快照与规则迁移；不得在此重新实现规则判定或底层蓄力时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
import { GameHeader } from './components/GameHeader';
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

export default function Game() {
  // ── 对局编排状态 ──
  const {
    worldRef, worldView, setWorldView,
    match, matchRef, setMatch,
    viewMode, setViewMode,
    camLift, setCamLift,
    rating,
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

  // ── 击球复盘（上一杆「计划 vs 实际」）──
  // 出杆瞬间在 handleCommit 的 doShot 里捕获快照；对手杆走 useOpponentAI 不经此路，天然只记玩家杆
  const shotCaptureRef = useRef<ShotCapture | null>(null);
  const [shotReview, setShotReview] = useState<ShotReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [guidanceVisible, setGuidanceVisible] = useState(true);

  // 打开前的视角，关闭时恢复
  const prevViewModeRef = useRef(viewMode);
  const handleOpenPlan = useCallback(() => {
    prevViewModeRef.current = viewMode;
    positionPlan.open();
  }, [viewMode, positionPlan]);
  const handleClosePlan = useCallback(() => {
    positionPlan.close();
    setViewMode(prevViewModeRef.current);
  }, [positionPlan, setViewMode]);

  // ── 复盘开合：▶ 对比切俯视 + 场景叠加；✕/💡 收起回 chip ──
  const prevReviewViewModeRef = useRef(viewMode);
  const handleOpenReview = useCallback(() => {
    if (!shotReview) return;
    setGuidanceVisible(true);
    prevReviewViewModeRef.current = viewMode;
    setReviewOpen(true);
    setViewMode('overhead');
    scene3DRef.current?.showReviewOverlay(shotReview);
  }, [shotReview, viewMode, setViewMode]);
  const handleCloseReview = useCallback(() => {
    setReviewOpen(false);
    scene3DRef.current?.showReviewOverlay(null);
    setViewMode(prevReviewViewModeRef.current);
  }, [setViewMode]);

  // 💡 是规划与复盘的总开关：亮起展示可用提示，熄灭时同时清掉两类浮层。
  const handleTogglePlan = useCallback(() => {
    if (planOpen || reviewOpen || (shotReview && guidanceVisible)) {
      if (planOpen) handleClosePlan();
      if (reviewOpen) handleCloseReview();
      setGuidanceVisible(false);
      return;
    }
    setGuidanceVisible(true);
    if (positionPlan.status === 'ready') handleOpenPlan();
  }, [
    planOpen,
    reviewOpen,
    shotReview,
    guidanceVisible,
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
    if (planOpen && viewMode !== 'overhead') setViewMode('overhead');
  }, [planOpen, viewMode, setViewMode]);

  const handleShowPlan = useCallback((plan: PositionPlan | null) => {
    scene3DRef.current?.showPlanChain(plan);
  }, []);
  const handlePlayPlan = useCallback((plan: PositionPlan) => {
    scene3DRef.current?.playPlanChain(plan);
  }, []);

  // ── 音效 ──
  const { audioRef, playPhysicsEvents, playStrike, resetEvents } = useAudioManager();

  // ── 瞄准交互状态（ref，在 handleCommit 与 useAimInteraction 之间共享）──
  const aimGhostDistRef = useRef<number | null>(null);
  // 瞄准值同步到 3D 场景用的 ref
  const aimRef = useRef(0);
  const resetSpinRef = useRef<() => void>(() => {});

  // ── 出杆提交：输入层只给 ShotIntent，这里负责球杆动画与物理击球 ──
  const handleCommit = useCallback((intent: ShotIntent) => {
    const angle = aimRef.current;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return;
    // 出杆后靶点回自动：下一杆幽灵球重新贴首触点
    aimGhostDistRef.current = null;
    // 新一杆出杆：上一杆复盘自动消失
    setShotReview(null);
    setReviewOpen(false);
    setGuidanceVisible(false);
    scene3DRef.current?.showReviewOverlay(null);

    const doShot = () => {
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
  }, [worldRef, aimGhostDistRef, scene3DRef, playStrike, resetEvents, setWorldView, setMatch]);

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

  // ── 瞄准交互（在 useShotInput 之后，以获取 setAim）──
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCanvasClick,
    precisionAim,
  } = useAimInteraction({
    scene3DRef,
    worldRef,
    matchRef,
    viewMode,
    setAim,
    aimRef,
    aimGhostDistRef,
    canAim,
    matchPhase: match.phase,
    breaking: match.breaking,
    legalTargets,
    setMatch,
    setMessage,
    setWorldView,
    setViewMode,
  });

  // ── 重置游戏 ──
  const handleResetGame = useCallback(() => {
    resetGame(setAim);
    setSpin({ x: 0, y: 0 });
    setGuidanceVisible(true);
    aimGhostDistRef.current = null;
  }, [resetGame, setAim, setSpin, aimGhostDistRef]);

  /** 微调按钮在普通区域沿用固定步进，靠近可下袋窗口后自动缩到窗口宽度的 1/6。 */
  const handleAimAdjust = useCallback((delta: number) => {
    const solution = findPrecisionAim(worldRef.current, aimRef.current, legalTargets);
    const adaptiveDelta = solution
      ? Math.sign(delta) * Math.min(Math.abs(delta), solution.halfWidth / 6)
      : delta;
    setAim((angle) => angle + adaptiveDelta);
  }, [legalTargets, setAim, worldRef]);

  // ── 物理停止结算 ──
  const settleShot = useCallback(() => {
    settleShotRaw(setViewMode);
    // 复盘生成：有捕获（玩家杆）→ 判定；无捕获（对手杆）→ 清掉旧复盘
    const capture = shotCaptureRef.current;
    shotCaptureRef.current = null;
    const review = capture ? buildShotReview(capture) : null;
    setShotReview(review);
    setGuidanceVisible(Boolean(review));
  }, [settleShotRaw, setViewMode]);

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
    rating,
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
    scene.setViewMode(viewMode);
    scene.setCamLift(camLift);
    scene.setAim(aim);
    scene.setSpin(spin);
    scene.setAimGhostDist(aimGhostDistRef.current);
    // 合法目标高亮：只在玩家回合显示
    scene.setLegalTargets(legalTargets);
    scene.sync(worldView);

    const cue = getCueBall(worldView);
    scene.update(cue?.x ?? 0, cue?.z ?? 0, previewPower, match.phase);
  }, [worldView, viewMode, camLift, aim, previewPower, match, spin, aimGhostDistRef, legalTargets]);

  // ── 渲染 ──
  return (
    <div className="game-shell">
      <GameHeader match={match} shot={worldView.shot} />
      <Scoreboard match={match} worldView={worldView} />
      <TableStage
        viewMode={viewMode}
        match={match}
        worldView={worldView}
        canAim={canAim}
        precisionAim={precisionAim}
        containerRef={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCanvasClick}
        onViewMode={setViewMode}
        onRotate={(dir) => setAim(a => a + dir * Math.PI / 4)}
        onElevate={(dir) => setCamLift(v => Math.min(0.22, Math.max(-0.02, v + dir * 0.03)))}
        onAimAdjust={handleAimAdjust}
        onResetGame={handleResetGame}
      />
      <ControlDeck
        canAim={canAim}
        playerTurn={match.phase === 'aiming' && match.actor === 'player' && !worldView.moving}
        spin={spin}
        charging={charging}
        previewPower={previewPower}
        breaking={match.breaking}
        planStatus={positionPlan.status}
        guidanceVisible={guidanceVisible}
        hasReview={Boolean(shotReview)}
        onAimAdjust={handleAimAdjust}
        onSpinChange={setSpin}
        onTogglePlan={handleTogglePlan}
        onBeginCharge={beginCharge}
        onUpdateCharge={updateCharge}
        onReleaseCharge={releaseCharge}
        onCancelCharge={cancelCharge}
        onTapShot={() => commitShot({ power: MIN_POWER, spin })}
      />
      {planOpen && (
        <PlanOverlay
          plans={positionPlan.plans}
          onClose={handleClosePlan}
          onShowPlan={handleShowPlan}
          onPlayPlan={handlePlayPlan}
        />
      )}
      {/* 复盘讲上一杆、规划讲下一杆可共存；planOpen 时提示条位置让位给引导，chip 隐藏 */}
      {guidanceVisible && shotReview && !planOpen && (
        <ReviewOverlay
          review={shotReview}
          open={reviewOpen}
          onOpen={handleOpenReview}
          onClose={handleCloseReview}
        />
      )}
      {match.phase === 'intro' && <IntroScreen onStart={handleResetGame} />}
    </div>
  );
}
