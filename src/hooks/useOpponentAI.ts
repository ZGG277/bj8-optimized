/*
[INPUT]: 依赖 physics 击球/复位/合法目标、match 规则状态、Scene3D 出杆动画、audio 音效
[OUTPUT]: 副作用 Hook：match.phase === 'opponent' 时自动调度 AI 回合
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
import type { Scene3D } from '../Scene3D';
import type { BilliardsAudio } from '../audio';
import type { MatchMessageKey, MatchMessageParams, MatchState } from '../match/types';

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

interface OpponentAIProps {
  active: boolean;
  worldRef: React.MutableRefObject<BilliardsWorld>;
  matchRef: React.RefObject<MatchState>;
  scene3DRef: React.RefObject<Scene3D | null>;
  audioRef: React.RefObject<BilliardsAudio | null>;
  rating: number;
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
  rating,
  playerGroup,
  setWorldView,
  setMatch,
  setMessage,
  onShot,
}: OpponentAIProps) {
  const onShotRef = useCallback(onShot, [onShot]);

  useEffect(() => {
    if (!active) return;

    const timer = setTimeout(() => {
      const world = worldRef.current;
      if (isCueBallPocketed(world)) respotCueBall(world);

      const currentMatch = matchRef.current;
      if (!currentMatch) return;
      const legal = legalNumbers(world, 'opponent', currentMatch.playerGroup);
      const opponentSkill = clamp(rating + 8, 26, 92);
      const plan = planSimpleShot(world, legal, opponentSkill);

      const cue = getCueBall(world)!;
      const fallback = world.balls.find(b => b.active && legal.includes(b.number));
      const angle = plan?.angle ?? (fallback ? Math.atan2(fallback.x - cue.x, -(fallback.z - cue.z)) : 0);
      const shotPower = plan?.power ?? 52;

      const doShot = () => {
        strikeCueBall(world, angle, shotPower);
        audioRef.current?.strike(shotPower);
        onShotRef();
        setWorldView(cloneWorld(world));
        setMatch(m => ({ ...m, phase: 'rolling', messageKey: 'rolling', messageParams: {} }));
      };

      setMessage(plan ? 'ai-choice' : 'ai-safe', { target: plan?.target });
      const scene = scene3DRef.current;
      if (scene) {
        scene.triggerStrike({ cueX: cue.x, cueZ: cue.z, angle, power: shotPower, spin: { x: 0, y: 0 }, onContact: doShot });
      } else {
        doShot();
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [active, worldRef, matchRef, scene3DRef, audioRef, rating, playerGroup, setWorldView, setMatch, setMessage, onShotRef]);
}