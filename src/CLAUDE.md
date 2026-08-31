# src/

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`Game.tsx`: 对局编排器，统一以世界角提交/渲染杆向；每个玩家杆捕获自主目标意图，复盘默认收起且由灯泡独立开关，中性文案只在显式计划后提供轨迹对比；瞄准默认拨轮并可切方向键；介绍页不装配 Scene3D，开始对局后才创建 WebGL；运动帧由 Scene3D 直接消费 worldRef，React 世界只在出杆/结算等语义边界更新；走位 Worker 仅由灯泡启动。

`first-match-guide.ts`: 首局引导纯产品状态机；只有零出杆记录且无完成标记的新用户启用，以放球、拖动结束角度变化、拨轮有效角度变化和成功出杆约束核心节奏，视角/杆法/布局是可跳过的非阻塞发现，容错读写 `guagua-billiards:first-match-guide:v1`，不依赖 React/DOM 或规则实现。

`first-match-guide.test.ts`: 首次/完成存储、受限存储降级、误触与环绕角阈值、真实事件推进、越级防护、可选发现及快速出杆收敛回归。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；普通回合只有打进本组球才续杆，只带进对方花色则保留进球并交换回合。

`opponent/`: 玩家长期能力画像与陪练/挑战模式领域层；出杆在整局结束时一次评估，技术分只由准度 72% 与走位 28% 组成；生成 +3/+10 目标与独立限预算战术 Worker，挑战档优先真实进球、避免洗袋并保留下一杆。

`layout/`: 五控件布局纯领域层；维护 desktop/portrait/landscape 三套自由或右/底停靠位置，负责 8px 钳制、48px 吸附、沿边落点、碰撞避让、容量与 v2→v3 迁移。

`input/`: 出杆与拨轮输入层，纯换算（行程归一、按住满力、击球点单位圆、用户显式粗/精双档、可靠 Pointer 压力→拨轮紧度）+ React 协调器；rAF 只做预览，取消会话立即清零预览，最终力度由有效走廊内松开时刻的真实事实决定。

`aim/`: 纯袋口瞄准几何层——世界角首碰检测、统一物理袋口、2R 走廊遮挡、含 throw 的袋口左右角尖反解；供规划、调试与可选辅助消费，不参与玩家拨轮的粗/精切档。

`components/`: HUD 控制组件（双方动态水平、首局控件邻近提示、灯泡图形面板、无文字视角/击球点/蓄力/横竖拨轮、内容操作与静止长按布局互斥、蓄力移出走廊取消、五控件自由拖放与双边停靠、规划/复盘浮层、主题切换器、球桌视口与开始界面），只转发事件，不持有对局规则。

`styles/`: 样式体系 base → layout → controls → themes；主题入口统一让控件静置 56% 内容透明、按住/聚焦/拖动恢复实色并去掉卡片式外框，不改触控几何；首屏不对全屏 WebGL 画布做实时模糊，warm/hot 档会统一关闭 HUD 毛玻璃合成；横屏尺寸令牌统一重定义，控件层级高于球桌、低于遮罩。

`simulation/`: 固定步调度器与 React 物理循环桥；蓄水池累积帧时长、单帧步数封顶、backlog 保留不丢弃，标签页恢复时重置时钟不补算，静止迁移恰好结算一次。

`camera-view.ts`: 连续视角纯几何，统一钳制 `viewLevel`、顾燃观战锁定/玩家瞄准/手动环绕三态路由、横竖屏固定俯视方向、端点文案、独立视觉方位角与环绕手势换算；俯视按视口比例适配全台，玩家只有停在俯视端点才冻结视觉方位，任意非俯视高度直接跟随杆向。

`camera-view.test.ts`: 连续高度不吸附、相机高度单调、顾燃锁定路由、竖屏纵台/横屏横台、玩家非俯视杆向跟随、各高度 180° 位姿与全台安全边界回归。

`Scene3D.ts`: Three.js 场景适配器；移动端基线 `2×/1024/45Hz/low-power`，桌面 `1.75×/1536/30Hz/low-power`，WebGL2 GPU timer/CPU 退化监控驱动 balanced/warm/hot；静止停止 rAF，resize 重新计算 DPR/阴影/展示帧率；dispose 去重释放全部几何、材质、贴图和环境纹理；消费统一 PocketGeometry 构建真实球桌，六袋护口穿过 jaw 锚点、下沉木帮并沿同曲线向下包住袋腔。

`render-policy.ts`: 不依赖 Three.js 的纯渲染预算；以粗指针或视口短边识别手机，输出基线预算及 balanced/warm/hot 对应的像素比、阴影、帧率与合成策略。

`thermal-governor.ts`: 不依赖浏览器的负载窗口与滞回状态机；以估算 GPU duty 和掉帧比驱动 balanced/warm/hot，活动中降档快、恢复慢；按需渲染停帧后以 2.5 秒冷却间隔逐级恢复，避免低清档永久滞留。

`render-policy.test.ts` / `thermal-governor.test.ts`: 手机/桌面基线预算、三档降质参数、持续高压降档与多稳定窗口逐级恢复回归。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，白球固定从开球线中点标准位开局；公开统一 `TABLE/POCKETS/CUSHION_SEGMENTS` 与共享球碰走向预测；球心连续扫掠袋口/库边，球球碰撞按 TOI 回滚、叉路接触三联立；每步只让当前活跃球进入 O(n²) 配对，落袋球立即退出后续搜索且不改变原球号结算顺序。

`physics/`: 可复用纯碰撞与袋口几何子模块；角袋 100mm/中袋 102mm 的六袋参数、8/7mm 台内捕获弧、恢复/throw 参数、直线/圆弧库边段、台阶及安全瞄准窗口由 physics、aim、planner 和 Scene3D 共享。

`physics.test.ts`: 物理内核单元测试与手感指标，覆盖共享碰撞预测、纯 z 逆序三球链、台内圆弧捕获参数与落袋事件等回归；六袋专项矩阵位于 `physics/table-geometry.test.ts`。

`planner/`: 走位规划引擎（纯 TS，不碰 React/渲染）——几何候选 → erf 粗筛 → 蒙特卡洛精排 → 3 层精确终态前瞻，输出连续 1–3 杆方案；标定后重算概率、清组后转 8 号、仿真预算封顶、rng 注入可测。

`spin-settle.test.ts`: 加塞停球收敛回归：满塞后原地残余侧旋须在数秒内归零（防 world.moving 仅靠 wy 长期不结束）。

`break-variance.test.ts`: 开球方差回归：验证无 rng 时同力度开球结果确定，传 rng 时同力度连续开球的落袋组合与球堆分布出现差异。

`break-spread.test.ts`: 开球散开回归：瞄顶球满力开球后，固定位移/spread/峰值速度分布阈值断言（固定摆法位移 ≥12/15、spread ×5 以上；8 种子单种子位移 ≥8、均值 ≥10），锁定叉路联立修复成果，防索引序动量漏斗回潮；含能量守恒护栏（任何球峰值 <9.4 m/s）与永动检查。

`audio.ts`: 基于 Web Audio 的无外部资源击球、球碰、碰库、落袋与克制胜局彩炮合成音效。

`hooks/`: React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分：
  - `useGameState`：集中管理对局状态、局内锁定双方档案与整局一次评估；新局重置 shot 结算守卫
  - `useAimAssist`：默认开启且容错持久化的预测辅助线偏好
  - `useAimInteraction`：封装开球实体母球合法点按/按住拖放与区域约束、自由球虚影落位、世界角点哪打哪、抓影子球、360° 粗瞄，以及默认拨轮/可选方向键与拨轮显式粗精档
  - `useOpponentAI`：消费局前锁定档案，调度限预算战术 Worker、选杆扰动与袋口容错内的执行误差
  - `useAudioManager`：音效初始化和物理/胜局事件播放，暴露 audioRef/playStrike/playPhysicsEvents/playVictory/resetEvents
  - `usePositionPlan`：走位规划预算状态机（idle→computing→ready→showing/failed），只在灯泡显式点亮后经可抢占 Worker 执行 320 次、两层、2.5 秒截止搜索
  - `useDraggableOverlay`：规划/复盘共用的 Pointer 拖拽位移与视口边界约束

`utils/`: 纯工具函数层，不依赖 React 或 DOM：
  - `renderMatchMessage`：将规则层消息键+参数映射为中文文案，纯函数可测试

`textures.ts`: 为台呢、木纹、皮革与球体生成 CanvasTexture；全部视觉噪声使用固定种子，刷新、设备与截图门禁可复现，供 Scene3D 延迟初始化使用。

`main.tsx`: React 应用挂载入口，首帧前应用青瓷/决赛之夜/霓虹球房主题，启用 StrictMode 并按 base → layout → controls → themes 顺序加载样式。

`vite-env.d.ts`: Vite 客户端类型声明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
