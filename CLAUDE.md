# bj8-optimized/

> L2 | 父级: `../CLAUDE.md`

版本状态（2026-09-09）：v1.7.0 已发布到妙搭，54 个文件 / 392 项回归通过，包含五种正式世界、新手 25 级起步与 50 级以内禁主动防守、击球后 1.4 秒慢回全台；release 回执 `feishuapp.com` 正式入口桌面/手机 20 项及正式 CDN 包 35 项均已验收。历史 `aiforce.cloud` 别名在本机出现连接关闭，事实与边界以 PROJECT_BASELINE.md 为准。

独立 Vite + React + Three.js 中式八球实验场（产品名「瓜瓜台球」），当前本地验收基线为 `v1.4.1`。验证 240 Hz 物理、开局白球标准位与合法区点击/拖放、默认瞄准线与拨轮、玩家连续视角、顾燃横竖屏固定俯视、杆法、规则轮转、克制合成音效与真实交互；渲染层采用低功耗 GPU、静止按需渲染、手机 2×/45Hz 与桌面 1.75×/30Hz 最终 WebGL 出口，以及 GPU timer/掉帧三档自适应温控，持续高压时只降 DPR、阴影、展示帧率和合成效果，停帧静置后逐级恢复清晰度，不改 240Hz 物理；走位只在用户点亮灯泡后计算。共享袋口几何采用角袋 100mm/中袋 102mm，并以 8/7mm 台内圆弧统一视觉凹口与连续落袋捕获，HUD 提供首局微提示、动态实力、手动粗/精瞄、可停靠五控件及三套主题表达。

## 成员清单

`PROJECT_BASELINE.md`: 当前发布版本、源码标签、产物哈希、妙搭回执及真实入口验收的事实源。

`TABLE_CRAFT_V2_ACCEPTANCE.md`: 台面/库边/球接触/六袋针脚包边精修的本地实现、模型与浏览器验收记录。

`assets/`: 本地 Blender 制作源与几何参考；第一版静谧球房由 src/scene 消费轻量 GLB，运行时保持共享物理几何和现有操作。

`SCENE_BLENDER_V1_ACCEPTANCE.md`: 第一版 Blender 视觉重构的资产、源码、包体与浏览器验收记录；本地未发布。

当前未发布迭代：逐控件左侧悬停/键盘提示，成功后逐项本机记忆；俯视、手动视角和出杆另保留已学会后的简短说明，状态/方向文案随控件变化。幽灵球确认后按完整球体/袋口/HUD安全区自动构图，真实击球后紧密拟合横/竖全台；加入全区间 CCD、按岛求解与滑动/侧旋耦合，袋口实体绳网和恒尺寸下落。执行与验收状态见专项文档，未实测标定/未发布。

`src/`: 游戏业务源码，包含 physics 物理世界、aim 精瞄几何、match 规则状态机、opponent 玩家能力/模式化对手档案、planner 走位搜索、input 出杆、components HUD、simulation 固定步调度、React 对局编排、Three.js 场景、音频、程序化贴图与样式。

`scripts/`: 构建发布适配、浏览器交互、画面与场景对象验证脚本；含妙搭单 HTML 门禁、真实指针回归（41 断言）、手机竖屏触控防抖/五控件换位/压感拨轮与流畅拖放（23 断言）、顾燃横竖屏固定俯视/玩家非俯视杆向跟随/手动相机与触屏锁镜、调色盘/控件显隐与三主题三视口矩阵（26 断言）、白球标准位与合法区点击/拖放、默认瞄准线与无限拨轮（15 断言）、预测球路一致性（19 断言）及规划/规则/视觉专项，成员清单见 `scripts/CLAUDE.md`。

`shots/`: 人工与自动化试玩截图，仅作为视觉回归证据，不作为运行时依赖。

`index.html`: Vite HTML 入口，挂载 React 根节点并声明页面元数据。

`README.md`: 项目说明（玩法、v1.4 动态实力与可停靠控件、快速开始、质量门禁、浏览器回归、妙搭部署）。

`ONBOARDING_CAMERA_ACCEPTANCE.md`: 逐控件提示与自动瞄准视角的本地验收检查点、构建指纹、权限阻塞与未验证浏览器清单；不代表已发布。

`CONTROL_HOVER_ACCEPTANCE.md`: 俯视、手动视角与出杆三个控件的常驻悬停说明合同、串行调度与本地验收证据。

`POCKET_TRIM_RESEARCH_PLAN.md`: 高能力独立任务的袋口包边缺漏根因研究检查点、事实证据和方案；未完成研究不代表已修复。

`POCKET_TRIM_RELEASE_PLAN.md`: 袋口方案落地的串行分派、发布权限、版本来源和本地/线上门禁合同。

`POCKET_TRIM_IMPLEMENTATION.md`: 袋口共享接缝、闭合皮壳和木框补位的实现说明、45项定向测试与冻结指纹；视觉和发布验收另记。

`OPTIMIZATION_EXECUTION_PLAN.md`: 球桌/相机/物理的分层执行合同、子 Agent 模型和文件所有权、依赖、验收标准及进度证据；本轮仅本地实现与验收。

`OPTIMIZATION_ACCEPTANCE.md`: 本轮交叉审查返工、源码冻结、模型回归与桌面/手机真实入口验收记录；明确未完成项，不以历史测试或构建回执代替当前验收。

`OPTIMIZATION_SPARK_CONTRACT.md`: 绑定最终源码指纹的 Spark 固定回归合同；只读源码，串行 check/build，禁止扩展写入或发布。

`MOBILE_PORTRAIT_V12_ACCEPTANCE.md`: `codex/mobile-portrait-v1.2-20260728` 的竖屏信息架构、单手交互决策、30 项真实触控证据与人工验收重点。

`package.json`: 本实验场的依赖与命令入口；`npm run check` 为 typecheck + 单测 + 构建的统一提交门禁。

`package-lock.json`: npm 依赖锁文件，保证本地与验证环境依赖一致。

`tsconfig.json`: TypeScript 严格模式与未使用符号检查配置。

`vite.config.ts`: Vite React 构建配置；正式构建合并业务、React 与 Three.js 主 chunk，CSS 不分包，规划 Worker 以内联 Blob 生成；`scripts/inline-build.mjs` 再产出妙搭兼容的单 HTML，本地开发仍保持 Vite 模块热更新。

`PHASE_0_1_EXECUTION_PLAN.md`: 规则正确性、GEB 同构、输入确定性与固定步时钟的可执行优化方案。

`POSITION_PLAY_DESIGN.md`: 走位规划（已交付，`src/planner/`）与拍照还原球局（方案阶段）的完整调研、方案决策、实测数据与交互设计文档。

`PRECISION_AIM_V2_ACCEPTANCE.md`: 无限拨轮的功能边界、用户显式粗/精双档操作规格、自动化证据与人工验收清单。

`MULTIPLAYER_DESIGN.md`: 实时联网对战评估稿（两方案：Kimi 建站数据库轮询 vs 静态托管+实时层），含共用同步协议（快照权威+本地重放）、数据表/消息设计、利弊对比与开放问题；待 codex 审核后决策。

`VISUAL_LANGUAGE_V13.md`: 视觉统一审计与三案比较；最终采用“静谧球房”为主、“竞技仪表”为辅的令牌化方案，并记录保持 54px 控制轨与既有手势几何不变的取舍和验收标准。

`dist/`: Vite 生成产物，不作为源代码维护。

`node_modules/`: 本地依赖缓存，不进入版本控制。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
