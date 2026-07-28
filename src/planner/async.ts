/*
[INPUT]: 主线程的 BilliardsWorld 快照与合法目标球；plan-worker.ts（Vite module worker）
[OUTPUT]: planPositionAsync 可取消异步走位搜索（Promise<PositionPlan[]>），新请求抢占旧 worker，失败降级主线程
[POS]: 规划层的异步门面——UI 只依赖本文件，不关心计算跑在 worker 还是主线程；不允许悬挂 Promise
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import { planPosition, type PlannerOptions, type PositionPlan } from './search';
import type { PlanWorkerRequest, PlanWorkerResponse } from './plan-worker';

let worker: Worker | null | undefined; // undefined=未尝试，null=创建失败（降级主线程）
let generation = 0;
let pendingResolve: ((plans: PositionPlan[]) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

export class PlanCancelledError extends Error {
  constructor() {
    super('plan request cancelled');
    this.name = 'PlanCancelledError';
  }
}

function cancelWorkerRequest() {
  generation += 1;
  const reject = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  reject?.(new PlanCancelledError());
  if (worker) {
    worker.terminate();
    worker = undefined;
  }
}

function ensureWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./plan-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<PlanWorkerResponse>) => {
      const data = event.data;
      // generation 令牌：新请求已发出时旧结果直接丢弃
      if (data.gen !== generation) return;
      const resolve = pendingResolve;
      const reject = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      if ('error' in data) reject?.(new Error(data.error));
      else resolve?.(data.plans);
    };
    worker.onerror = () => {
      // worker 运行期失败：本轮 reject，后续请求降级主线程
      const reject = pendingReject;
      pendingResolve = null;
      pendingReject = null;
      reject?.(new Error('plan worker failed'));
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * 异步走位搜索。新请求会 reject 并终止旧 worker，再创建新 worker 执行，
 * 避免单 worker 队头阻塞，也保证任何返回给调用方的 Promise 最终都会结算。
 * opts 中的 rng/onSimulate 不可结构化克隆，跨 worker 时自动剥离。
 */
export function planPositionAsync(
  world: BilliardsWorld,
  legal: number[],
  opts?: PlannerOptions,
): Promise<PositionPlan[]> {
  if (pendingResolve || pendingReject) cancelWorkerRequest();
  generation += 1;
  const gen = generation;

  const w = ensureWorker();
  if (!w) {
    // 降级：主线程直接算（包 Promise；堵塞约 0.2–1s，仅 worker 不可用时发生）
    return new Promise((resolve, reject) => {
      try {
        resolve(planPosition(world, legal, opts));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  const cleanOpts: PlannerOptions | undefined = opts
    ? { sigma: opts.sigma, samples: opts.samples, maxDepth: opts.maxDepth, simBudget: opts.simBudget }
    : undefined;

  return new Promise<PositionPlan[]>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    const request: PlanWorkerRequest = { gen, world, legal, opts: cleanOpts };
    w.postMessage(request);
  });
}

/** 取消挂起请求：reject 当前 Promise 并终止 worker，后续调用按需创建新实例。 */
export function cancelPendingPlan() {
  cancelWorkerRequest();
}
