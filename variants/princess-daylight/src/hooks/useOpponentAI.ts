import { followFeelSpin } from '../input/follow-feel';
import { createShotLease } from '../shot-lifecycle';
/*
[INPUT]: 依赖局前锁定 OpponentProfile、分级预算战术 Worker、按等级执行误差、physics 击球/复位、match 规则与场景动画
[OUTPUT]: 副作用 Hook：对手回合按等级选择与执行球路；友好机会或普通进攻由同一真实物理执行，无候选时优先清晰合法首碰
[POS]: AI 调度层，只做对手回合的编排；不关心 UI 交互或玩家输入
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { friendlyTurnTactics } from '../opponent/friendly-style';
import { useEffect, useCallback, useRef } from 'react';
import {
  getCueBall,
  strikeCueBall,
  respotCueBall,
  isCueBallPocketed,
  cloneWorld,
  planSimpleShot,
} from '../physics';
import type { BilliardsWorld } from '../physics';
import { legalNumbers } from '../match/match-machine';
import {
  cancelPendingTacticalShot,
  chooseTacticalShotWithinDeadline,
} from '../opponent/tactical-async';
import { planAggressiveFallback, planClearContactFallback } from '../opponent/tactical-shot';
import { type OpponentProfile } from '../opponent/model';
import { sampleOpponentExecution } from '../opponent/execution';
import type { ShotCandidate } from '../planner/candidates';
import type { Scene3D } from '../Scene3D';
import type { BilliardsAudio } from '../audio';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';

// 500ms 自然停顿 + 档案内限预算规划 + 出杆动画。
export const OPPONENT_THINK_DELAY_MS = 500;

interface OpponentAIProps {
  active: boolean;
  worldRef: React.MutableRefObject<BilliardsWorld>;
  matchRef: React.RefObject<MatchState>;
  scene3DRef: React.RefObject<Scene3D | null>;
  audioRef: React.RefObject<BilliardsAudio | null>;
  opponentProfile: OpponentProfile;
  playerGroup: MatchState['playerGroup'];
  setWorldView: React.Dispatch<React.SetStateAction<BilliardsWorld>>;
  setMatch: React.Dispatch<React.SetStateAction<MatchState>>;
  setMessage: (key: MatchMessageKey, params?: MatchMessageParams) => void;
  onShot: () => void;
}

export function useOpponentAI({
  active,
  worldRef,
  matchRef,
  scene3DRef,
  audioRef,
  opponentProfile,
  playerGroup,
  setWorldView,
  setMatch,
  setMessage,
  onShot,
}: OpponentAIProps) {
  const runRef = useRef(0);
  const runWorldRef = useRef(worldRef.current);
  const onShotRef = useCallback(onShot, [onShot]);

  useEffect(() => {
    if (runWorldRef.current !== worldRef.current || matchRef.current?.actor === 'player') {
      runRef.current = 0; runWorldRef.current = worldRef.current;
    }
    if (!active) return;
    let cancelled = false;
    const lease = createShotLease(worldRef, matchRef, 'opponent');
    let animatedScene: Scene3D | null = null;
    let contactCommitted = false;

    const timer = setTimeout(() => {
      void (async () => {
        const world = worldRef.current;
        if (cancelled || !lease.current()) return;
        if (isCueBallPocketed(world)) respotCueBall(world);

        const currentMatch = matchRef.current;
        if (!currentMatch) return;
        const legal = legalNumbers(world, 'opponent', currentMatch.playerGroup);
        const playerLegal = legalNumbers(world, 'player', currentMatch.playerGroup);
        const remaining = (numbers: number[]) => numbers.filter(n => n !== 8).length;
        const tactics = friendlyTurnTactics(opponentProfile, remaining(playerLegal), remaining(legal), runRef.current);

        let planned: ShotCandidate | null = null;
        try {
          planned = await chooseTacticalShotWithinDeadline(
            cloneWorld(world),
            legal,
            { ...tactics, playerLegal },
            opponentProfile.tactical.deadlineMs,
          );
          if (cancelled || !lease.current()) return;
        } catch {
          // Worker 失败或请求被取消时走旧直接进攻器，保证 AI 回合不会悬挂。
        }
        if (cancelled || !lease.current()) return;

        const fallbackPlan = planned
          ? null
          : planSimpleShot(world, legal, opponentProfile.effectiveLevel);
        const aggressiveFallback = planned || fallbackPlan || opponentProfile.tactical.allowSafety
          ? null
          : planClearContactFallback(world, legal) ?? planAggressiveFallback(world, legal);
        const cue = getCueBall(world)!;
        const fallbackTarget = world.balls.find(b => b.active && legal.includes(b.number));
        const baseAngle =
          planned?.angle ??
          fallbackPlan?.angle ??
          aggressiveFallback?.angle ??
          (fallbackTarget ? Math.atan2(fallbackTarget.x - cue.x, -(fallbackTarget.z - cue.z)) : 0);
        const basePower = planned?.power ?? fallbackPlan?.power ?? aggressiveFallback?.power ?? 52;
        const spin = planned?.spin ?? { x: 0, y: 0 };
        // planner 给出理想杆；实力只在实际出杆时采样一次，不根据结果重抽。
        const execution = planned
          ? sampleOpponentExecution(planned, opponentProfile)
          : sampleOpponentExecution({ angle: baseAngle, power: basePower, tolerance: .012 }, opponentProfile);
        const angle = execution.angle;
        const shotPower = execution.power;
        const target = planned?.target ?? fallbackPlan?.target ?? aggressiveFallback?.target;

        const doShot = () => lease.commit(() => {
          if (cancelled || !strikeCueBall(world, angle, shotPower, spin)) return;
          contactCommitted = true;
          runRef.current += 1;
          audioRef.current?.strike(shotPower);
          onShotRef();
          setWorldView(cloneWorld(world));
          setMatch(m => ({ ...m, phase: 'rolling', messageKey: m.messageKey === 'foul' ? 'foul' : 'rolling', messageParams: m.messageKey === 'foul' ? m.messageParams : {} }));
        });

        // Keep the player's foul reason readable through this opponent turn.
        if (matchRef.current?.messageKey !== 'foul') setMessage(target ? 'ai-choice' : 'ai-safe', { target });
        const scene = scene3DRef.current;
        if (scene) {
          animatedScene = scene;
          scene.triggerStrike({ cueX: cue.x, cueZ: cue.z, angle, power: shotPower, spin: followFeelSpin(spin, world.followFeel ?? 'current'), onContact: doShot });
        } else {
          doShot();
        }
      })();
    }, OPPONENT_THINK_DELAY_MS);

    return () => {
      cancelled = true;
      lease.cancel();
      if (!contactCommitted) animatedScene?.cancelStrike();
      clearTimeout(timer);
      cancelPendingTacticalShot();
    };
  }, [active, worldRef, matchRef, scene3DRef, audioRef, opponentProfile, playerGroup, setWorldView, setMatch, setMessage, onShotRef]);
}
