/*
[INPUT]: 小工具构建中的走位 Worker 请求
[OUTPUT]: 与 Worker 消息接口兼容的主线程异步适配器
[POS]: 仅由 vite.minitool.config.ts 替换禁用的 Worker 模块；常规构建不引用
[PROTOCOL]: Worker 消息合同变化时同步更新 planner/plan-worker.ts
*/
import { planPositionSteps } from '../planner/search';
import { runSearchSteps } from './cooperative-search';
import type { PlanWorkerRequest, PlanWorkerResponse } from '../planner/plan-worker';

export default class MiniToolPlanAdapter {
  onmessage: ((event: MessageEvent<PlanWorkerResponse>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private cancelled = false;

  postMessage(request: PlanWorkerRequest) {
    setTimeout(async () => {
      if (this.cancelled) return;
      try {
        const plans = await runSearchSteps(planPositionSteps(request.world, request.legal, request.opts), () => this.cancelled);
        if (plans === undefined) return;
        this.onmessage?.({ data: { gen: request.gen, plans } } as MessageEvent<PlanWorkerResponse>);
      } catch (error) {
        this.onmessage?.({
          data: { gen: request.gen, error: error instanceof Error ? error.message : String(error) },
        } as MessageEvent<PlanWorkerResponse>);
      }
    }, 0);
  }

  terminate() {
    this.cancelled = true;
  }
}
