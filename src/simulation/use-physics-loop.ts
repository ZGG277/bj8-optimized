/*
[INPUT]: React 生命周期、激活标记、世界 ref、展示帧间隔与 onFrame/onSettled 回调
[OUTPUT]: 对外提供 usePhysicsLoop:rAF 驱动 240Hz fixed-step-runner，可无重启热更新快照帧率，停止时强制最终帧并恰好结算一次
[POS]: 模拟时钟的 React 装配层,只做事件桥接;步进策略归 fixed-step-runner,物理归 physics
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import { useEffect, useRef, type MutableRefObject } from 'react';
import { PHYSICS_DT, stepWorld, type BilliardsWorld } from '../physics';
import { createFixedStepRunner } from './fixed-step-runner';
import { createPresentationCadence } from './presentation-cadence';

type Options = {
  /** 仅 true 时运行循环(通常 match.phase === 'rolling') */
  active: boolean;
  worldRef: MutableRefObject<BilliardsWorld>;
  /** 每帧步进后调用:音效事件消费与快照同步;回调身份变化不会重启循环 */
  onFrame: () => void;
  /** 世界停止时调用,每段运动恰好一次 */
  onSettled: () => void;
  /** 0 表示每个有效 rAF 都发布；运行中可由温控档位热更新。 */
  presentationIntervalMs?: number;
};

export function usePhysicsLoop({
  active,
  worldRef,
  onFrame,
  onSettled,
  presentationIntervalMs = 0,
}: Options) {
  const onFrameRef = useRef(onFrame);
  const onSettledRef = useRef(onSettled);
  const presentationIntervalRef = useRef(presentationIntervalMs);
  useEffect(() => { onFrameRef.current = onFrame; });
  useEffect(() => { onSettledRef.current = onSettled; });
  useEffect(() => { presentationIntervalRef.current = presentationIntervalMs; }, [presentationIntervalMs]);

  useEffect(() => {
    if (!active) return;
    // 防御:激活时世界已静止,直接结算一次,不空转
    if (!worldRef.current.moving) {
      onSettledRef.current();
      return;
    }

    const runner = createFixedStepRunner({
      dt: PHYSICS_DT,
      step: (dt) => stepWorld(worldRef.current, dt),
      moving: () => worldRef.current.moving,
    });
    const cadence = createPresentationCadence(presentationIntervalMs);

    let raf = 0;
    const tick = (now: number) => {
      cadence.setIntervalMs(presentationIntervalRef.current);
      const result = runner.frame(now);
      if ((result.steps > 0 && cadence.shouldPublish(now)) || result.settled) {
        onFrameRef.current();
      }
      if (result.settled) {
        onSettledRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // 页面隐藏时 rAF 暂停;恢复时重置时钟锚点,不补算隐藏期间
    const onVisibility = () => runner.resetClock();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, worldRef]);
}
