/*
[INPUT]: 主线程 postMessage 发来的 { world, legal, opts }（BilliardsWorld 为纯 JSON，可结构化克隆）
[OUTPUT]: 回传 { gen, plans } / { gen, error }；只跑 planPosition 纯计算，不碰 DOM/渲染
[POS]: 走位规划 Worker 入口——把 0.2–1s 的搜索移出主线程，避免阻塞 3D 渲染与输入
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import type { BilliardsWorld } from '../physics';
import { planPosition, type PlannerOptions } from './search';

export type PlanWorkerRequest = {
  gen: number;
  world: BilliardsWorld;
  legal: number[];
  opts?: PlannerOptions;
};

export type PlanWorkerResponse =
  | { gen: number; plans: ReturnType<typeof planPosition> }
  | { gen: number; error: string };

self.onmessage = (event: MessageEvent<PlanWorkerRequest>) => {
  const { gen, world, legal, opts } = event.data;
  try {
    // rng 不可结构化克隆（函数），worker 内用 Math.random；结果本身只是建议值，不要求可复现
    const plans = planPosition(world, legal, { ...opts, rng: undefined, onSimulate: undefined });
    const response: PlanWorkerResponse = { gen, plans };
    self.postMessage(response);
  } catch (err) {
    const response: PlanWorkerResponse = { gen, error: String(err) };
    self.postMessage(response);
  }
};
