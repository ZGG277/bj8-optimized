# bj8-optimized/

> L2 | 父级: `../CLAUDE.md`

独立 Vite + React + Three.js 中式八球实验场（产品名「瓜瓜台球」），验证 240 Hz 物理、连续环绕视角、杆法、规则轮转与真实交互；HUD 可在青瓷、决赛之夜、霓虹球房三套表达间切换。当前公开移动版仍是发布前版本，使用独立妙搭应用 `app_17b18dh5axj`，玩法与部署说明见 README.md。

## 成员清单

`src/`: 游戏业务源码，包含 physics 物理世界、aim 精瞄几何、match 规则状态机、opponent 玩家能力/模式化对手档案、planner 走位搜索、input 出杆、components HUD、simulation 固定步调度、React 对局编排、Three.js 场景、音频、程序化贴图与样式。

`scripts/`: 构建发布适配、浏览器交互、画面与场景对象验证脚本；含妙搭单 HTML 门禁、真实指针回归（41 断言）、手机竖屏（48 断言）、对手观战/玩家全局相机（9 断言）、三主题集成（14 断言）、虚母球/无限拨轮（8 断言）、预测球路一致性（19 断言）及规划/规则/视觉专项，成员清单见 `scripts/CLAUDE.md`。

`shots/`: 人工与自动化试玩截图，仅作为视觉回归证据，不作为运行时依赖。

`index.html`: Vite HTML 入口，挂载 React 根节点并声明页面元数据。

`README.md`: 项目说明（玩法、v1.3 视觉语言、快速开始、质量门禁、浏览器回归、妙搭部署）。

`MOBILE_PORTRAIT_V12_ACCEPTANCE.md`: `codex/mobile-portrait-v1.2-20260728` 的竖屏信息架构、单手交互决策、30 项真实触控证据与人工验收重点。

`package.json`: 本实验场的依赖与命令入口；`npm run check` 为 typecheck + 单测 + 构建的统一提交门禁。

`package-lock.json`: npm 依赖锁文件，保证本地与验证环境依赖一致。

`tsconfig.json`: TypeScript 严格模式与未使用符号检查配置。

`vite.config.ts`: Vite React 构建配置；正式构建合并业务、React 与 Three.js 主 chunk，CSS 不分包，规划 Worker 以内联 Blob 生成；`scripts/inline-build.mjs` 再产出妙搭兼容的单 HTML，本地开发仍保持 Vite 模块热更新。

`PHASE_0_1_EXECUTION_PLAN.md`: 规则正确性、GEB 同构、输入确定性与固定步时钟的可执行优化方案。

`POSITION_PLAY_DESIGN.md`: 走位规划（已交付，`src/planner/`）与拍照还原球局（方案阶段）的完整调研、方案决策、实测数据与交互设计文档。

`PRECISION_AIM_V2_ACCEPTANCE.md`: `codex/precision-aim-v2-20260728` 的功能边界、双档精瞄操作规格、自动化证据与人工验收清单。

`MULTIPLAYER_DESIGN.md`: 实时联网对战评估稿（两方案：Kimi 建站数据库轮询 vs 静态托管+实时层），含共用同步协议（快照权威+本地重放）、数据表/消息设计、利弊对比与开放问题；待 codex 审核后决策。

`VISUAL_LANGUAGE_V13.md`: 视觉统一审计与三案比较；最终采用“静谧球房”为主、“竞技仪表”为辅的令牌化方案，并记录保持 54px 控制轨与既有手势几何不变的取舍和验收标准。

`dist/`: Vite 生成产物，不作为源代码维护。

`node_modules/`: 本地依赖缓存，不进入版本控制。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
