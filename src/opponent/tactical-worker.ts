/*
[INPUT]: 主线程发来的世界快照、合法球与战术预算
[OUTPUT]: 回传已仿真验证的单杆候选或错误
[POS]: 顾燃战术选杆 Worker 入口，与玩家走位规划 Worker 隔离
[PROTOCOL]: 消息字段变化时同步更新 tactical-async.ts
*/
import type { BilliardsWorld } from '../physics';
import {
  chooseTacticalShot,
  type TacticalSearchConfig,
} from './tactical-shot';

export type TacticalWorkerRequest = {
  generation: number;
  world: BilliardsWorld;
  legal: number[];
  config: TacticalSearchConfig;
};

export type TacticalWorkerResponse =
  | { generation: number; shot: ReturnType<typeof chooseTacticalShot>['shot'] }
  | { generation: number; error: string };

self.onmessage = (event: MessageEvent<TacticalWorkerRequest>) => {
  const { generation, world, legal, config } = event.data;
  try {
    const { shot } = chooseTacticalShot(world, legal, config);
    const response: TacticalWorkerResponse = { generation, shot };
    self.postMessage(response);
  } catch (error) {
    const response: TacticalWorkerResponse = { generation, error: String(error) };
    self.postMessage(response);
  }
};

