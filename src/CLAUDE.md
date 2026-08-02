# src/

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`Game.tsx`: 对局编排器，统一以世界角提交/渲染杆向；零出杆新用户按真实操作推进首局提示；走位 Worker 只在用户点亮灯泡后启动；手机运动中保持 240Hz 物理并以 60Hz 发布 React/WebGL 快照；规则在 `match/`、输入在 `input/`、AI 在 `hooks/useOpponentAI`、走位在 `hooks/usePositionPlan`、物理时钟在 `simulation/`，DEV 调试句柄只用于浏览器门禁。

`first-match-guide.ts`: 首局引导纯产品状态机；只有零出杆记录且无完成标记的新用户启用，以放球、拖动结束角度变化、拨轮有效角度变化和成功出杆约束核心节奏，视角/杆法/布局是可跳过的非阻塞发现，容错读写 `guagua-billiards:first-match-guide:v1`，不依赖 React/DOM 或规则实现。

`first-match-guide.test.ts`: 首次/完成存储、受限存储降级、误触与环绕角阈值、真实事件推进、越级防护、可选发现及快速出杆收敛回归。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；含 20 用例规则矩阵测试。

`opponent/`: 玩家长期能力画像与陪练/挑战模式领域层；出杆在整局结束时一次评估，技术分只由准度 72% 与走位 28% 组成；生成 +3/+10 目标与独立限预算战术 Worker，挑战档优先真实进球、避免洗袋并保留下一杆。

`layout/`: 五控件布局纯领域层；维护 desktop/portrait/landscape 三套自由或右/底停靠位置，负责 8px 钳制、48px 吸附、沿边落点、碰撞避让、容量与 v2→v3 迁移。

`input/`: 出杆与拨轮输入层，纯换算（行程归一、按住满力、击球点单位圆、用户显式粗/精双档、可靠 Pointer 压力→拨轮紧度）+ React 协调器；rAF 只做预览，最终力度由松开时刻真实事实决定。

`aim/`: 纯袋口瞄准几何层——世界角首碰检测、统一物理袋口、2R 走廊遮挡、含 throw 的袋口左右角尖反解；供规划、调试与可选辅助消费，不参与玩家拨轮的粗/精切档。

`components/`: HUD 控制组件（双方动态水平、首局控件邻近提示、灯泡图形面板、无文字视角/击球点/蓄力/横竖拨轮、五控件自由拖放与双边停靠、规划/复盘浮层、主题切换器、球桌视口与开始界面），只转发事件，不持有对局规则。

`styles/`: 样式体系 base → layout → controls → themes；主题入口统一让控件静置 56% 内容透明、按住/聚焦/拖动恢复实色并去掉卡片式外框，不改触控几何；横屏尺寸令牌统一重定义，控件层级高于球桌、低于遮罩。

`simulation/`: 固定步调度器与 React 物理循环桥；蓄水池累积帧时长、单帧步数封顶、backlog 保留不丢弃，标签页恢复时重置时钟不补算，静止迁移恰好结算一次。

`camera-view.ts`: 连续视角纯几何，统一钳制 `viewLevel`、瞄准/手动环绕交互路由、全局视角阈值、端点/中间高度文案、独立视觉方位角与环绕手势换算；高位按视口宽高比适配全台，观战交棒或玩家主动进入全局高度后冻结球台视觉方位，并在用户拉向第一人称时沿最短圆弧回接杆向。

`camera-view.test.ts`: 连续高度不吸附、相机高度单调、手动相机交互路由、全局视角阈值、视觉方位独立、自由相机回接、各高度 180° 环绕与 390×844 竖屏全台安全边界回归。

`Scene3D.ts`: Three.js 场景适配器；移动端消费 `render-policy` 的 1.5×/1024/low-power 预算，阴影仅动态刷新，球桌静止且相机/动画收敛后停止 rAF；消费统一 PocketGeometry 生成台内凹口、皮圈、网袋与暗底，球杆瞄准角和纯视觉相机方位分离；另负责预测辅助、摆球、合法目标环、球杆、走位/复盘与按需相机平滑。

`render-policy.ts`: 不依赖 Three.js 的纯渲染预算；以粗指针或视口短边识别手机，输出像素比、阴影贴图和 GPU 功耗偏好。

`render-policy.test.ts`: 390×844、844×390 手机与 1280×800 桌面的渲染预算回归。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，公开统一 `TABLE/POCKETS/CUSHION_SEGMENTS` 与共享球碰走向预测；球心对直库/圆弧角衬做连续扫掠，一固定步最多三次边界接触，解析求交越过 8/7mm 台内半椭圆捕获弧即发出含入袋位置/速度的事件。球球碰撞按 TOI 回滚，叉路接触三联立。

`physics/`: 可复用纯碰撞与袋口几何子模块；角袋 100mm/中袋 102mm 的六袋参数、8/7mm 台内捕获弧、恢复/throw 参数、直线/圆弧库边段、台阶及安全瞄准窗口由 physics、aim、planner 和 Scene3D 共享。

`physics.test.ts`: 物理内核单元测试与手感指标，覆盖共享碰撞预测、纯 z 逆序三球链、台内圆弧捕获参数与落袋事件等回归；六袋专项矩阵位于 `physics/table-geometry.test.ts`。

`planner/`: 走位规划引擎（纯 TS，不碰 React/渲染）——几何候选 → erf 粗筛 → 蒙特卡洛精排 → 3 层精确终态前瞻，输出连续 1–3 杆方案；标定后重算概率、清组后转 8 号、仿真预算封顶、rng 注入可测。

`spin-settle.test.ts`: 加塞停球收敛回归：满塞后原地残余侧旋须在数秒内归零（防 world.moving 仅靠 wy 长期不结束）。

`break-variance.test.ts`: 开球方差回归：验证无 rng 时同力度开球结果确定，传 rng 时同力度连续开球的落袋组合与球堆分布出现差异。

`break-spread.test.ts`: 开球散开回归：瞄顶球满力开球后，固定位移/spread/峰值速度分布阈值断言（固定摆法位移 ≥12/15、spread ×5 以上；8 种子单种子位移 ≥8、均值 ≥10），锁定叉路联立修复成果，防索引序动量漏斗回潮；含能量守恒护栏（任何球峰值 <9.4 m/s）与永动检查。

`audio.ts`: 基于 Web Audio 的无外部资源击球、碰撞、碰库与落袋合成音效。

`hooks/`: React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分：
  - `useGameState`：集中管理对局状态、局内锁定双方档案与整局一次评估；新局重置 shot 结算守卫
  - `useAimAssist`：默认关闭且容错持久化的预测辅助线偏好
  - `useAimInteraction`：封装跟手虚母球落位、世界角点哪打哪、抓影子球、360° 粗瞄，以及落位即呼出、轻点显式切换固定精瞄档的无边界拨轮
  - `useOpponentAI`：消费局前锁定档案，调度限预算战术 Worker、选杆扰动与袋口容错内的执行误差
  - `useAudioManager`：音效初始化和物理事件播放，暴露 audioRef/playStrike/playPhysicsEvents/resetEvents
  - `usePositionPlan`：走位规划预算状态机（idle→computing→ready→showing/failed），只在灯泡显式点亮后经可抢占 Worker 执行 320 次、两层、2.5 秒截止搜索
  - `useDraggableOverlay`：规划/复盘共用的 Pointer 拖拽位移与视口边界约束

`utils/`: 纯工具函数层，不依赖 React 或 DOM：
  - `renderMatchMessage`：将规则层消息键+参数映射为中文文案，纯函数可测试

`textures.ts`: 为台呢、木纹、皮革与球体生成 CanvasTexture，供 Scene3D 初始化使用。

`main.tsx`: React 应用挂载入口，首帧前应用青瓷/决赛之夜/霓虹球房主题，启用 StrictMode 并按 base → layout → controls → themes 顺序加载样式。

`vite-env.d.ts`: Vite 客户端类型声明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
