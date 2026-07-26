# src/

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`Game.tsx`: 对局编排器，规则在 `match/`、输入在 `input/`、控件在 `components/`、物理时钟在 `simulation/`；剩余职责为 AI 调度、视角/HUD 状态编排与瞄准映射。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；含 18 用例规则矩阵测试。

`input/`: 出杆输入层，纯换算（行程归一、按住满力、击球点单位圆）+ React 协调器；rAF 只做预览，最终力度由松开时刻真实事实决定。

`components/`: HUD 控制组件（视角工具条、瞄准微调、击球点盘、出杆区），只转发事件，不持有对局状态；带 aria 语义与焦点态。

`styles/`: 样式体系 base → layout → controls；横屏尺寸令牌统一重定义，控件层级高于球桌、低于遮罩。

`simulation/`: 固定步调度器与 React 物理循环桥；蓄水池累积帧时长、单帧步数封顶、backlog 保留不丢弃，标签页恢复时重置时钟不补算，静止迁移恰好结算一次。

`Scene3D.ts`: Three.js 场景适配器，消费物理世界快照并提供双视角（第一人称杆后共线）、合法目标环、球杆动画、自由球预览和屏幕到球桌坐标映射；相机平滑收敛随 rAF 每帧推进，不依赖 React 渲染节奏。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，输出首碰、碰库与落袋事件，禁止依赖 React、DOM 或规则状态。

`physics.test.ts`: 物理内核单元测试与手感指标，全部以可失败断言约束速度、旋转、走位与边界。

`audio.ts`: 基于 Web Audio 的无外部资源击球、碰撞、碰库与落袋合成音效。

`textures.ts`: 为台呢、木纹、皮革与球体生成 CanvasTexture，供 Scene3D 初始化使用。

`main.tsx`: React 应用挂载入口，启用 StrictMode 并按 base → layout → controls 顺序加载样式。

`vite-env.d.ts`: Vite 客户端类型声明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
