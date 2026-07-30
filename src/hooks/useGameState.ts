/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机
[OUTPUT]: 对外提供对局状态（worldView / match / viewLevel）、三杆批量玩家能力画像、
          渐进对手档案与 resetGame / settleShot / recordPlayerShot 等编排动作
[POS]: 状态管理收敛层，集中管理 Game 组件的所有状态与 ref
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  createInitialWorld,
  cloneWorld,
  respotCueBall,
  type BilliardsWorld,
} from '../physics';
import {
  beginMatch,
  createInitialMatchState,
  resolveStoppedShot,
} from '../match/match-machine';
import { factsFromWorld } from '../match/shot-facts';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';
import {
  createOpponentProfile,
  loadPlayerSkillProfile,
  queueShotObservation,
  retargetOpponentProfile,
  savePlayerSkillProfile,
  type GameMode,
  type ShotSkillObservation,
} from '../opponent/model';
import { createShotSettlementGuard } from './shot-settlement-guard';
import { FIRST_PERSON_VIEW, OVERHEAD_VIEW } from '../camera-view';

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useGameState() {
  // ── 物理世界 ──
  // 首次加载也使用随机摆法，确保每一局的初始球局都不重复
  const [worldView, setWorldView] = useState<BilliardsWorld>(() => createInitialWorld(Math.random));
  const worldRef = useRef<BilliardsWorld>(cloneWorld(worldView));

  // ── 规则状态 ──
  const [match, setMatch] = useState<MatchState>(() => createInitialMatchState());
  const matchRef = useRef(match);
  useEffect(() => { matchRef.current = match; }, [match]);

  // ── 视图状态 ──
  const [viewLevel, setViewLevel] = useState(FIRST_PERSON_VIEW);

  // ── 玩家能力与对手档案（玩家画像跨局；对手档案按三杆批次渐进重定向）──
  const [playerSkill, setPlayerSkill] = useState(() =>
    loadPlayerSkillProfile(browserStorage()),
  );
  const playerSkillRef = useRef(playerSkill);
  useEffect(() => { playerSkillRef.current = playerSkill; }, [playerSkill]);
  const [gameMode, setGameMode] = useState<GameMode>('practice');
  const gameModeRef = useRef<GameMode>('practice');
  const [opponentProfile, setOpponentProfile] = useState(() =>
    createOpponentProfile(playerSkill, 'practice'),
  );

  // ── 派生 ──
  const canAim = match.phase === 'aiming' && match.actor === 'player' && !worldView.moving;

  /** 更新消息 */
  const setMessage = useCallback((key: MatchMessageKey, params: MatchMessageParams = {}) => {
    setMatch(m => ({ ...m, messageKey: key, messageParams: params }));
  }, []);

  /** 相同一杆只结算一次；重开局时必须与新世界 shot=0 一起归零。 */
  const settlementGuardRef = useRef(createShotSettlementGuard());

  /** 初始化/重置游戏：局前按最新玩家画像生成对手档案。 */
  const resetGame = useCallback((setAim: (a: number) => void, nextMode: GameMode = gameMode) => {
    const fresh = createInitialWorld(Math.random);
    worldRef.current = fresh;
    settlementGuardRef.current.reset();
    setWorldView(cloneWorld(fresh));
    setMatch(m => beginMatch(m));
    setGameMode(nextMode);
    gameModeRef.current = nextMode;
    setOpponentProfile(createOpponentProfile(playerSkillRef.current, nextMode));
    setViewLevel(OVERHEAD_VIEW);
    setAim(0);
  }, [gameMode]);

  /** 所有玩家出杆进入跨局三杆队列；批次完成后才更新可见水平并渐进重定向 AI。 */
  const recordPlayerShot = useCallback((observation: ShotSkillObservation) => {
    const result = queueShotObservation(playerSkillRef.current, observation);
    playerSkillRef.current = result.profile;
    setPlayerSkill(result.profile);
    savePlayerSkillProfile(result.profile, browserStorage());
    if (result.batchCompleted) {
      setOpponentProfile(current =>
        retargetOpponentProfile(current, result.profile, gameModeRef.current));
    }
    return result;
  }, []);

  /** 物理停止：事实推导 → 纯规则结算 → 原子提交 → 执行显式 effects
   *  相同一杆只结算一次（shotId 守卫，StrictMode 下不重复） */
  const settleShotRaw = useCallback((setViewLevelFn: (level: number) => void) => {
    const world = worldRef.current;
    const facts = factsFromWorld(world);
    if (!settlementGuardRef.current.accept(facts.shotId)) return null;

    const resolution = resolveStoppedShot(matchRef.current, facts);
    for (const effect of resolution.effects) {
      if (effect.type === 'auto-respot-cue') {
        respotCueBall(world);
      } else if (effect.type === 'request-player-placement') {
        setViewLevelFn(OVERHEAD_VIEW);
      }
    }
    setMatch(resolution.next);
    setWorldView(cloneWorld(world));
    return { facts, resolution };
  }, []);

  return {
    worldRef,
    worldView,
    setWorldView,
    match,
    matchRef,
    setMatch,
    viewLevel,
    setViewLevel,
    playerSkill,
    gameMode,
    opponentProfile,
    canAim,
    setMessage,
    resetGame,
    recordPlayerShot,
    settleShotRaw,
  };
}
