# src/

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`Game.tsx`: 对局编排器，规则判定已迁至 `match/` 纯状态机；剩余职责为 AI 调度、输入采样、物理循环、视角/HUD 渲染（790 行，Phase 1 将按 input、simulation、components 边界继续拆分）。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；含 18 用例规则矩阵测试。

`Scene3D.ts`: Three.js 场景适配器，消费物理世界快照并提供双视角、合法目标环、球杆动画、自由球预览和屏幕到球桌坐标映射。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，输出首碰、碰库与落袋事件，禁止依赖 React、DOM 或规则状态。

`physics.test.ts`: 物理内核单元测试与手感指标；Phase 0 将把仅打印指标的用例升级为可失败断言。

`audio.ts`: 基于 Web Audio 的无外部资源击球、碰撞、碰库与落袋合成音效。

`textures.ts`: 为台呢、木纹、皮革与球体生成 CanvasTexture，供 Scene3D 初始化使用。

`index.css`: 当前全部 HUD、控制区和响应式布局；Phase 1 将按基础、布局、控制拆分并修复横屏命中层级。

`main.tsx`: React 应用挂载入口，启用 StrictMode 并加载全局样式。

`vite-env.d.ts`: Vite 客户端类型声明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
