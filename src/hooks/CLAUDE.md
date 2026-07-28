# hooks/

> L2 | 父级: `../CLAUDE.md`

React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分。

## 成员清单

`useGameState.ts`: 状态管理收敛层，集中管理 Game 组件的所有状态（worldView/match/viewMode/camLift）与 ref（worldRef/matchRef），提供 resetGame/settleShotRaw/setMessage 等编排动作；新局同步重置 shot 结算守卫。

`shot-settlement-guard.ts`: 同杆去重与新局 reset 的纯幂等原语。

`shot-settlement-guard.test.ts`: 同局重复 shotId 拒绝、跨局相同 shotId 可重新接收的回归。

`useAimInteraction.ts`: 交互协调层，封装世界角点哪打哪、抓影子球、360° 粗瞄与近袋局部精瞄、Pointer 事件及自由球放置；精瞄几何委托 `aim/`。

`useOpponentAI.ts`: AI 调度层，副作用 Hook——match.phase === 'opponent' 时自动调度 AI 回合（决策、击球、出杆动画），不关心 UI 交互或玩家输入。

`useAudioManager.ts`: 音效协调层，管理 BilliardsAudio 初始化和物理事件音效播放，暴露 audioRef/playStrike/playPhysicsEvents/resetEvents。

`usePositionPlan.ts`: 走位规划集成层——状态机 idle→computing→ready→showing（failed 兜底）；进入玩家瞄准回合且世界指纹（active 球号+坐标）变化时自动经 planner/async 后台预算，出杆/对手回合丢弃陈旧结果，showing 期间不重算；暴露 status/plans/error/open/close。

`usePositionPlan.test.ts`: 世界指纹必须包含玩家分组的竞态回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
