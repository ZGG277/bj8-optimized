/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机、Scene3D 快照适配器、audio 合成音效与 React 状态
[OUTPUT]: 对外提供完整对局编排：开球、双视角、瞄准/杆法/蓄力输入、规则轮转、AI 回合与 HUD
[POS]: 实验场的产品编排层，只消费物理快照与规则迁移；不得在此重新实现规则判定或底层蓄力时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  createInitialWorld,
  cloneWorld,
  getCueBall,
  strikeCueBall,
  respotCueBall,
  isCueBallPocketed,
  planSimpleShot,
  TABLE,
  type BilliardsWorld,
} from './physics';
import {
  beginMatch,
  createInitialMatchState,
  legalNumbers,
  resolveStoppedShot,
} from './match/match-machine';
import { factsFromWorld } from './match/shot-facts';
import type { MatchMessageKey, MatchMessageParams, MatchState } from './match/types';
import { useShotInput } from './input/use-shot-input';
import { MIN_POWER, type ShotIntent } from './input/shot-input';
import { usePhysicsLoop } from './simulation/use-physics-loop';
import { ViewToolbar } from './components/ViewToolbar';
import { AimControls } from './components/AimControls';
import { SpinControl } from './components/SpinControl';
import { ShootControl } from './components/ShootControl';
import { Scene3D } from './Scene3D';
import { BilliardsAudio } from './audio';

type ViewMode = 'first' | 'overhead';

const COLORS: Record<number, string> = {
  1: '#e8bf3f', 2: '#315eb4', 3: '#c64a3a', 4: '#6f4ba2', 5: '#e47f32', 6: '#3c8c5a', 7: '#7a2830', 8: '#171717',
  9: '#e8bf3f', 10: '#315eb4', 11: '#c64a3a', 12: '#6f4ba2', 13: '#e47f32', 14: '#3c8c5a', 15: '#7a2830',
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** 规则层只给 messageKey + params，中文文案统一在这里渲染 */
function renderMatchMessage(m: MatchState): string {
  const { actor, count, group, reason, target } = m.messageParams;
  const name = actor === 'player' ? '你' : '顾燃';
  const other = actor === 'player' ? '顾燃' : '你';
  switch (m.messageKey) {
    case 'break-start': return '开球：正中1号球，把力量送到八成';
    case 'rolling': return '球在运动中...';
    case 'pot-continue': return `${name}${count && count > 1 ? `${count}颗球进` : '进球'}，继续`;
    case 'miss-turn': return `${name}未进球，${other}的回合`;
    case 'group-assigned': return `${group === 'solid' ? '全色球' : '花色球'}，${name}的回合`;
    case 'foul': {
      const r = reason === 'scratch' ? '白球落袋'
        : reason === 'no-contact' ? '未碰到球'
        : reason === 'wrong-first' ? '首碰非法球' : '碰球后未碰库';
      return actor === 'player'
        ? `${name}犯规，${r}，顾燃获得自由球`
        : `${name}犯规，${r}，你的自由球，点击台面放置白球`;
    }
    case 'win-8': return `8号球入袋，${actor === 'player' ? '你赢了！' : '顾燃赢了'}`;
    case 'lose-8-foul': return `犯规打8号球，${actor === 'player' ? '你输了' : '顾燃输了'}`;
    case 'lose-8-early': return `8号球提前入袋，${actor === 'player' ? '你输了' : '顾燃输了'}`;
    case 'ai-choice': return `顾燃选择${target}号球`;
    case 'ai-safe': return '顾燃选择安全球';
    case 'placing-freeball': return '你的自由球，点击台面放置白球';
    case 'placed': return '白球已放置，你的回合';
    case 'place-occupied': return '位置被占用，请选择其他位置';
    case 'place-near-pocket': return '不能放在袋口附近';
  }
}

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene3DRef = useRef<Scene3D | null>(null);
  const worldRef = useRef<BilliardsWorld>(createInitialWorld());

  const [worldView, setWorldView] = useState<BilliardsWorld>(() => createInitialWorld());
  // 规则状态单一原子来源：phase/actor/breaking/playerGroup/winner/message 一体迁移
  const [match, setMatch] = useState<MatchState>(() => createInitialMatchState());
  const matchRef = useRef(match);
  useEffect(() => { matchRef.current = match; }, [match]);
  const [viewMode, setViewMode] = useState<ViewMode>('first');
  const [rating] = useState(50);
  const [showCoach, setShowCoach] = useState(true);
  const [cameraAngle, setCameraAngle] = useState(0);

  const matchMessage = renderMatchMessage(match);
  const setMessage = useCallback((key: MatchMessageKey, params: MatchMessageParams = {}) => {
    setMatch(m => ({ ...m, messageKey: key, messageParams: params }));
  }, []);

  // 音效
  const audioRef = useRef<BilliardsAudio | null>(null);
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new BilliardsAudio();
  }
  const playedEventsRef = useRef(0);

  // 触摸/鼠标拖拽相关
  const dragRef = useRef<{ mode: 'aim' | 'ghost' | 'line'; downX: number; downY: number; dragging: boolean } | null>(null);
  const aimRef = useRef(0);
  // 幽灵球靶点距离（白球心到影子球心）；null = 自动贴首触点
  const aimGhostDistRef = useRef<number | null>(null);
  // 俯身角度微调（米），视角工具条 ▲▼ 驱动
  const [camLift, setCamLift] = useState(0);

  const canAim = match.phase === 'aiming' && match.actor === 'player' && !worldView.moving;

  // 出杆提交:输入层只给 ShotIntent,这里负责球杆动画与物理击球
  const handleCommit = useCallback((intent: ShotIntent) => {
    // 角度必须与 3D 中球杆朝向一致(第一人称含相机转角)
    const angle = viewMode === 'overhead' ? aimRef.current : aimRef.current + cameraAngle;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return;
    // 出杆后靶点回自动：下一杆幽灵球重新贴首触点
    aimGhostDistRef.current = null;

    // 物理击球在球杆皮头接触球面的动画帧触发,保证"杆到球动"的同步感
    const doShot = () => {
      if (!strikeCueBall(worldRef.current, angle, intent.power, intent.spin)) return;
      audioRef.current?.strike(intent.power);
      playedEventsRef.current = 0;
      setWorldView(cloneWorld(worldRef.current));
      setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
    };

    const scene = scene3DRef.current;
    if (scene) {
      scene.triggerStrike({ cueX: cueBall.x, cueZ: cueBall.z, angle, power: intent.power, spin: intent.spin, onContact: doShot });
    } else {
      doShot();
    }
  }, [viewMode, cameraAngle]);

  // 出杆输入协调器:aim/spin/蓄力会话与键盘统一在此
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
  } = useShotInput({ canShoot: canAim, onCommit: handleCommit });

  // 初始化/重置游戏（每局随机摆法，分组归属由首进花色自然决定）
  const resetGame = useCallback(() => {
    const fresh = createInitialWorld(Math.random);
    worldRef.current = fresh;
    setWorldView(cloneWorld(fresh));
    setMatch(m => beginMatch(m));
    setViewMode('first');
    setAim(0);
    aimGhostDistRef.current = null;
  }, [setAim]);

  // 处理点击 3D 场景放置白球（自由球）
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (matchRef.current.phase !== 'placing') return;

    const scene = scene3DRef.current;
    if (!scene) return;

    const hit = scene.screenToTable(e.clientX, e.clientY);
    if (!hit) return;

    const ballX = hit.x;
    const ballZ = hit.z;

    // 检查点击是否在台面有效范围内
    if (
      Math.abs(ballX) > TABLE.width / 2 - TABLE.ballRadius ||
      Math.abs(ballZ) > TABLE.length / 2 - TABLE.ballRadius
    ) {
      return;
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
    setMatch(m => ({ ...m, phase: 'aiming', messageKey: 'placed', messageParams: {} }));
    setWorldView(cloneWorld(world));
  }, [setMessage]);

  // 物理停止：事实推导 → 纯规则结算 → 原子提交 → 执行显式 effects
  // 相同一杆只结算一次（shotId 守卫，StrictMode 下不重复）
  const lastSettledShotRef = useRef(0);
  const settleShot = useCallback(() => {
    const world = worldRef.current;
    const facts = factsFromWorld(world);
    if (facts.shotId === lastSettledShotRef.current) return;
    lastSettledShotRef.current = facts.shotId;

    const resolution = resolveStoppedShot(matchRef.current, facts);
    for (const effect of resolution.effects) {
      if (effect.type === 'auto-respot-cue') {
        respotCueBall(world);
      } else if (effect.type === 'request-player-placement') {
        setViewMode('overhead');
      }
    }
    setMatch(resolution.next);
    setWorldView(cloneWorld(world));
  }, []);

  // 物理模拟循环:固定步调度,帧率只影响每帧步数,不影响步长与时间守恒
  usePhysicsLoop({
    active: match.phase === 'rolling',
    worldRef,
    onFrame: () => {
      // 新物理事件 → 音效(按事件顺序,不重复不漏)
      const events = worldRef.current.events;
      for (let i = playedEventsRef.current; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'first-contact') audioRef.current?.click(Math.min(1, ev.speed / 5));
        else if (ev.type === 'cushion') audioRef.current?.cushion(Math.min(1, ev.speed / 5));
        else if (ev.type === 'pocket') audioRef.current?.pocket();
      }
      playedEventsRef.current = events.length;
      setWorldView(cloneWorld(worldRef.current));
    },
    onSettled: settleShot,
  });


  // 对手AI回合
  useEffect(() => {
    if (match.phase !== 'opponent') return;

    const timer = setTimeout(() => {
      const world = worldRef.current;
      if (isCueBallPocketed(world)) respotCueBall(world);

      const legal = legalNumbers(world, 'opponent', matchRef.current.playerGroup);
      const opponentSkill = clamp(rating + 8, 26, 92);
      const plan = planSimpleShot(world, legal, opponentSkill);

      const cue = getCueBall(world)!;
      const fallback = world.balls.find(b => b.active && legal.includes(b.number));
      const angle = plan?.angle ?? (fallback ? Math.atan2(fallback.x - cue.x, -(fallback.z - cue.z)) : 0);
      const shotPower = plan?.power ?? 52;

      const doShot = () => {
        strikeCueBall(world, angle, shotPower);
        audioRef.current?.strike(shotPower);
        playedEventsRef.current = 0;
        setWorldView(cloneWorld(world));
        setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
      };
      setMessage(plan ? 'ai-choice' : 'ai-safe', { target: plan?.target });
      const scene = scene3DRef.current;
      if (scene) {
        // AI 也播放出杆动画：球杆出现在白球后方，触球瞬间才击球
        scene.triggerStrike({ cueX: cue.x, cueZ: cue.z, angle, power: shotPower, spin: { x: 0, y: 0 }, onContact: doShot });
      } else {
        doShot();
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [match.phase, match.playerGroup, rating, setMessage]);

  // 初始化 3D 场景
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new Scene3D(el);
    scene3DRef.current = scene;
    scene.start();

    // 开发模式暴露调试句柄（自动化交互测试用）
    if (import.meta.env.DEV) {
      (window as unknown as { __bj8: unknown }).__bj8 = { world: worldRef, scene: scene3DRef, aim: aimRef };
    }

    return () => {
      scene.dispose();
      scene3DRef.current = null;
    };
  }, []);

  // 同步世界状态到 3D 场景
  useEffect(() => {
    const scene = scene3DRef.current;
    if (!scene) return;

    aimRef.current = aim;
    scene.setViewMode(viewMode);
    scene.setCameraAngle(cameraAngle);
    scene.setCamLift(camLift);
    scene.setAim(aim);
    scene.setSpin(spin);
    scene.setAimGhostDist(aimGhostDistRef.current);
    // 合法目标高亮：只在玩家回合显示
    if (match.phase === 'aiming' && match.actor === 'player' && !worldView.moving) {
      scene.setLegalTargets(legalNumbers(worldView, 'player', match.playerGroup));
    } else {
      scene.setLegalTargets([]);
    }
    scene.sync(worldView);

    const cue = getCueBall(worldView);
    scene.update(cue?.x ?? 0, cue?.z ?? 0, previewPower, match.phase);
  }, [worldView, viewMode, cameraAngle, camLift, aim, previewPower, match, spin]);

  // 点哪打哪:把触点映射到台面坐标,瞄准线直接指向它。
  // 第一人称相机绕白球刚性随转,屏幕点的方位偏移 φ 与当前瞄准角无关
  // (探针实测映射 f(a)=a+φ),因此按下时刻的活相机单次映射即为正解——
  // 它指向玩家此刻看到的那个台面点;不存在不动点,迭代只会把瞄准推走。
  // 瞄准角全周无钳制(useShotInput 内部归一到 (-π,π]),相机随瞄准整周转。
  // keepDist: 抓瞄准线拖拽时只转角度,幽灵球靶点距离保持不变;
  // 否则触点距离记为靶点距离,影子球落在所点处(超出首触点由场景钳回)。
  const aimAtPointer = useCallback((clientX: number, clientY: number, keepDist = false) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const dx = hit.x - cue.x;
    const dz = hit.z - cue.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.035) return; // 离白球太近不响应,防抖动
    if (!keepDist) aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -dz);
    const base = viewMode === 'first' ? cameraAngle : 0;
    setAim(worldAngle - base);
  }, [viewMode, cameraAngle, setAim]);

  // 抓影子球挪位:影子球跟随指针落到台面任意位置(不限角度),
  // 白球过影子球心的延长线即杆向
  const moveGhostTo = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const m = TABLE.ballRadius;
    const gx = clamp(hit.x, -TABLE.width / 2 + m, TABLE.width / 2 - m);
    const gz = clamp(hit.z, -TABLE.length / 2 + m, TABLE.length / 2 - m);
    const dx = gx - cue.x;
    const dz = gz - cue.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return; // 影子球不能贴到白球上
    aimGhostDistRef.current = dist;
    const worldAngle = Math.atan2(dx, -dz);
    const base = viewMode === 'first' ? cameraAngle : 0;
    setAim(worldAngle - base);
  }, [viewMode, cameraAngle, setAim]);

  // 指针落点判定:幽灵球上=抓球挪位;瞄准线段上=抓线转角;其余=点哪打哪
  const pickDragMode = useCallback((clientX: number, clientY: number): 'aim' | 'ghost' | 'line' => {
    const scene = scene3DRef.current;
    const cue = getCueBall(worldRef.current);
    if (!scene || !cue) return 'aim';
    const ghost = scene.aimGhostPos();
    if (!ghost) return 'aim';
    const hit = scene.screenToTable(clientX, clientY);
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
  }, []);

  // 触摸/鼠标拖拽调整瞄准。
  // 拖拽死区:按下已采样一次(抓影子球除外,它等拖动);相机随新瞄准角转动的
  // 过渡期内,手指的微小抖动(轻点附带几像素位移)若再次采样,会用"正在旋转
  // 的相机"二次采样把瞄准带偏几度。8px 死区内的移动不重复采样,超出才进入拖拽。
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (match.phase === 'placing') return; // 放置模式交给 click 处理
    if (!canAim) return;
    const mode = pickDragMode(e.clientX, e.clientY);
    dragRef.current = { mode, downX: e.clientX, downY: e.clientY, dragging: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (mode === 'ghost') return; // 抓影子球:按下不跳变,等拖动
    aimAtPointer(e.clientX, e.clientY, mode === 'line');
  }, [canAim, match.phase, pickDragMode, aimAtPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // 放置模式：幽灵球预览
    if (match.phase === 'placing') {
      const scene = scene3DRef.current;
      const hit = scene?.screenToTable(e.clientX, e.clientY);
      if (scene && hit) scene.setGhostCue(hit.x, hit.z, true);
      return;
    }
    const drag = dragRef.current;
    if (!drag || !canAim) return;
    if (!drag.dragging) {
      if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 8) return;
      drag.dragging = true;
    }
    if (drag.mode === 'ghost') moveGhostTo(e.clientX, e.clientY);
    else aimAtPointer(e.clientX, e.clientY, drag.mode === 'line');
  }, [canAim, match.phase, aimAtPointer, moveGhostTo]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  const activeNumbers = new Set(worldView.balls.filter(b => b.active).map(b => b.number));
  const solidPotted = 7 - worldView.balls.filter(b => b.active && b.group === 'solid').length;
  const stripePotted = 7 - worldView.balls.filter(b => b.active && b.group === 'stripe').length;

  return (
    <div className="game-shell">
      {/* 顶部状态栏 */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-glyph">杆</span>
          <div>
            <strong>杆间</strong>
            <small>中式八球</small>
          </div>
        </div>
        <div className="match-state">
          <span className={`turn-light ${match.phase === 'aiming' ? 'live' : ''}`} />
          <p>
            {match.phase === 'aiming' ? (match.actor === 'player' ? '你的回合' : '顾燃回合') :
             match.phase === 'opponent' ? '顾燃思考' :
             match.phase === 'rolling' ? '物理结算' :
             match.phase === 'placing' ? '放置白球' :
             '陪练局'}
          </p>
          <strong>第 {worldView.shot + 1} 杆</strong>
        </div>
      </header>

      {/* 比分板 */}
      <section className="scoreboard">
        <div className="player-card">
          <div className="avatar me">我</div>
          <div className="identity">
            <span>PLAYER</span>
            <strong>你</strong>
            <small>{match.playerGroup === 'solid' ? '全色球' : match.playerGroup === 'stripe' ? '花色球' : '开放球局'}</small>
          </div>
          <div className="mini-rack">
            {[1,2,3,4,5,6,7,8].map(n => (
              <span key={n} className={`mini-ball ${n===8?'eight':'solid'} ${!activeNumbers.has(n)?'down':''}`}
                style={{'--c': COLORS[n]} as React.CSSProperties}>{n}</span>
            ))}
          </div>
        </div>
        <div className="score-center">
          <span>{match.playerGroup === 'stripe' ? stripePotted : solidPotted}</span>
          <i>-</i>
          <span>{match.playerGroup === 'stripe' ? solidPotted : stripePotted}</span>
        </div>
        <div className="player-card opponent">
          <div className="mini-rack">
            {[9,10,11,12,13,14,15,8].map(n => (
              <span key={n} className={`mini-ball ${n===8?'eight':'stripe'} ${!activeNumbers.has(n)?'down':''}`}
                style={{'--c': COLORS[n]} as React.CSSProperties}>{n}</span>
            ))}
          </div>
          <div className="identity right">
            <span>SPARRING</span>
            <strong>顾燃</strong>
            <small>{match.playerGroup ? (match.playerGroup === 'solid' ? '花色球' : '全色球') : '等待分组'}</small>
          </div>
          <div className="avatar rival">燃</div>
        </div>
      </section>

      {/* 球桌区域 */}
      <section className="table-stage">
        <div
          ref={containerRef}
          className={`viewport ${viewMode} ${match.phase === 'placing' ? 'placing' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleCanvasClick}
        >

          <ViewToolbar
            viewMode={viewMode}
            onViewMode={setViewMode}
            onRotate={(dir) => setCameraAngle(a => a + dir * Math.PI / 4)}
            onElevate={(dir) => setCamLift(v => clamp(v + dir * 0.03, -0.02, 0.22))}
          />

          <div className="room-label">
            <span>PHYSICS WORLD</span>
            <small>{worldView.balls.filter(b => b.active).length} BALLS</small>
          </div>

          <div className="shot-target">
            <small>{match.breaking ? '第一杆' : '合法目标'}</small>
            <strong>{match.playerGroup === 'solid' ? '全色球' : match.playerGroup === 'stripe' ? '花色球' : '开放球局'}</strong>
          </div>

          <div className="view-hint">
            {worldView.moving ? '球在运动中...' : viewMode === 'overhead' ? '观察球形' : '拖拽调整方向'}
          </div>

          {match.phase === 'opponent' && (
            <div className="turn-mask">
              <span className="thinking-dot" />
              <strong>顾燃计算中...</strong>
            </div>
          )}

          {match.phase === 'finished' && (
            <div className="finish-mask">
              <span>GAME OVER</span>
              <h1>本局结束</h1>
              <button onClick={resetGame}>再来一局</button>
            </div>
          )}
        </div>

        {/* 陪练提示 */}
        {showCoach && (
          <aside className="coach-card">
            <button className="coach-toggle" onClick={() => setShowCoach(false)}>收起</button>
            <span className="coach-index">物理复盘 · {String(Math.max(1, worldView.shot)).padStart(2, '0')}</span>
            <h2>{matchMessage.split('：')[1] || matchMessage}</h2>
            <p>{match.breaking ? '开球从白球冲量开始，经过球球碰撞、库边和摩擦停止。' : '瞄好方向，按住蓄力，松开出杆。'}</p>
          </aside>
        )}
      </section>

      {/* 控制区：信息居左，方向微调/击球点盘/出杆区依次靠右 */}
      <footer className="control-deck">
        {/* 信息 */}
        <div className="match-message">
          <span>{matchMessage}</span>
          {!worldView.moving && <small>瞄好停一拍再出杆</small>}
        </div>

        <AimControls disabled={!canAim} onAdjust={(d) => setAim(a => a + d)} />

        <SpinControl spin={spin} disabled={!canAim} onSpinChange={setSpin} />

        <ShootControl
          disabled={!canAim}
          charging={charging}
          power={previewPower}
          breaking={match.breaking}
          onBegin={beginCharge}
          onUpdate={updateCharge}
          onRelease={releaseCharge}
          onCancel={cancelCharge}
          onTap={() => commitShot({ power: MIN_POWER, spin })}
        />
      </footer>

      {/* 开始界面 */}
      {match.phase === 'intro' && (
        <div className="intro-backdrop">
          <div className="intro-card">
            <span className="intro-kicker">中式八球 · 物理模拟</span>
            <h1>杆间</h1>
            <p>真实物理引擎驱动，每一杆都经过碰撞计算。</p>
            <button className="start-btn" onClick={resetGame}>
              开始对局
            </button>
            <div className="intro-tags">
              <span>240Hz物理</span>
              <span>Three.js 真 3D</span>
              <span>双视角</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}