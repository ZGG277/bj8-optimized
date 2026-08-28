/*
[INPUT]: 依赖“走位与击球复盘”显式开关、physics 世界快照、match 对局状态、planner/async 异步走位搜索
[OUTPUT]: 对外提供 { status, plans, error, open, close }：只在提示开启时限时预算玩家走位方案
[POS]: 规划集成层——状态机 idle→computing→ready→showing（failed 兜底），控制预算与截止时间但不承担渲染
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneWorld, type BilliardsWorld } from '../physics';
import { legalNumbers } from '../match/match-machine';
import type { MatchState } from '../match/types';
import { cancelPendingPlan, planPositionWithinDeadline } from '../planner/async';
import type { PlannerOptions, PositionPlan } from '../planner/search';

export type PositionPlanStatus = 'idle' | 'computing' | 'ready' | 'showing' | 'failed';

export const PLAYER_PLAN_DEADLINE_MS = 2500;
export const PLAYER_PLAN_OPTIONS = {
  samples: 6,
  maxDepth: 2,
  simBudget: 320,
} satisfies PlannerOptions;

interface UsePositionPlanProps {
  worldView: BilliardsWorld;
  match: MatchState;
  enabled: boolean;
}

/** 世界状态指纹：active 球号+坐标+分组；出杆/进球/摆球后必然变化，瞄准拖拽不影响。
 *  必须含 playerGroup：进球分组那帧，worldView 与 match 可能分两个 render 到达，
 *  指纹不含分组会导致「旧分组（开放球局=14 颗全合法）算出的 plans」在分组生效后
 *  被指纹去重拦住不重算——实战表现为：已选定全色，路线第 2 杆却推荐花色球。 */
export function planFingerprint(world: BilliardsWorld, playerGroup: MatchState['playerGroup']): string {
  const balls = world.balls
    .filter((b) => b.active)
    .map((b) => `${b.number}:${b.x.toFixed(4)},${b.z.toFixed(4)}`)
    .join('|');
  return `${playerGroup ?? 'open'}#${balls}`;
}

/** 走位搜索的产品门控：只有用户显式开启走位/复盘且玩家已进入静止瞄准态才允许计算。 */
export function shouldComputePositionPlan(
  enabled: boolean,
  world: BilliardsWorld,
  match: MatchState,
): boolean {
  return enabled && match.phase === 'aiming' && match.actor === 'player' && !world.moving;
}

/**
 * 后台预算触发规则：
 * - 走位/复盘开关开启且处于玩家瞄准回合、世界指纹变化 → 限预算、限时 Worker
 * - 走位/复盘开关关闭时不创建 Worker、不做 8000 次后台仿真，避免手机无意耗电
 * - 玩家连续进攻（出杆结算后回到 aiming）→ 指纹变化，自然重新预算
 * - 玩家出杆/对手回合/滚动中 → cancelPendingPlan 丢弃陈旧结果，回到 idle
 * - showing（规划视图打开）期间不重新触发、不取消——视图里的数据保持自洽
 */
export function usePositionPlan({ worldView, match, enabled }: UsePositionPlanProps) {
  const [status, setStatus] = useState<PositionPlanStatus>('idle');
  const [plans, setPlans] = useState<PositionPlan[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastFingerprintRef = useRef('');

  useEffect(() => {
    const playerAiming = shouldComputePositionPlan(enabled, worldView, match);

    if (!playerAiming) {
      // 出杆/对手回合/滚动/放置：丢弃陈旧结果（showing 由 open() 进入，此时不可能）
      if (statusRef.current !== 'showing') {
        cancelPendingPlan();
        lastFingerprintRef.current = '';
        setPlans([]);
        setError(undefined);
        setStatus('idle');
      }
      return;
    }
    if (statusRef.current === 'showing') return; // 打开规划视图期间不重新触发

    const fingerprint = planFingerprint(worldView, match.playerGroup);
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    const legal = legalNumbers(worldView, 'player', match.playerGroup);
    if (legal.length === 0) {
      setPlans([]);
      setStatus('failed');
      return;
    }

    setError(undefined);
    setStatus('computing');
    planPositionWithinDeadline(
      cloneWorld(worldView),
      legal,
      PLAYER_PLAN_OPTIONS,
      PLAYER_PLAN_DEADLINE_MS,
    )
      .then((result) => {
        if (lastFingerprintRef.current !== fingerprint) return; // 世界已变，结果过期
        if (result.length === 0) {
          setPlans([]);
          setStatus('failed'); // 无可直接进球局面（防守不在本期范围）
        } else {
          setPlans(result);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (lastFingerprintRef.current !== fingerprint) return;
        setPlans([]);
        setError(String(err));
        setStatus('failed');
      });
  }, [worldView, match, enabled]);

  /** 打开规划视图：仅 ready 可进入 showing */
  const open = useCallback(() => {
    if (statusRef.current === 'ready') setStatus('showing');
  }, []);

  /** 关闭规划视图：回到 ready（方案保留，可再次打开） */
  const close = useCallback(() => {
    if (statusRef.current === 'showing') setStatus('ready');
  }, []);

  return { status, plans, error, open, close };
}
