/*
[INPUT]: 依赖局前锁定 OpponentProfile、带 2s 截止时间的 planner 异步搜索、physics 击球/复位、match 规则与场景动画
[OUTPUT]: 副作用 Hook：对手回合适量规划，超时回退轻量选杆，并在约 3s 内击球
[POS]: AI 调度层，只做对手回合的编排；不关心 UI 交互或玩家输入
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useEffect, useCallback } from 'react';
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
import { gaussian } from '../planner/evaluate';
import { planPositionWithinDeadline } from '../planner/async';
import type { OpponentProfile } from '../opponent/model';
import type { Scene3D } from '../Scene3D';
import type { BilliardsAudio } from '../audio';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';

// 500ms 自然停顿 + 2000ms 规划 + 最慢 320ms 出杆接触兜底 = 2820ms。
export const OPPONENT_THINK_DELAY_MS = 500;
export const OPPONENT_PLAN_DEADLINE_MS = 2000;

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
  const onShotRef = useCallback(onShot, [onShot]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const world = worldRef.current;
        if (isCueBallPocketed(world)) respotCueBall(world);

        const currentMatch = matchRef.current;
        if (!currentMatch) return;
        const legal = legalNumbers(world, 'opponent', currentMatch.playerGroup);

        let planned = null as Awaited<ReturnType<typeof planPositionWithinDeadline>>[number]['steps'][number] | null;
        try {
          const plans = await planPositionWithinDeadline(
            cloneWorld(world),
            legal,
            opponentProfile.planner,
            OPPONENT_PLAN_DEADLINE_MS,
          );
          if (cancelled) return;
          const pickAlternative =
            plans.length > 1 && Math.random() < opponentProfile.choiceTemperature;
          const planIndex = pickAlternative
            ? 1 + Math.floor(Math.random() * (plans.length - 1))
            : 0;
          planned = plans[planIndex]?.steps[0] ?? null;
        } catch {
          // Worker 失败或请求被取消时走旧直接进攻器，保证 AI 回合不会悬挂。
        }
        if (cancelled) return;

        const fallbackPlan = planned
          ? null
          : planSimpleShot(world, legal, opponentProfile.effectiveLevel);
        const cue = getCueBall(world)!;
        const fallbackTarget = world.balls.find(b => b.active && legal.includes(b.number));
        const baseAngle =
          planned?.candidate.angle ??
          fallbackPlan?.angle ??
          (fallbackTarget ? Math.atan2(fallbackTarget.x - cue.x, -(fallbackTarget.z - cue.z)) : 0);
        const basePower = planned?.candidate.power ?? fallbackPlan?.power ?? 52;
        const spin = planned?.candidate.spin ?? { x: 0, y: 0 };
        // planner 给出理想杆；实力只在实际出杆时采样一次，不根据结果重抽。
        const angle = planned
          ? baseAngle + gaussian(Math.random) * opponentProfile.aimSigma
          : baseAngle;
        const powerScale =
          1 + (Math.random() * 2 - 1) * opponentProfile.powerJitter;
        const shotPower = Math.min(100, Math.max(1, basePower * powerScale));
        const target = planned?.candidate.target ?? fallbackPlan?.target;

        const doShot = () => {
          strikeCueBall(world, angle, shotPower, spin);
          audioRef.current?.strike(shotPower);
          onShotRef();
          setWorldView(cloneWorld(world));
          setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
        };

        setMessage(target ? 'ai-choice' : 'ai-safe', { target });
        const scene = scene3DRef.current;
        if (scene) {
          scene.triggerStrike({ cueX: cue.x, cueZ: cue.z, angle, power: shotPower, spin, onContact: doShot });
        } else {
          doShot();
        }
      })();
    }, OPPONENT_THINK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, worldRef, matchRef, scene3DRef, audioRef, opponentProfile, playerGroup, setWorldView, setMatch, setMessage, onShotRef]);
}
