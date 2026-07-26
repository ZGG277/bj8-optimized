# simulation/

> L2 | 父级: `../CLAUDE.md`

模拟时钟层：把真实帧时间收敛成严格的 240Hz 固定步进，帧率变化只改变每帧步数，绝不改变步长或丢弃时间。

## 成员清单

`fixed-step-runner.ts`: 纯调度器，真实 elapsed 进蓄水池，单帧最多 60 步（250ms),backlog 跨帧保留；resetClock 用于隐藏恢复不补算；settled 每段运动恰好报一次。

`fixed-step-runner.test.ts`: 帧率无关性（10/30/60 FPS 总步数一致）、backlog 保留（2 FPS 不丢时间）、resetClock 不补算、settled 恰好一次的单元测试。

`use-physics-loop.ts`: React 装配层，rAF 驱动 runner,visibilitychange 重置时钟；回调经 ref 桥接，身份变化不重启循环；激活时世界已静止则直接结算。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
