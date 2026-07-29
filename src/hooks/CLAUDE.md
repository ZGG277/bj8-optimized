# hooks/

> L2 | 父级: `../CLAUDE.md`

React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分。

## 成员清单

`useGameState.ts`: 状态管理收敛层，集中管理 worldView/match/viewLevel、持久化玩家能力与局间锁定对手档案，提供 resetGame/settleShotRaw/recordPlayerShot/setMessage 等编排动作；新局同步重置 shot 结算守卫。

`shot-settlement-guard.ts`: 同杆去重与新局 reset 的纯幂等原语。

`shot-settlement-guard.test.ts`: 同局重复 shotId 拒绝、跨局相同 shotId 可重新接收的回归。

`useAimInteraction.ts`: 交互协调层，封装开球/自由球阶段跟手虚母球、Pointer 落位、各视角高度统一的世界角点哪打哪、抓影子球与 360° 粗瞄；目标相机拾取不受活相机平滑滞后影响，母球或幽灵球落位后立即呼出无限拨轮，最近袋口锁定和连续变速分别委托 `aim/` 与 `input/aim-dial`。

`useControlSlotDrag.ts`: 右侧单个控件槽位的编辑态拖动几何；由 ControlDeck 统一进入编辑后即时纵向移动，独立约束在黑色控制轨内并按控件键持久化位置。

`useOpponentAI.ts`: AI 调度层，副作用 Hook——match.phase === 'opponent' 时按局前锁定档案调度搜索深度、选杆扰动、执行误差、击球与出杆动画，不关心 UI 交互或玩家输入。

`useAudioManager.ts`: 音效协调层，管理 BilliardsAudio 初始化和物理事件音效播放，暴露 audioRef/playStrike/playPhysicsEvents/resetEvents。

`usePositionPlan.ts`: 走位规划集成层——状态机 idle→computing→ready→showing（failed 兜底）；进入玩家瞄准回合且世界指纹（active 球号+坐标）变化时自动经 planner/async 后台预算，出杆/对手回合丢弃陈旧结果，showing 期间不重算；暴露 status/plans/error/open/close。

`usePositionPlan.test.ts`: 世界指纹必须包含玩家分组的竞态回归。

`useDraggableOverlay.ts`: 规划/复盘浮层共用 Pointer 拖拽 Hook；用独立手柄捕获指针，位移钳制在当前视口 8px 安全边界内。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
