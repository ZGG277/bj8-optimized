/*
[INPUT]: 依赖 vitest、async 异步门面与可控 FakeWorker
[OUTPUT]: 新规划请求会终止旧 worker、旧 Promise 以 PlanCancelledError 结算、新请求可正常返回的回归断言
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

afterEach(() => {
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
});
