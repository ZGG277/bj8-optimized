/*
[INPUT]: 依赖 vitest、async 异步门面与可控 FakeWorker
[OUTPUT]: 覆盖新请求抢占、截止时间终止 worker、旧 Promise 结算与正常返回
[POS]: planner 异步边界测试；不执行真实 worker 或搜索
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../physics';

type WorkerMessage = { gen: number; world: unknown; legal: number[]; opts?: unknown };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  request: WorkerMessage | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerMessage) {
    this.request = request;
  }

  terminate() {
    this.terminated = true;
  }
}

class ThrowingWorker {
  constructor() {
    throw new Error('worker blocked');
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('./plan-worker?worker&inline');
  vi.resetModules();
  FakeWorker.instances = [];
});

describe('planPositionAsync 抢占与取消', () => {
  it('第二个请求取消并终止第一个，两个 Promise 都会结算', async () => {
    vi.doMock('./plan-worker?worker&inline', () => ({ default: FakeWorker }));
    const { PlanCancelledError, planPositionAsync } = await import('./async');
    const world = createInitialWorld();

    const first = planPositionAsync(world, [1]);
    const firstWorker = FakeWorker.instances[0];
    const second = planPositionAsync(world, [2]);
    const secondWorker = FakeWorker.instances[1];

    await expect(first).rejects.toBeInstanceOf(PlanCancelledError);
    expect(firstWorker.terminated).toBe(true);
    expect(secondWorker.terminated).toBe(false);

    secondWorker.onmessage?.({
      data: { gen: secondWorker.request!.gen, plans: [] },
    } as MessageEvent);
    await expect(second).resolves.toEqual([]);
  });

  it('超过墙钟截止时间后终止 worker，并以专用错误结算', async () => {
    vi.useFakeTimers();
    vi.doMock('./plan-worker?worker&inline', () => ({ default: FakeWorker }));
    const {
      PlanDeadlineExceededError,
      planPositionWithinDeadline,
    } = await import('./async');
    const world = createInitialWorld();

    const pending = planPositionWithinDeadline(world, [1], undefined, 2000);
    const activeWorker = FakeWorker.instances[0];
    const rejection = expect(pending).rejects.toBeInstanceOf(PlanDeadlineExceededError);

    await vi.advanceTimersByTimeAsync(2000);
    await rejection;
    expect(activeWorker.terminated).toBe(true);
  });

  it('限时规划在 worker 不可用时立即失败，不阻塞主线程', async () => {
    vi.doMock('./plan-worker?worker&inline', () => ({ default: ThrowingWorker }));
    const {
      PlanWorkerUnavailableError,
      planPositionWithinDeadline,
    } = await import('./async');

    await expect(
      planPositionWithinDeadline(createInitialWorld(), [1], undefined, 2000),
    ).rejects.toBeInstanceOf(PlanWorkerUnavailableError);
  });
});
