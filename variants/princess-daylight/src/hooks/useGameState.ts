import { loadCareer, recordCareerFinish, saveCareer } from '../opponent/career';
import { settledShot, type SettledShot } from '../match/shot-log';
import { customCompanionFor, lockCompanionProfile, readCompanionPreferences } from '../opponent/companion-preferences';
import { pickCompanion } from '../opponent/companions';
import { loadCompanionCollection } from '../opponent/companion-collection';
import { createFriendlyOpponentProfile } from '../opponent/friendly-style';
/*
[INPUT]: 依赖 physics 确定性世界、match 纯规则状态机
[OUTPUT]: 摆球错误保留真实犯规原因；真实终局一次提交独立资历及技术均值；对外提供默认第一视角的对局状态、双方能力档案与单点训练总结、
          resetGame / settleShot / recordPlayerShot / completeMatchAssessment 等编排动作
[POS]: 状态管理收敛层，集中管理 Game 组件的所有状态与 ref
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { gameStorage } from '../minitool/persistent-storage';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  createInitialWorld,
  cloneWorld,
  getCueBall,
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
  assessCompletedMatch,
  buildMatchTrainingSummary,
  loadPlayerSkillProfile,
  savePlayerSkillProfile,
  type GameMode,
  type MatchTrainingSummary,
  type ShotSkillObservation,
} from '../opponent/model';
import { createShotSettlementGuard } from './shot-settlement-guard';
import { FIRST_PERSON_VIEW, OVERHEAD_VIEW } from '../camera-view';

function browserStorage(): ReturnType<typeof gameStorage> {
  if (typeof window === 'undefined') return null;
  try {
    return gameStorage();
  } catch {
    return null;
  }
}

export function useGameState(preferredCompanionId?: string) {
  // ── 物理世界 ──
  // 首次加载也使用随机摆法，确保每一局的初始球局都不重复
  const [worldView, setWorldView] = useState<BilliardsWorld>(() => createInitialWorld(Math.random));
  const worldRef = useRef<BilliardsWorld>(cloneWorld(worldView));

  // ── 规则状态 ──
  const [match, setMatch] = useState<MatchState>(() => beginMatch({
    ...createInitialMatchState(),
    companionId: pickCompanion(undefined, Math.random, preferredCompanionId).id,
  }));
  const matchRef = useRef(match);
  useEffect(() => { matchRef.current = match; }, [match]);

  useEffect(() => {
    lockCompanionProfile(customCompanionFor(match.companionId));
    return () => lockCompanionProfile();
  }, [match.companionId]);

  // ── 视图状态 ──
  const [viewLevel, setViewLevel] = useState(FIRST_PERSON_VIEW);

  // ── 玩家能力与对手档案（整局中锁定，结束后一次性更新）──
  const [playerSkill, setPlayerSkill] = useState(() =>
    loadPlayerSkillProfile(browserStorage()),
  );
  const playerSkillRef = useRef(playerSkill);
  useEffect(() => { playerSkillRef.current = playerSkill; }, [playerSkill]);
  const [gameMode, setGameMode] = useState<GameMode>('practice');
  const [opponentProfile, setOpponentProfile] = useState(() =>
    createFriendlyOpponentProfile(playerSkill, 'practice'),
  );
  const [trainingSummary, setTrainingSummary] = useState<MatchTrainingSummary | null>(null);
  const assessmentDoneRef = useRef(false);
  const [career, setCareer] = useState(() => loadCareer(browserStorage(), playerSkill.matchesEvaluated));
  const careerRef = useRef(career);
  const [careerSaveFailed, setCareerSaveFailed] = useState(false);
  const careerShots = useRef<SettledShot[]>([]);
  const resolvedFinish = useRef<MatchState | null>(null);
  const rackId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [collection] = useState(() => loadCompanionCollection(browserStorage()));
  const matchObservationsRef = useRef<ShotSkillObservation[]>([]);

  // ── 派生 ──
  const canAim = match.phase === 'aiming' && match.actor === 'player' && !worldView.moving;

  /** 更新消息 */
  const setMessage = useCallback((key: MatchMessageKey, params: MatchMessageParams = {}) => {
    setMatch(m => ({ ...m, messageKey: key, messageParams: key.startsWith('place-') ? { ...m.messageParams, ...params } : params }));
  }, []);

  /** 相同一杆只结算一次；重开局时必须与新世界 shot=0 一起归零。 */
  const settlementGuardRef = useRef(createShotSettlementGuard());

  /** 初始化/重置游戏：局前按最新玩家画像生成对手档案。 */
  const resetGame = useCallback((setAim: (a: number) => void, nextMode: GameMode = gameMode) => {
    const fresh = createInitialWorld(Math.random);
    fresh.followFeel = worldRef.current.followFeel;
    worldRef.current = fresh;
    settlementGuardRef.current.reset();
    matchObservationsRef.current = [];
    assessmentDoneRef.current = false;
    careerShots.current = []; resolvedFinish.current = null;
    rackId.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTrainingSummary(null);
    setWorldView(cloneWorld(fresh));
    const companion = pickCompanion(matchRef.current.companionId, Math.random, preferredCompanionId);
    lockCompanionProfile(readCompanionPreferences().custom.find(profile => profile.id === companion.id));
    setMatch(m => beginMatch({ ...m, companionId: companion.id }));
    setGameMode(nextMode);
    setOpponentProfile(createFriendlyOpponentProfile(playerSkillRef.current, nextMode));
    setViewLevel(OVERHEAD_VIEW);
    setAim(0);
  }, [gameMode, preferredCompanionId]);

  /** 局内只收集事实；不改可见分数、不持久化、不改本局 AI。 */
  const recordPlayerShot = useCallback((observation: ShotSkillObservation) => {
    matchObservationsRef.current.push(observation);
  }, []);

  /** 胜负已定后一次消费本局样本，双方新档案只影响结算页/下一局。 */
  const completeMatchAssessment = useCallback((winner: MatchState['winner']) => {
    if (!winner || assessmentDoneRef.current) return playerSkillRef.current;
    assessmentDoneRef.current = true;
    if (resolvedFinish.current) {
      const nextCareer = recordCareerFinish(careerRef.current, rackId.current, resolvedFinish.current, careerShots.current);
      if (nextCareer !== careerRef.current) {
        careerRef.current = nextCareer; setCareer(nextCareer);
        setCareerSaveFailed(!saveCareer(browserStorage(), nextCareer));
      }
    }
    const observations = matchObservationsRef.current;
    matchObservationsRef.current = [];
    const previous = playerSkillRef.current;
    const next = assessCompletedMatch(previous, observations, winner === 'player');
    setTrainingSummary(buildMatchTrainingSummary(previous, next, observations));
    playerSkillRef.current = next;
    setPlayerSkill(next);
    savePlayerSkillProfile(next, browserStorage());
    return next;
  }, []);

  /** 物理停止：事实推导 → 纯规则结算 → 原子提交 → 执行显式 effects
   *  相同一杆只结算一次（shotId 守卫，StrictMode 下不重复） */
  const settleShotRaw = useCallback((setViewLevelFn: (level: number) => void) => {
    const world = worldRef.current;
    const facts = factsFromWorld(world);
    if (!settlementGuardRef.current.accept(facts.shotId)) return null;

    const resolution = resolveStoppedShot(matchRef.current, facts);
    const log = careerShots.current;
    const shot = settledShot(matchRef.current, facts, resolution, log[log.length - 1]);
    const cue = getCueBall(world);
    const cueEnd = cue?.active && !facts.cueScratch ? { x: cue.x, z: cue.z } : null;
    log.push(shot);
    if (resolution.next.phase === 'finished') resolvedFinish.current = resolution.next;
    for (const effect of resolution.effects) {
      if (effect.type === 'auto-respot-cue') {
        respotCueBall(world);
      } else if (effect.type === 'request-player-placement') {
        setViewLevelFn(OVERHEAD_VIEW);
      }
    }
    setMatch(resolution.next);
    setWorldView(cloneWorld(world));
    return { facts, resolution, shot, cueEnd };
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
    trainingSummary,
    collection,
    career, careerSaveFailed,
    rackId,
    gameMode,
    opponentProfile,
    canAim,
    setMessage,
    resetGame,
    recordPlayerShot,
    completeMatchAssessment,
    settleShotRaw,
  };
}
