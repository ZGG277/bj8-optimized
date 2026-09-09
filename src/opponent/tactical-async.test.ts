/*
[INPUT]: vitest、tactical-async 与可控 FakeWorker
[OUTPUT]: 覆盖新请求抢占、旧定时器不误杀新 Worker、截止时间终止计算
[POS]: 顾燃战术 Worker 异步边界回归测试
[PROTOCOL]: 生命周期语义变化时同步更新 tactical-async.ts 与本文件
*/
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../physics';

type Request = { generation: number };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  request: Request | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: Request) {
    this.request = request;
  }

  terminate() {
    this.terminated = true;
  }
}

const config = {
  allowSafety: true,
  candidateLimit: 3,
  simulationLimit: 9,
  followUpWeight: 0.3,
  alternativeChance: 0,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock('./tactical-worker?worker&inline');
  vi.resetModules();
  FakeWorker.instances = [];
});

describe('tactical async lifecycle', () => {
  it('抢占旧请求会清掉旧截止计时，不误杀新 Worker', async () => {
    vi.useFakeTimers();
    vi.doMock('./tactical-worker?worker&inline', () => ({ default: FakeWorker }));
    const { chooseTacticalShotWithinDeadline } = await import('./tactical-async');
    const world = createInitialWorld();

    const first = chooseTacticalShotWithinDeadline(world, [1], config, 100);
    const firstRejection = expect(first).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(50);
    const second = chooseTacticalShotWithinDeadline(world, [1], config, 1000);
    await firstRejection;
    const secondWorker = FakeWorker.instances[1];
    await vi.advanceTimersByTimeAsync(100);
    expect(secondWorker.terminated).toBe(false);
    secondWorker.onmessage?.({
      data: { generation: secondWorker.request!.generation, shot: null },
    } as MessageEvent);
    await expect(second).resolves.toBeNull();
  });

  it('超时会终止 Worker 并返回专用错误', async () => {
    vi.useFakeTimers();
    vi.doMock('./tactical-worker?worker&inline', () => ({ default: FakeWorker }));
    const {
      TacticalDeadlineExceededError,
      chooseTacticalShotWithinDeadline,
    } = await import('./tactical-async');
    const pending = chooseTacticalShotWithinDeadline(
      createInitialWorld(),
      [1],
      config,
      200,
    );
    const worker = FakeWorker.instances[0];
    const rejection = expect(pending).rejects.toBeInstanceOf(TacticalDeadlineExceededError);
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(worker.terminated).toBe(true);
  });
});
