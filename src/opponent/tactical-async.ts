/*
[INPUT]: 主线程的世界快照、合法球、战术预算与墙钟截止时间
[OUTPUT]: 可取消、有截止时间的顾燃战术选杆 Promise；不在主线程降级重算
[POS]: 对手 AI 异步边界，与高预算玩家规划彻底隔离
[PROTOCOL]: Worker 生命周期或截止语义变化时同步更新 tactical-async.test.ts 与 opponent/CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import type { ShotCandidate } from '../planner/candidates';
import InlineTacticalWorker from './tactical-worker?worker&inline';
import type { TacticalSearchConfig } from './tactical-shot';
import type { TacticalWorkerRequest, TacticalWorkerResponse } from './tactical-worker';

let generation = 0;
let activeCancel: (() => void) | null = null;

export class TacticalDeadlineExceededError extends Error {
  constructor() {
    super('tactical shot request exceeded deadline');
    this.name = 'TacticalDeadlineExceededError';
  }
}

export function chooseTacticalShotWithinDeadline(
  world: BilliardsWorld,
  legal: number[],
  config: TacticalSearchConfig,
  deadlineMs: number,
): Promise<ShotCandidate | null> {
  activeCancel?.();
  generation += 1;
  const requestGeneration = generation;

  return new Promise((resolve, reject) => {
    let settled = false;
    let requestWorker: Worker | null = null;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (activeCancel === cancelRequest) activeCancel = null;
      requestWorker?.terminate();
      requestWorker = null;
      callback();
    };
    const cancelRequest = () => {
      generation += 1;
      finish(() => reject(new Error('tactical shot request cancelled')));
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new TacticalDeadlineExceededError()));
    }, Math.max(0, deadlineMs));
    activeCancel = cancelRequest;

    try {
      requestWorker = new InlineTacticalWorker();
      requestWorker.onmessage = (event: MessageEvent<TacticalWorkerResponse>) => {
        const data = event.data;
        if (data.generation !== requestGeneration) return;
        if ('error' in data) finish(() => reject(new Error(data.error)));
        else finish(() => resolve(data.shot));
      };
      requestWorker.onerror = () => finish(() => reject(new Error('tactical worker failed')));
      const request: TacticalWorkerRequest = {
        generation: requestGeneration,
        world,
        legal,
        config,
      };
      requestWorker.postMessage(request);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

export function cancelPendingTacticalShot() {
  activeCancel?.();
}
