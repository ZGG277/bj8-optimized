/*
[INPUT]: fixed-step-runner 与构造的假世界(计数器模拟运动步数)
[OUTPUT]: 对外验证固定步调度:多帧率步数一致、backlog 不丢失、resetClock 不补算、settled 每段运动恰好一次
[POS]: simulation 目录的单元测试层,只断言调度数值,不依赖真实物理或 DOM
[PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
*/
import { describe, expect, it } from 'vitest';
import { createFixedStepRunner, MAX_STEPS_PER_FRAME } from './fixed-step-runner';

const DT = 1 / 240;

/** 假世界:剩余 stepsLeft 步运动会,每 step 消耗一步 */
function fakeWorld(totalSteps: number) {
  const state = { stepsLeft: totalSteps, executed: 0 };
  return {
    state,
    step: () => { state.stepsLeft--; state.executed++; },
    moving: () => state.stepsLeft > 0,
  };
}

/** 以固定帧间隔喂帧(首帧为锚点帧,不计步数),返回每帧结果 */
function feedFrames(runner: ReturnType<typeof createFixedStepRunner>, startMs: number, intervalMs: number, frames: number) {
  const results = [runner.frame(startMs)]; // 锚点帧:只建立时钟,不补算
  for (let i = 1; i <= frames; i++) {
    results.push(runner.frame(startMs + intervalMs * i));
  }
  return results;
}

describe('固定步调度:帧率无关性', () => {
  it('同样 1 秒运动在 10/30/60 FPS 下总步数一致', () => {
    const oneSecondSteps = 240;
    const runs = [
      { interval: 1000 / 60, frames: 60 },
      { interval: 1000 / 30, frames: 30 },
      { interval: 100, frames: 10 },
    ];
    const executed: number[] = [];
    const backlogs: number[] = [];
    for (const r of runs) {
      const world = fakeWorld(oneSecondSteps);
      const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
      feedFrames(runner, 0, r.interval, r.frames);
      executed.push(world.state.executed);
      backlogs.push(runner.backlogSeconds());
    }
    // 三种帧率都完整跑完 240 步,一步不多一步不少
    expect(executed).toEqual([oneSecondSteps, oneSecondSteps, oneSecondSteps]);
    // 停止后剩余 backlog 都不足一步,且互相差不超过一步
    for (const b of backlogs) expect(b).toBeLessThan(DT);
  });

  it('10 FPS 单帧约 24 步,不超过单帧上限', () => {
    const world = fakeWorld(240);
    const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
    const results = feedFrames(runner, 0, 100, 3);
    expect(Math.max(...results.map(r => r.steps))).toBeLessThanOrEqual(25);
    expect(Math.max(...results.map(r => r.steps))).toBeGreaterThanOrEqual(23);
  });
});

describe('固定步调度:backlog 保留', () => {
  it('2 FPS 超上限时 backlog 跨帧保留,时间不被丢弃', () => {
    // 500ms/帧需要 120 步,上限 60 → 每帧留下约 250ms backlog
    const world = fakeWorld(1200); // 5 秒运动
    const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
    runner.frame(0); // 锚点帧
    const r1 = runner.frame(500);
    expect(r1.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(r1.backlog).toBeGreaterThan(0.2);
    // 已执行步数 + 剩余 backlog 换算步数 ≈ 已喂入时间总步数(允许多 1 步浮点误差)
    const fedSteps = Math.floor(0.5 / DT);
    expect(world.state.executed + Math.round(r1.backlog / DT)).toBeGreaterThanOrEqual(fedSteps - 1);
    // 持续喂帧,最终跑完全部 1200 步(慢动作但不丢时间)
    feedFrames(runner, 500, 500, 40);
    expect(world.state.executed).toBe(1200);
  });

  it('resetClock 后下一帧不补算隐藏期间', () => {
    const world = fakeWorld(2400);
    const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
    runner.frame(1000);
    runner.frame(1016.7);
    const before = world.state.executed;
    runner.resetClock(); // 页面从隐藏恢复
    const r = runner.frame(6016.7); // 5 秒后
    expect(r.steps).toBe(0); // 锚点重置,这帧只建立新锚点
    expect(world.state.executed).toBe(before);
    const r2 = runner.frame(6033.4);
    expect(r2.steps).toBeLessThanOrEqual(5); // 只算恢复后的 16.7ms
  });
});

describe('固定步调度:settled 恰好一次', () => {
  it('运动停止只报一次,继续喂帧不重复', () => {
    const world = fakeWorld(48); // 0.2 秒
    const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
    const results = feedFrames(runner, 0, 1000 / 60, 60);
    const settledFrames = results.filter(r => r.settled);
    expect(settledFrames.length).toBe(1);
  });

  it('世界重新运动后再次停止会再次报告', () => {
    const world = fakeWorld(24);
    const runner = createFixedStepRunner({ dt: DT, step: world.step, moving: world.moving });
    feedFrames(runner, 0, 1000 / 60, 20);
    expect(world.moving()).toBe(false);
    world.state.stepsLeft = 24; // 新的一杆
    const results = feedFrames(runner, 2000, 1000 / 60, 20);
    expect(results.filter(r => r.settled).length).toBe(1);
  });
});
