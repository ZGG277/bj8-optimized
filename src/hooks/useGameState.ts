/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机
[OUTPUT]: 对外提供对局状态、玩家能力画像、局间锁定对手档案与
          resetGame / settleShot / recordPlayerShot 等编排动作
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
  applyShotObservation,
  createOpponentProfile,
  loadPlayerSkillProfile,
  savePlayerSkillProfile,
  type GameMode,
  type ShotSkillObservation,
} from '../opponent/model';
import { createShotSettlementGuard } from './shot-settlement-guard';

type ViewMode = 'first' | 'overhead';

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
  const [viewMode, setViewMode] = useState<ViewMode>('first');
  const [camLift, setCamLift] = useState(0);

  // ── 玩家能力与对手档案（玩家画像跨局；对手档案每局开局锁定）──
  const [playerSkill, setPlayerSkill] = useState(() =>
    loadPlayerSkillProfile(browserStorage()),
  );
  const playerSkillRef = useRef(playerSkill);
  useEffect(() => { playerSkillRef.current = playerSkill; }, [playerSkill]);
  const [gameMode, setGameMode] = useState<GameMode>('practice');
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

  /** 初始化/重置游戏：局前按最新玩家画像生成对手档案，整局不再动态修改。 */
  const resetGame = useCallback((setAim: (a: number) => void, nextMode: GameMode = gameMode) => {
    const fresh = createInitialWorld(Math.random);
    worldRef.current = fresh;
    settlementGuardRef.current.reset();
    setWorldView(cloneWorld(fresh));
    setMatch(m => beginMatch(m));
    setGameMode(nextMode);
    setOpponentProfile(createOpponentProfile(playerSkillRef.current, nextMode));
    setViewMode('overhead');
    setAim(0);
  }, [gameMode]);

  /** 只接收意图明确的合格击球；更新长期画像，但不会反向修改本局已锁定的 AI。 */
  const recordPlayerShot = useCallback((observation: ShotSkillObservation) => {
    setPlayerSkill((current) => {
      const next = applyShotObservation(current, observation);
      playerSkillRef.current = next;
      savePlayerSkillProfile(next, browserStorage());
      return next;
    });
  }, []);

  /** 物理停止：事实推导 → 纯规则结算 → 原子提交 → 执行显式 effects
   *  相同一杆只结算一次（shotId 守卫，StrictMode 下不重复） */
  const settleShotRaw = useCallback((setViewModeFn: (m: ViewMode) => void) => {
    const world = worldRef.current;
    const facts = factsFromWorld(world);
    if (!settlementGuardRef.current.accept(facts.shotId)) return null;

    const resolution = resolveStoppedShot(matchRef.current, facts);
    for (const effect of resolution.effects) {
      if (effect.type === 'auto-respot-cue') {
        respotCueBall(world);
      } else if (effect.type === 'request-player-placement') {
        setViewModeFn('overhead');
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
    viewMode,
    setViewMode,
    camLift,
    setCamLift,
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
