/*
[INPUT]: 小工具构建中的谢不赢战术 Worker 请求
[OUTPUT]: 与 Worker 消息接口兼容的主线程异步适配器
[POS]: 仅由 vite.minitool.config.ts 替换禁用的 Worker 模块；常规构建不引用
[PROTOCOL]: Worker 消息合同变化时同步更新 opponent/tactical-worker.ts
*/
import { tacticalShotSteps } from '../opponent/tactical-shot';
import { runSearchSteps } from './cooperative-search';
import type { TacticalWorkerRequest, TacticalWorkerResponse } from '../opponent/tactical-worker';

export default class MiniToolTacticalAdapter {
  onmessage: ((event: MessageEvent<TacticalWorkerResponse>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private cancelled = false;

  postMessage(request: TacticalWorkerRequest) {
    setTimeout(async () => {
      if (this.cancelled) return;
      try {
        const result = await runSearchSteps(tacticalShotSteps(request.world, request.legal, request.config), () => this.cancelled);
        if (result === undefined) return;
        const { shot } = result;
        this.onmessage?.({ data: { generation: request.generation, shot } } as MessageEvent<TacticalWorkerResponse>);
      } catch (error) {
        this.onmessage?.({
          data: { generation: request.generation, error: error instanceof Error ? error.message : String(error) },
        } as MessageEvent<TacticalWorkerResponse>);
      }
    }, 0);
  }

  terminate() {
    this.cancelled = true;
  }
}
