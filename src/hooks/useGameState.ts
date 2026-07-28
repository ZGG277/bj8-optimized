/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机
[OUTPUT]: 对外提供对局状态（worldView / match / viewMode / camLift）与
          resetGame / settleShot / setMessage 等编排动作
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
import { createShotSettlementGuard } from './shot-settlement-guard';

type ViewMode = 'first' | 'overhead';

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

  // ── 辅助状态 ──
  const [rating] = useState(50);
  const [showCoach, setShowCoach] = useState(true);

  // ── 派生 ──
  const canAim = match.phase === 'aiming' && match.actor === 'player' && !worldView.moving;

  /** 更新消息 */
  const setMessage = useCallback((key: MatchMessageKey, params: MatchMessageParams = {}) => {
    setMatch(m => ({ ...m, messageKey: key, messageParams: params }));
  }, []);

  /** 相同一杆只结算一次；重开局时必须与新世界 shot=0 一起归零。 */
  const settlementGuardRef = useRef(createShotSettlementGuard());

  /** 初始化/重置游戏（每局随机摆法，分组归属由首进花色自然决定） */
  const resetGame = useCallback((setAim: (a: number) => void) => {
    const fresh = createInitialWorld(Math.random);
    worldRef.current = fresh;
    settlementGuardRef.current.reset();
    setWorldView(cloneWorld(fresh));
    setMatch(m => beginMatch(m));
    setViewMode('overhead');
    setAim(0);
  }, []);

  /** 物理停止：事实推导 → 纯规则结算 → 原子提交 → 执行显式 effects
   *  相同一杆只结算一次（shotId 守卫，StrictMode 下不重复） */
  const settleShotRaw = useCallback((setViewModeFn: (m: ViewMode) => void) => {
    const world = worldRef.current;
    const facts = factsFromWorld(world);
    if (!settlementGuardRef.current.accept(facts.shotId)) return;

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
    rating,
    showCoach,
    setShowCoach,
    canAim,
    setMessage,
    resetGame,
    settleShotRaw,
  };
}
