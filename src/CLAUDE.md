# src/

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`Game.tsx`: 对局编排器，统一以世界角提交/渲染杆向；规则在 `match/`、输入在 `input/`、精瞄几何在 `aim/`、控件在 `components/`、物理时钟在 `simulation/`、Pointer 交互在 `hooks/useAimInteraction`、AI 在 `hooks/useOpponentAI`、走位规划在 `hooks/usePositionPlan` + `components/PlanOverlay`、击球复盘在 `planner/review` + `components/ReviewOverlay`、音效在 `hooks/useAudioManager`、状态在 `hooks/useGameState`、文案在 `utils/renderMatchMessage`；DEV 调试句柄只为浏览器门禁提供摆球/同步/固定 match 阶段。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；含 20 用例规则矩阵测试。

`input/`: 出杆输入层，纯换算（行程归一、按住满力、击球点单位圆）+ React 协调器；rAF 只做预览，最终力度由松开时刻真实事实决定。

`aim/`: 纯精瞄几何层——世界角首碰检测、统一物理袋口、2R 走廊遮挡、含 throw 的袋口左右角尖反解；同时向无限拨轮提供不受呼出阈值限制的最近合法袋口解。

`components/`: HUD 控制组件（桌面/竖屏可停任意高度的长行程视角推杆、球桌内无限横向拨轮、可展开击球点、力度出杆合一控件、单行球组状态、可拖动规划/复盘浮层、球桌视口与开始界面），只转发事件，不持有对局状态；产品/回合/杆数顶栏已移除。

`styles/`: 样式体系 base → layout → controls；横屏尺寸令牌统一重定义，控件层级高于球桌、低于遮罩。

`simulation/`: 固定步调度器与 React 物理循环桥；蓄水池累积帧时长、单帧步数封顶、backlog 保留不丢弃，标签页恢复时重置时钟不补算，静止迁移恰好结算一次。

`camera-view.ts`: 连续视角纯几何，统一钳制 `viewLevel`、端点/中间高度文案，以及从母球后第一人称到球台中心俯视的位姿插值；所有高度都随唯一世界杆向环绕。

`camera-view.test.ts`: 连续高度不吸附、相机高度单调、各高度 180° 环绕与俯视端方位变化回归。

`Scene3D.ts`: Three.js 场景适配器，连续视角共享唯一世界杆向，低位保持杆/视线/球路共线，高位把环绕轴心平滑移到球台中心；活相机与屏幕拾取虚拟相机共享 `camera-view` 位姿；瞄准辅助共享 physics 恢复/throw 预测并按障碍/库边裁剪；摆球阶段隐藏实体母球、只显示跟手半透明预览，落实后恢复实体；另负责合法目标环、球杆、走位/复盘与 rAF 相机平滑。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，公开统一 `TABLE/POCKETS` 与共享球碰走向预测；视觉袋口与二维球心捕获半径分开调校，中袋捕获从旧版 62mm 收到 52mm，高速落袋走线段扫掠防穿透；输出首碰、碰库与落袋事件。球球碰撞按 TOI 回滚，叉路接触三联立；碰撞迭代直接消费 resolveBallPair 的布尔事实，不再只观察 x 位移，纯 z 逆序链也会在同一固定步继续传播。

`physics/`: 可复用纯碰撞模型子模块；恢复/throw 参数与方向预测由 physics 步进、aim 和 Scene3D 共享。

`physics.test.ts`: 物理内核单元测试与手感指标，覆盖共享碰撞预测、纯 z 逆序三球链等回归。

`planner/`: 走位规划引擎（纯 TS，不碰 React/渲染）——几何候选 → erf 粗筛 → 蒙特卡洛精排 → 3 层精确终态前瞻，输出连续 1–3 杆方案；标定后重算概率、清组后转 8 号、仿真预算封顶、rng 注入可测。

`spin-settle.test.ts`: 加塞停球收敛回归：满塞后原地残余侧旋须在数秒内归零（防 world.moving 仅靠 wy 长期不结束）。

`break-variance.test.ts`: 开球方差回归：验证无 rng 时同力度开球结果确定，传 rng 时同力度连续开球的落袋组合与球堆分布出现差异。

`break-spread.test.ts`: 开球散开回归：瞄顶球满力开球后，固定位移/spread/峰值速度分布阈值断言（固定摆法位移 ≥12/15、spread ×5 以上；8 种子单种子位移 ≥8、均值 ≥10），锁定叉路联立修复成果，防索引序动量漏斗回潮；含能量守恒护栏（任何球峰值 <9.4 m/s）与永动检查。

`audio.ts`: 基于 Web Audio 的无外部资源击球、碰撞、碰库与落袋合成音效。

`hooks/`: React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分：
  - `useGameState`：集中管理对局状态（worldView/match/viewLevel）与编排动作；新局重置 shot 结算守卫
  - `useAimInteraction`：封装跟手虚母球落位、世界角点哪打哪、抓影子球、360° 粗瞄，以及落位即呼出的无边界变速拨轮
  - `useControlSlotDrag`：编辑态下封装右侧四个控件各自的轨内纵向拖动、黑条约束与位置持久化
  - `useOpponentAI`：AI 对手回合调度，依赖 physics 击球与 match 规则状态机
  - `useAudioManager`：音效初始化和物理事件播放，暴露 audioRef/playStrike/playPhysicsEvents/resetEvents
  - `usePositionPlan`：走位规划预算状态机（idle→computing→ready→showing/failed），玩家回合世界指纹变化时经可抢占 planner/async 后台搜索
  - `useDraggableOverlay`：规划/复盘共用的 Pointer 拖拽位移与视口边界约束

`utils/`: 纯工具函数层，不依赖 React 或 DOM：
  - `renderMatchMessage`：将规则层消息键+参数映射为中文文案，纯函数可测试

`textures.ts`: 为台呢、木纹、皮革与球体生成 CanvasTexture，供 Scene3D 初始化使用。

`main.tsx`: React 应用挂载入口，启用 StrictMode 并按 base → layout → controls 顺序加载样式。

`vite-env.d.ts`: Vite 客户端类型声明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
