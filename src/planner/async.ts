/*
[INPUT]: 主线程的 BilliardsWorld 快照与合法目标球；plan-worker.ts（Vite 内联 module worker）
[OUTPUT]: planPositionAsync / planPositionWithinDeadline 可取消异步走位搜索，新请求抢占旧 worker，失败降级主线程
[POS]: 规划层的异步门面——Worker 以 Blob 随主包发布，UI 不关心计算跑在 worker 还是主线程；不允许悬挂 Promise
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import { planPosition, type PlannerOptions, type PositionPlan } from './search';
import type { PlanWorkerRequest, PlanWorkerResponse } from './plan-worker';
import InlinePlanWorker from './plan-worker?worker&inline';

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

export class PlanDeadlineExceededError extends Error {
  constructor() {
    super('plan request exceeded deadline');
    this.name = 'PlanDeadlineExceededError';
  }
}

export class PlanWorkerUnavailableError extends Error {
  constructor() {
    super('plan worker unavailable');
    this.name = 'PlanWorkerUnavailableError';
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
    worker = new InlinePlanWorker();
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
  allowMainThreadFallback = true,
): Promise<PositionPlan[]> {
  if (pendingResolve || pendingReject) cancelWorkerRequest();
  generation += 1;
  const gen = generation;

  const w = ensureWorker();
  if (!w) {
    if (!allowMainThreadFallback) {
      return Promise.reject(new PlanWorkerUnavailableError());
    }
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

/**
 * 带墙钟上限的规划请求。超时会终止 worker，并以专用错误结算；
 * 调用方可立即切到轻量选杆，避免设备性能差异把等待时间无限放大。
 */
export function planPositionWithinDeadline(
  world: BilliardsWorld,
  legal: number[],
  opts: PlannerOptions | undefined,
  deadlineMs: number,
): Promise<PositionPlan[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cancelWorkerRequest();
      reject(new PlanDeadlineExceededError());
    }, Math.max(0, deadlineMs));

    // 限时交互不能在主线程同步搜索：同步任务会阻塞定时器，无法兑现墙钟上限。
    planPositionAsync(world, legal, opts, false).then(
      (plans) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(plans);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** 取消挂起请求：reject 当前 Promise 并终止 worker，后续调用按需创建新实例。 */
export function cancelPendingPlan() {
  cancelWorkerRequest();
}
