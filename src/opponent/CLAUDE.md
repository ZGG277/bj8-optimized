# opponent/

> L3 | 父级: `../CLAUDE.md`

## 成员清单

`model.ts`: 自适应对手纯领域模型——所有真实玩家出杆只在整局结束时一次结算，明确袋口意图才更新执行精度；把画像映射为陪练 +3 / 挑战 +10 目标和 12/24 次硬仿真战术预算；挑战模式收紧杆向/力度误差并不随机舍弃最优路线；含 v1/v2→v3 安全迁移。

`tactical-shot.ts` / `tactical-worker.ts` / `tactical-async.ts`: 顾燃专用限预算选杆链。先均匀验证前 N 条路线的中/低/高杆，再在剩余预算内小角度标定；只返回真实进目标球、首碰合法且母球不洗袋的杆，战术分数叠加终局的下一杆可打性；Worker 超时直接终止，禁止主线程重算。

`model.test.ts` / `tactical-shot.test.ts` / `tactical-async.test.ts`: 覆盖整局一次提交、辅助降权、0–100 边界、+3/+10、确定性进球避洗袋、Worker 抢占/超时与 v1/v2 迁移。

[PROTOCOL]: 变更成员时更新本文件，然后检查 `../CLAUDE.md`
