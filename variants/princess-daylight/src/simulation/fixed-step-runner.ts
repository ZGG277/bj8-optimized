/*
[INPUT]: 每帧真实时间戳(ms)、步进函数、世界运动状态探针
[OUTPUT]: 对外提供 createFixedStepRunner:固定步蓄水池调度,单帧最多 60 步,backlog 跨帧保留,settled 每段运动只报一次
[POS]: 模拟时钟纯调度层,不依赖 React、DOM 或渲染时钟;禁止丢弃未处理时间、禁止改变 dt
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/

/** 单帧物理步上限:60 × 1/240s = 250ms,4 FPS 以上仍能追上实时 */
export const MAX_STEPS_PER_FRAME = 60;

export type FrameResult = {
  /** 本帧实际执行的物理步数 */
  steps: number;
  /** 未处理完的蓄水池余量(秒),跨帧保留,绝不静默丢弃 */
  backlog: number;
  /** 本帧是否为"运动 → 停止"的迁移帧(每段运动恰好一次) */
  settled: boolean;
};

export type FixedStepRunner = {
  /** 喂入一帧真实时间戳;返回本帧执行结果 */
  frame: (now: number) => FrameResult;
  /** 页面隐藏/恢复时调用:丢弃时钟锚点,下一帧从零开始,不补算隐藏期间 */
  resetClock: () => void;
  /** 当前蓄水池余量(秒),测试与诊断用 */
  backlogSeconds: () => number;
};

type RunnerOptions = {
  /** 固定物理步长(秒),任何情况下不得随帧率改变 */
  dt: number;
  /** 单帧步数上限,默认 60 */
  maxStepsPerFrame?: number;
  /** 执行一步;由调用方保证 dt 原样传给物理内核 */
  step: (dt: number) => void;
  /** 世界是否仍在运动 */
  moving: () => boolean;
};

export function createFixedStepRunner({ dt, maxStepsPerFrame = MAX_STEPS_PER_FRAME, step, moving }: RunnerOptions): FixedStepRunner {
  let accumulator = 0;
  let lastTime: number | null = null;

  return {
    frame(now: number): FrameResult {
      // settled 判定基于"帧开始前是否在运动":运动→停止的迁移帧恰好报一次,
      // 静止帧重复喂入不会重报,重新运动后再次停止会再次报告
      const wasMoving = moving();
      if (lastTime === null) {
        // 首帧(或 resetClock 后的第一帧)不补算任何时间
        lastTime = now;
        return { steps: 0, backlog: accumulator, settled: false };
      }
      const elapsed = Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
      accumulator += elapsed;

      let steps = 0;
      while (accumulator >= dt && steps < maxStepsPerFrame && moving()) {
        step(dt);
        accumulator -= dt;
        steps++;
      }
      // 达到单帧上限时 backlog 自然留在 accumulator,下一帧继续追

      return { steps, backlog: accumulator, settled: wasMoving && !moving() };
    },
    resetClock() {
      lastTime = null;
    },
    backlogSeconds() {
      return accumulator;
    },
  };
}
