# hooks/

> L2 | 父级: `../CLAUDE.md`

React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分。

## 成员清单

`useGameState.ts`: 状态管理收敛层，集中管理 worldView/match/viewLevel 与双方档案；局内只在 ref 收集玩家出杆事实，胜负确定后一次消费、更新可见水平、生成单点训练总结并持久化，重开局清空临时样本与上一局总结。

`useAimAssist.ts`: 预测辅助线偏好 Hook；首次/损坏/受限存储默认开启，安全读写 `guagua-billiards:aim-assist:v1`，尊重用户显式关闭，不控制幽灵球和合法目标环。

`useAimAssist.test.ts`: 默认开启、true/false 读取、损坏/受限存储安全回退回归。

`shot-settlement-guard.ts`: 同杆去重与新局 reset 的纯幂等原语。

`shot-settlement-guard.test.ts`: 同局重复 shotId 拒绝、跨局相同 shotId 可重新接收的回归。

`useAimInteraction.ts`: 交互协调层，封装开球实体母球合法点按/按住拖放、自由球虚影落位、合法区域约束、点哪打哪、抓影子球、360° 粗瞄与默认拨轮/可选方向键微调；屏幕反算消费当前视觉相机。只有幽灵球有效落点的指针抬起才报告自动瞄准切镜，摆白球/取消不触发；微调与切档返回实际成功事实。切到方向键或离开瞄准态时退出拨轮精瞄档。

`useAimInteraction.test.tsx`: 幽灵球点击/拖放只在抬手后确认，取消、桌外点、白球重新落位不误触发相机的回归。

`useOpponentAI.ts`: AI 调度层，match.phase === 'opponent' 时消费本局锁定档案；500ms 自然停顿后调用专用战术 Worker，陪练/挑战分别以 750/1200ms 截止，超时回退轻量选杆；已验证杆的执行误差按模式压在当前杆向安全窗内。

`useAudioManager.ts`: 音效协调层，管理 BilliardsAudio 初始化、球碰/碰库/落袋物理事件与胜局彩炮播放，暴露 audioRef/playStrike/playPhysicsEvents/playVictory/resetEvents。

`usePositionPlan.ts`: 走位规划集成层——状态机 idle→computing→ready→showing（failed 兜底）；仅在灯泡显式点亮且进入玩家静止瞄准态时经可抢占 Worker 执行 320 次、两层、2.5 秒截止搜索，熄灭、出杆或对手回合取消陈旧结果，showing 期间不重算；暴露 status/plans/error/open/close。

`usePositionPlan.test.ts`: 世界指纹必须包含玩家分组，并锁定灯泡熄灭/非玩家瞄准态不计算以及规划预算/墙钟上限。

`useDraggableOverlay.ts`: 规划/复盘浮层共用 Pointer 拖拽 Hook；用独立手柄捕获指针，位移钳制在当前视口 8px 安全边界内。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
