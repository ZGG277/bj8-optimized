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
  stepWorld,
  pocketedThisShot,
  respotCueBall,
  isCueBallPocketed,
  planSimpleShot,
  PHYSICS_DT,
  TABLE,
  type BilliardsWorld,
  type CueSpin,
} from './physics';
import { Scene3D } from './Scene3D';
import { BilliardsAudio } from './audio';

type Phase = 'intro' | 'playing' | 'rolling' | 'opponent' | 'finished' | 'placing';
type ViewMode = 'first' | 'overhead';
type Actor = 'player' | 'opponent';
type ObjectGroup = 'solid' | 'stripe';

const COLORS: Record<number, string> = {
  1: '#e8bf3f', 2: '#315eb4', 3: '#c64a3a', 4: '#6f4ba2', 5: '#e47f32', 6: '#3c8c5a', 7: '#7a2830', 8: '#171717',
  9: '#e8bf3f', 10: '#315eb4', 11: '#c64a3a', 12: '#6f4ba2', 13: '#e47f32', 14: '#3c8c5a', 15: '#7a2830',
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function oppositeGroup(g: ObjectGroup): ObjectGroup {
  return g === 'solid' ? 'stripe' : 'solid';
}

function ballsForGroup(world: BilliardsWorld, group: ObjectGroup) {
  return world.balls.filter(b => b.active && b.group === group).map(b => b.number);
}

function legalNumbers(world: BilliardsWorld, actor: Actor, playerGroup: ObjectGroup | null): number[] {
  // 球局未分组时（playerGroup为null），任何球都可以打
  if (!playerGroup) {
    return world.balls.filter(b => b.active && (b.group === 'solid' || b.group === 'stripe')).map(b => b.number);
  }
  // 分组后，本方打本方球，对手打对方球
  const group = actor === 'player' ? playerGroup : oppositeGroup(playerGroup);
  const remaining = ballsForGroup(world, group);
  // 球已清完，只能打8号
  return remaining.length > 0 ? remaining : [8];
}

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scene3DRef = useRef<Scene3D | null>(null);
  const worldRef = useRef<BilliardsWorld>(createInitialWorld());

  const [worldView, setWorldView] = useState<BilliardsWorld>(() => createInitialWorld());
  const [phase, setPhase] = useState<Phase>('intro');
  const [viewMode, setViewMode] = useState<ViewMode>('first');
  const [aim, setAim] = useState(0);
  const [power, setPower] = useState(58);
  const [rating] = useState(50);
  const [playerGroup, setPlayerGroup] = useState<ObjectGroup | null>(null);
  const [showCoach, setShowCoach] = useState(true);
  const [isBreak, setIsBreak] = useState(true);
  const [matchMessage, setMatchMessage] = useState('开球：正中1号球，把力量送到八成');
  const [cameraAngle, setCameraAngle] = useState(0);
  const [currentActor, setCurrentActor] = useState<'player' | 'opponent'>('player'); // 当前出杆方
  const [spin, setSpin] = useState<CueSpin>({ x: 0, y: 0 }); // 击球点：x 高低杆 y 左右塞

  // 音效
  const audioRef = useRef<BilliardsAudio | null>(null);
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new BilliardsAudio();
  }
  const playedEventsRef = useRef(0);

  // 触摸/鼠标拖拽相关
  const dragRef = useRef<{ aiming: boolean } | null>(null);
  const aimRef = useRef(0);

  // 蓄力：右下角拉杆区下拉蓄力（拖拽距离=力度），空格为按住时间蓄力
  const chargeRef = useRef<{ mode: 'drag' | 'time'; startY: number; startTime: number } | null>(null);
  const powerRafRef = useRef<number | null>(null);
  const powerRef = useRef(58);
  const applyPower = useCallback((v: number) => {
    const p = Math.min(100, Math.max(0, v));
    powerRef.current = p;
    setPower(p);
  }, []);

  // 瞄准：方向键按住持续加速
  const aimKeysRef = useRef<{
    left: boolean;
    right: boolean;
    leftStart: number;
    rightStart: number;
    raf: number | null;
  }>({ left: false, right: false, leftStart: 0, rightStart: 0, raf: null });
  const AIM_BASE_SPEED = 0.0008;
  const AIM_ACCEL = 0.0012;

  const canAim = phase === 'playing' && !worldView.moving;

  // 初始化/重置游戏
  const resetGame = useCallback(() => {
    const fresh = createInitialWorld();
    worldRef.current = fresh;
    setWorldView(cloneWorld(fresh));
    setPlayerGroup(null);
    setIsBreak(true);
    setViewMode('first');
    setAim(0);
    setPower(58);
    setMatchMessage('开球：正中1号球，把力量送到八成');
    setPhase('playing');
  }, []);

  // 拉杆区：按下开始蓄力
  const startDragCharge = useCallback((clientY: number) => {
    if (!canAim || chargeRef.current) return;
    chargeRef.current = { mode: 'drag', startY: clientY, startTime: 0 };
    applyPower(0);
  }, [canAim, applyPower]);

  // 拉杆区：下拉距离映射力度（每像素 0.6，约 167px 满力）
  const updateDragCharge = useCallback((clientY: number) => {
    const c = chargeRef.current;
    if (!c || c.mode !== 'drag') return;
    applyPower((clientY - c.startY) * 0.6);
  }, [applyPower]);

  // 空格：按住时间蓄力
  const startTimeCharge = useCallback(() => {
    if (!canAim || chargeRef.current) return;
    chargeRef.current = { mode: 'time', startY: 0, startTime: performance.now() };
    const loop = () => {
      const c = chargeRef.current;
      if (!c || c.mode !== 'time') return;
      applyPower((performance.now() - c.startTime) * 0.06);
      powerRafRef.current = requestAnimationFrame(loop);
    };
    powerRafRef.current = requestAnimationFrame(loop);
  }, [canAim, applyPower]);

  // 取消蓄力（不出杆）
  const cancelCharge = useCallback(() => {
    if (powerRafRef.current) {
      cancelAnimationFrame(powerRafRef.current);
      powerRafRef.current = null;
    }
    chargeRef.current = null;
  }, []);

  // 处理点击 3D 场景放置白球（自由球）
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'placing') return;

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
        setMatchMessage('位置被占用，请选择其他位置');
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
        setMatchMessage('不能放在袋口附近');
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
    setMatchMessage('白球已放置，你的回合');
    setPhase('playing');
    setWorldView(cloneWorld(world));
  }, [phase]);

  // 松开出杆
  const releaseCharge = useCallback(() => {
    const c = chargeRef.current;
    if (!c) return;

    if (powerRafRef.current) {
      cancelAnimationFrame(powerRafRef.current);
      powerRafRef.current = null;
    }
    chargeRef.current = null;

    if (!canAim) return;

    // 最低力度保证轻触也能出杆
    const finalPower = Math.max(6, powerRef.current);

    // 执行击球：角度必须与 3D 中球杆朝向一致（第一人称含相机转角）
    const angle = viewMode === 'overhead' ? aim : aim + cameraAngle;
    const cueBall = getCueBall(worldRef.current);
    if (!cueBall) return;

    // 物理击球在球杆皮头接触球面的动画帧触发，保证"杆到球动"的同步感
    const doShot = () => {
      if (!strikeCueBall(worldRef.current, angle, finalPower, spin)) return;
      audioRef.current?.strike(finalPower);
      playedEventsRef.current = 0;
      setWorldView(cloneWorld(worldRef.current));
      setMatchMessage('球在运动中...');
      setPhase('rolling');
    };

    setPower(finalPower);
    setCurrentActor('player');  // 确保当前出杆方是玩家
    const scene = scene3DRef.current;
    if (scene) {
      scene.triggerStrike({ cueX: cueBall.x, cueZ: cueBall.z, angle, power: finalPower, spin, onContact: doShot });
    } else {
      doShot();
    }
  }, [canAim, aim, viewMode, cameraAngle, spin]);

  // 键盘控制
  useEffect(() => {
    const aimLoop = () => {
      const keys = aimKeysRef.current;
      const now = performance.now();
      let delta = 0;

      if (keys.left) {
        const elapsed = now - keys.leftStart;
        delta -= AIM_BASE_SPEED + elapsed * AIM_ACCEL;
      }
      if (keys.right) {
        const elapsed = now - keys.rightStart;
        delta += AIM_BASE_SPEED + elapsed * AIM_ACCEL;
      }

      if (delta !== 0) {
        setAim(a => clamp(a + delta, -0.72, 0.72));
      }

      if (keys.left || keys.right) {
        keys.raf = requestAnimationFrame(aimLoop);
      } else {
        keys.raf = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startTimeCharge();
        return;
      }

      if (!canAim) return;
      if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') && !aimKeysRef.current.left) {
        e.preventDefault();
        aimKeysRef.current.left = true;
        aimKeysRef.current.leftStart = performance.now();
        if (!aimKeysRef.current.raf) {
          aimKeysRef.current.raf = requestAnimationFrame(aimLoop);
        }
      }
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') && !aimKeysRef.current.right) {
        e.preventDefault();
        aimKeysRef.current.right = true;
        aimKeysRef.current.rightStart = performance.now();
        if (!aimKeysRef.current.raf) {
          aimKeysRef.current.raf = requestAnimationFrame(aimLoop);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        releaseCharge();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        aimKeysRef.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        aimKeysRef.current.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (powerRafRef.current) cancelAnimationFrame(powerRafRef.current);
      if (aimKeysRef.current.raf) cancelAnimationFrame(aimKeysRef.current.raf);
    };
  }, [canAim, startTimeCharge, releaseCharge]);

  // 物理模拟循环
  useEffect(() => {
    if (phase !== 'rolling') return;

    let animationId: number;
    let lastTime = performance.now();
    let accumulator = 0;

    const tick = (now: number) => {
      accumulator += Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      while (accumulator >= PHYSICS_DT && worldRef.current.moving) {
        stepWorld(worldRef.current, PHYSICS_DT);
        accumulator -= PHYSICS_DT;
      }

      // 新物理事件 → 音效
      const events = worldRef.current.events;
      for (let i = playedEventsRef.current; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'first-contact') audioRef.current?.click(Math.min(1, ev.speed / 5));
        else if (ev.type === 'cushion') audioRef.current?.cushion(Math.min(1, ev.speed / 5));
        else if (ev.type === 'pocket') audioRef.current?.pocket();
      }
      playedEventsRef.current = events.length;

      setWorldView(cloneWorld(worldRef.current));

      if (!worldRef.current.moving) {
        // 物理停止，处理回合结果
        handleRoundEnd();
        return;
      }

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [phase]);

  // 处理回合结束 - 中八规则（基于当前出杆方）
  const handleRoundEnd = useCallback(() => {
    const world = worldRef.current;
    const potted = pocketedThisShot(world);
    const cueScratch = isCueBallPocketed(world);
    const objectPotted = potted.filter(n => n > 0 && n !== 8);
    const eightPotted = potted.includes(8);
    const actor = currentActor;  // 当前出杆方

    // 检测犯规
    const firstContactBall = world.firstContact;
    let foul = false;
    let foulReason = '';

    // 犯规1：白球落袋
    if (cueScratch) {
      foul = true;
      foulReason = '白球落袋';
      // 白球落袋后，对手获得自由球 - 进入放置阶段
      // respotCueBall(world); // 不再自动放置，等用户手动选择位置
    }

    // 犯规2：首碰非法球
    // 开球时（分组前）可以碰任何球
    // 分组后必须先碰自己组的球
    if (!foul && firstContactBall !== null && firstContactBall !== 0) {
      const actorGroup = actor === 'player' ? playerGroup : (playerGroup ? oppositeGroup(playerGroup) : null);
      if (actorGroup) {
        const firstBall = world.balls.find(b => b.number === firstContactBall);
        if (firstBall && firstBall.group !== actorGroup) {
          // 检查是否是非法目标
          const legalNums = legalNumbers(world, actor, playerGroup);
          if (!legalNums.includes(firstContactBall)) {
            foul = true;
            foulReason = '首碰非法球';
          }
        }
      }
    }

    // 犯规3：未碰任何球
    if (!foul && firstContactBall === null && !cueScratch) {
      foul = true;
      foulReason = '未碰到球';
    }

    // 犯规4：碰球后无进球且没有球碰库（中八/美式规则）
    if (!foul && firstContactBall !== null && objectPotted.length === 0) {
      const firstContactTime = world.events.find(e => e.type === 'first-contact')?.time;
      const cushionAfterContact = firstContactTime !== undefined &&
        world.events.some(e => e.type === 'cushion' && e.time > firstContactTime);
      if (!cushionAfterContact) {
        foul = true;
        foulReason = '碰球后未碰库';
      }
    }

    // 8号球入袋判定
    if (eightPotted) {
      const actorGroup = actor === 'player' ? playerGroup : (playerGroup ? oppositeGroup(playerGroup) : null);
      const cleared = actorGroup ? ballsForGroup(world, actorGroup).length === 0 : false;

      if (cleared && !foul) {
        const winMsg = actor === 'player' ? '你赢了！' : '顾燃赢了';
        setMatchMessage(`8号球入袋，${winMsg}`);
        setPhase('finished');
      } else {
        const loseMsg = actor === 'player' ? '你输了' : '顾燃输了';
        setMatchMessage(foul ? `犯规打8号球，${loseMsg}` : `8号球提前入袋，${loseMsg}`);
        setPhase('finished');
      }
      setWorldView(cloneWorld(world));
      return;
    }

    // 犯规处理（优先级最高）
    if (foul) {
      const foulMsg = actor === 'player' ? '你犯规' : '顾燃犯规';
      setIsBreak(false);  // 犯规后退出开球阶段

      if (actor === 'player') {
        // 玩家犯规，对手（AI）获得自由球，AI自动放置
        setMatchMessage(`${foulMsg}，${foulReason}，顾燃获得自由球`);
        setCurrentActor('opponent');
        respotCueBall(world);
        setPhase('opponent');
      } else {
        // 对手犯规，玩家获得自由球，需要手动放置
        setMatchMessage(`${foulMsg}，${foulReason}，你的自由球，点击台面放置白球`);
        setCurrentActor('player');
        setViewMode('overhead');
        setPhase('placing');
      }
      setWorldView(cloneWorld(world));
      return;
    }

    // 开球阶段特殊处理
    if (isBreak) {
      if (objectPotted.length > 0) {
        // 开球阶段进球了：继续击球，退出开球阶段（但不确定分组）
        setIsBreak(false);
        const continueMsg = objectPotted.length > 1 ? `${objectPotted.length}颗球进` : '进球';
        setMatchMessage(`${actor === 'player' ? '你' : '顾燃'}${continueMsg}，继续`);
        if (actor === 'player') {
          setPhase('playing');
        } else {
          setPhase('opponent');
        }
      } else {
        // 开球阶段没进球：换对手
        setIsBreak(false);
        setMatchMessage(`${actor === 'player' ? '你未进球' : '顾燃未进球'}，${actor === 'player' ? '顾燃' : '你'}的回合`);
        setCurrentActor(actor === 'player' ? 'opponent' : 'player');
        if (actor === 'player') {
          setPhase('opponent');
        } else {
          setPhase('playing');
        }
      }
      setWorldView(cloneWorld(world));
      return;
    }

    // 分组判定：开球阶段结束后首次合法进球确定分组
    // 规则：谁首次合法进球，谁获得该花色，对方获得另一个花色
    if (!playerGroup && objectPotted.length > 0) {
      const first = world.balls.find(b => b.number === objectPotted[0]);
      if (first?.group === 'solid' || first?.group === 'stripe') {
        const determinedGroup = first.group;
        const playerActualGroup = actor === 'player' ? determinedGroup : oppositeGroup(determinedGroup);
        setPlayerGroup(playerActualGroup);
        const playerName = actor === 'player' ? '你' : '顾燃';
        setMatchMessage(`${determinedGroup === 'solid' ? '全色球' : '花色球'}，${playerName}的回合`);
        if (actor === 'player') {
          setPhase('playing');
        } else {
          setPhase('opponent');
        }
        setWorldView(cloneWorld(world));
        return;
      }
    }

    // 判断回合结果（进球/未进球）
    if (objectPotted.length > 0) {
      const continueMsg = objectPotted.length > 1 ? `${objectPotted.length}颗球进` : '进球';
      setMatchMessage(`${actor === 'player' ? '你' : '顾燃'}${continueMsg}，继续`);
      if (actor === 'player') {
        setPhase('playing');
      } else {
        setPhase('opponent');
      }
    } else {
      const missMsg = actor === 'player' ? '你未进球' : '顾燃未进球';
      setMatchMessage(`${missMsg}，${actor === 'player' ? '顾燃' : '你'}的回合`);
      setCurrentActor(actor === 'player' ? 'opponent' : 'player');
      if (actor === 'player') {
        setPhase('opponent');
      } else {
        setPhase('playing');
      }
    }

    setWorldView(cloneWorld(world));
  }, [playerGroup, currentActor]);

  // 对手AI回合
  useEffect(() => {
    if (phase !== 'opponent') return;

    const timer = setTimeout(() => {
      const world = worldRef.current;
      if (isCueBallPocketed(world)) respotCueBall(world);

      setCurrentActor('opponent');  // 确保当前出杆方是对手

      const legal = legalNumbers(world, 'opponent', playerGroup);
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
        setPhase('rolling');
      };
      setMatchMessage(plan ? `顾燃选择${plan.target}号球` : '顾燃选择安全球');
      const scene = scene3DRef.current;
      if (scene) {
        // AI 也播放出杆动画：球杆出现在白球后方，触球瞬间才击球
        scene.triggerStrike({ cueX: cue.x, cueZ: cue.z, angle, power: shotPower, spin: { x: 0, y: 0 }, onContact: doShot });
      } else {
        doShot();
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [phase, playerGroup, rating]);

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
    scene.setAim(aim);
    scene.setSpin(spin);
    // 合法目标高亮：只在玩家回合显示
    if (phase === 'playing' && currentActor === 'player' && !worldView.moving) {
      scene.setLegalTargets(legalNumbers(worldView, 'player', playerGroup));
    } else {
      scene.setLegalTargets([]);
    }
    scene.sync(worldView);

    const cue = getCueBall(worldView);
    scene.update(cue?.x ?? 0, cue?.z ?? 0, power, phase);
  }, [worldView, viewMode, cameraAngle, aim, power, phase, spin, playerGroup, currentActor]);

  // 点哪打哪：把触点映射到台面坐标，瞄准线直接指向它
  const aimAtPointer = useCallback((clientX: number, clientY: number) => {
    const scene = scene3DRef.current;
    if (!scene) return;
    const hit = scene.screenToTable(clientX, clientY);
    if (!hit) return;
    const cue = getCueBall(worldRef.current);
    if (!cue || !cue.active) return;
    const dx = hit.x - cue.x;
    const dz = hit.z - cue.z;
    if (Math.hypot(dx, dz) < 0.035) return; // 离白球太近不响应，防抖动
    const worldAngle = Math.atan2(dx, -dz);
    const base = viewMode === 'first' ? cameraAngle : 0;
    setAim(clamp(worldAngle - base, -0.72, 0.72));
  }, [viewMode, cameraAngle]);

  // 触摸/鼠标拖拽调整瞄准
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (phase === 'placing') return; // 放置模式交给 click 处理
    if (!canAim) return;
    dragRef.current = { aiming: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    aimAtPointer(e.clientX, e.clientY);
  }, [canAim, phase, aimAtPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // 放置模式：幽灵球预览
    if (phase === 'placing') {
      const scene = scene3DRef.current;
      const hit = scene?.screenToTable(e.clientX, e.clientY);
      if (scene && hit) scene.setGhostCue(hit.x, hit.z, true);
      return;
    }
    if (!dragRef.current?.aiming || !canAim) return;
    aimAtPointer(e.clientX, e.clientY);
  }, [canAim, phase, aimAtPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  // 触控调整瞄准按钮
  const adjustAim = (delta: number) => {
    if (!canAim) return;
    setAim(a => clamp(a + delta, -0.72, 0.72));
  };

  // 击球点拖拽：映射到 -1..1（x 高低杆，y 左右塞）
  const updateSpinFromPointer = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    setSpin({ x: -dy * scale, y: dx * scale });
  };

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
          <span className={`turn-light ${phase === 'playing' ? 'live' : ''}`} />
          <p>
            {phase === 'playing' ? (currentActor === 'player' ? '你的回合' : '对手回合') :
             phase === 'opponent' ? '顾燃思考' :
             phase === 'rolling' ? '物理结算' :
             phase === 'placing' ? '放置白球' :
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
            <small>{playerGroup === 'solid' ? '全色球' : playerGroup === 'stripe' ? '花色球' : '开放球局'}</small>
          </div>
          <div className="mini-rack">
            {[1,2,3,4,5,6,7,8].map(n => (
              <span key={n} className={`mini-ball ${n===8?'eight':'solid'} ${!activeNumbers.has(n)?'down':''}`}
                style={{'--c': COLORS[n]} as React.CSSProperties}>{n}</span>
            ))}
          </div>
        </div>
        <div className="score-center">
          <span>{playerGroup === 'stripe' ? stripePotted : solidPotted}</span>
          <i>-</i>
          <span>{playerGroup === 'stripe' ? solidPotted : stripePotted}</span>
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
            <small>{playerGroup ? (playerGroup === 'solid' ? '花色球' : '全色球') : '等待分组'}</small>
          </div>
          <div className="avatar rival">燃</div>
        </div>
      </section>

      {/* 球桌区域 */}
      <section className="table-stage">
        <div
          ref={containerRef}
          className={`viewport ${viewMode}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleCanvasClick}
        >

          <div className="view-switcher">
            <button className={viewMode === 'first' ? 'active' : ''} onClick={() => setViewMode('first')}>第一人称</button>
            <button className={viewMode === 'overhead' ? 'active' : ''} onClick={() => setViewMode('overhead')}>俯视</button>
            {viewMode === 'first' && (
              <>
                <button onClick={() => setCameraAngle(a => a - Math.PI / 4)} title="左转">◀</button>
                <button onClick={() => setCameraAngle(a => a + Math.PI / 4)} title="右转">▶</button>
              </>
            )}
          </div>

          <div className="room-label">
            <span>PHYSICS WORLD</span>
            <small>{worldView.balls.filter(b => b.active).length} BALLS</small>
          </div>

          <div className="shot-target">
            <small>{isBreak ? '第一杆' : '合法目标'}</small>
            <strong>{playerGroup === 'solid' ? '全色球' : playerGroup === 'stripe' ? '花色球' : '开放球局'}</strong>
          </div>

          <div className="view-hint">
            {worldView.moving ? '球在运动中...' : viewMode === 'overhead' ? '观察球形' : '拖拽调整方向'}
          </div>

          {phase === 'opponent' && (
            <div className="turn-mask">
              <span className="thinking-dot" />
              <strong>顾燃计算中...</strong>
            </div>
          )}

          {phase === 'finished' && (
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
            <p>{isBreak ? '开球从白球冲量开始，经过球球碰撞、库边和摩擦停止。' : '瞄好方向，按住蓄力，松开出杆。'}</p>
          </aside>
        )}
      </section>

      {/* 控制区 */}
      <footer className="control-deck">
        {/* 瞄准微调 */}
        <div className="aim-controls">
          <button onClick={() => adjustAim(-0.01)} disabled={!canAim}>◀</button>
          <div>
            <strong>方向</strong>
            <small>微调</small>
          </div>
          <button onClick={() => adjustAim(0.01)} disabled={!canAim}>▶</button>
        </div>

        {/* 击球点（杆法） */}
        <div
          className="spin-pad"
          onPointerDown={(e) => {
            if (!canAim) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            updateSpinFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (canAim && e.buttons) updateSpinFromPointer(e);
          }}
        >
          <div className="spin-ball">
            <span className="spin-cross-h" />
            <span className="spin-cross-v" />
            <span
              className="spin-dot"
              style={{ left: `${50 + spin.y * 38}%`, top: `${50 - spin.x * 38}%` }}
            />
          </div>
          <small>{spin.x > 0.25 ? '高杆' : spin.x < -0.25 ? '低杆' : spin.y > 0.25 ? '右塞' : spin.y < -0.25 ? '左塞' : '中杆'}</small>
        </div>

        {/* 信息 */}
        <div className="match-message">
          <span>{matchMessage}</span>
          {!worldView.moving && <small>瞄好停一拍再出杆</small>}
        </div>

        {/* 力度和出杆（右下角拉杆区） */}
        <div className="shoot-zone">
          <div className="power-meter">
            <div className="power-meter-track">
              <div
                className={`power-meter-fill ${power > 85 ? 'hot' : ''}`}
                style={{ height: `${power}%` }}
              />
            </div>
            <span className="power-num">{Math.round(power)}</span>
          </div>
          <div
            className={`shoot-pad ${chargeRef.current ? 'charging' : ''} ${!canAim ? 'disabled' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              startDragCharge(e.clientY);
            }}
            onPointerMove={(e) => {
              e.preventDefault();
              updateDragCharge(e.clientY);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              releaseCharge();
            }}
            onPointerCancel={cancelCharge}
            onContextMenu={(e) => e.preventDefault()}
          >
            <strong>{isBreak ? '开球' : '出杆'}</strong>
            <small>下拉蓄力 · 松开出杆</small>
          </div>
        </div>
      </footer>

      {/* 开始界面 */}
      {phase === 'intro' && (
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