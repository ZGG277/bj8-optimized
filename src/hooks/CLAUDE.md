# hooks/

> L2 | 父级: `../CLAUDE.md`

React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分。

## 成员清单

`useGameState.ts`: 状态管理收敛层，只管理 worldView/match 与双方档案，不再夹带相机副作用；局内在 ref 收集玩家出杆事实，胜负确定后一次消费、更新可见水平并持久化。

`useCameraController.ts`: `camera-state` 的 React 适配器；以 reducer 暴露模式/高度/方位与母球放置、点台或幽灵球有效落位进入第一人称动作，指针类型决定瞄准解锁延迟，出杆触球后持有冻结锚点 300ms 再进入结果全景，卸载/reset 统一清理计时器。

`useSceneBridge.ts`: React↔Scene3D 唯一桥接层；管理 WebGL 生命周期与 DEV 句柄，将世界、瞄准、辅助可见性和相机拆成四条独立 effect，防止纯相机交互重放球杆/阴影工作。

`useAimAssist.ts`: 预测辅助线偏好 Hook；首次/损坏存储默认开启，只有显式 `false` 关闭，安全读写 `guagua-billiards:aim-assist:v1`，不控制幽灵球和合法目标环。

`useAimAssist.test.ts`: 默认开启、显式 false 保留、true 读取与损坏/受限存储安全回退回归。

`shot-settlement-guard.ts`: 同杆去重与新局 reset 的纯幂等原语。

`shot-settlement-guard.test.ts`: 同局重复 shotId 拒绝、跨局相同 shotId 可重新接收的回归。

`useAimInteraction.ts`: 交互协调层，封装跟手虚母球、Pointer 落位、点哪打哪、抓影子球、360° 粗瞄与默认精瞄拨轮；严格由一个 active pointer 持有会话，有效 aim/ghost 抬指才发出落位事实，line/副指针/cancel 不触发相机；所有屏幕→台面反算消费手势期冻结的 Scene3D 活相机，模式/回合迁移通过原子取消口防止旧交互复活。

`useAimInteraction.test.ts`: 默认精瞄值、aim/ghost 有效落位通知与 line/取消/副指针不误切相机的语义回归。

`useOpponentAI.ts`: AI 调度层，match.phase === 'opponent' 时消费本局锁定档案；500ms 自然停顿后调用专用战术 Worker，陪练/挑战分别以 750/1200ms 截止，超时回退轻量选杆；已验证杆的执行误差按模式压在当前杆向安全窗内。

`useAudioManager.ts`: 音效协调层，管理 BilliardsAudio 初始化和物理事件音效播放，暴露 audioRef/playStrike/playPhysicsEvents/resetEvents。

`usePositionPlan.ts`: 走位规划集成层——状态机 idle→computing→ready→showing（failed 兜底）；仅在“走位与击球复盘”开关显式开启且进入玩家静止瞄准态时经可抢占 Worker 执行 320 次、两层、2.5 秒截止搜索，关闭开关、出杆或对手回合取消陈旧结果，showing 期间不重算；暴露 status/plans/error/open/close。

`usePositionPlan.test.ts`: 世界指纹必须包含玩家分组，并锁定走位/复盘开关关闭或非玩家瞄准态时不计算，以及规划预算/墙钟上限。

`useDraggableOverlay.ts`: 规划/复盘浮层共用 Pointer 拖拽 Hook；用独立手柄捕获指针，位移钳制在当前视口 8px 安全边界内。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
