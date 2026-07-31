# src/planner/

> L2 | 父级: `../CLAUDE.md`

走位规划引擎（纯 TS，不依赖 React/DOM）：给定球局与合法目标球，搜索最优连续 1–3 杆击球方案。管线：几何候选 → erf 粗筛 → MC 精排 → 精确终态滚动前瞻；标定若改变杆向/力度则以标定参数重算 MC 概率，清完本组后下一层合法球自动切到 8 号。全程 240Hz、默认 8000 仿真预算；异步门面可抢占旧 worker，不留悬挂 Promise。

## 成员清单

`candidates.ts`: 几何候选生成器——消费/re-export physics 统一 POCKETS，ghost-ball 点 + 2R 走廊遮挡 + 切角 ≤75° 过滤，pooltool 式袋口角尖容错 Δφ；每个 (目标球, 袋口) 只出基础候选，总数截断 60。

`evaluate.ts`: 概率模型与蒙特卡洛——erf 解析进球率（Abramowitz–Stegun 近似）、Box-Muller 高斯扰动 MC 评估（成功=进球+合法首碰+不洗袋，母球停位 2R 网格聚类）、无扰动展示轨迹仿真（每 4 步记点、事件加密，带出 endWorld 精确终态供链条滚动构造）、瞄准标定 refineAimForPocket（几何角未计入投掷/滚动损耗，以无扰动仿真为准做 ±0.04rad 角度 × +16/−8 力度微调扫描，取第一组精确进球且不洗袋的参数；扫描受预算严格门控）；SimBudget 预算按样本粒度截断。

`search.ts`: 3 层精确终态滚动搜索与评分；`nextLegalNumbers` 在本组清空后把 8 号加入下一杆；每层 refine 改参后重跑对应 MC，展示概率/zone/评分不再沿用旧候选数据；PlannedStep 携带 endWorld 供整链播放。

`planner.test.ts`: 候选/概率/遮挡/结构/预算/链条自洽/截断/分组测试，并覆盖最后一颗本组球→8 号收尾链。

`bench.test.ts`: 单杆全仿真耗时 benchmark（240Hz 与降频对比，从 src/ 移入），为搜索采样预算提供实测基线。

`plan-worker.ts`: Web Worker 入口——接收 { world, legal, opts }（纯 JSON 结构化克隆），跑 planPosition 回传 plans；Vite module worker，把 0.2–1s 搜索移出主线程。

`async.ts`: 异步门面 planPositionAsync / planPositionWithinDeadline——内联 Blob Worker 随单 HTML 产物发布；新请求 reject 旧 Promise 并 terminate 旧 worker，墙钟超时同样终止并返回专用错误；普通请求在 worker 创建失败时降级主线程，限时请求则立即失败，避免同步搜索阻塞截止时间。

`async.test.ts`: FakeWorker 回归：第二请求抢占第一请求、截止时间终止 worker、worker 不可用时限时请求立即失败、旧 Promise 以对应错误结算、新请求正常返回。

`review.ts`: 击球复盘——出杆捕获快照（ShotCapture：击球前世界/杆参数/当时计划首步）在结算后把实际杆参数跑一遍 simulateForDisplay 无扰动仿真，与计划逐步比对出 ShotReview（perfect/position-miss/pot-miss + 一句话中文诊断 + 计划/实际轨迹对）。走位诊断主信号用母球行程总长差（±0.2m 阈值，碰库反弹拉长行程与力度同向，比停位投影稳健），行程相近看停位侧向偏差判杆法；未进球用实际切角 vs 计划 cutAngle 判厚薄（±2°），叉积符号判偏袋口左右侧；洗袋直接报力度偏大。无计划（planned=null）静默返回 null。

`review.test.ts`: 复盘层单元测试——场景用种子化 planPosition 的真实 plans[0].steps[0]，覆盖 perfect（参数照抄）/真实可进球轨迹低于计划参考力/偏大力度走位偏差/瞄偏 pot-miss 厚薄与偏袋口文案/无计划返回 null；低力用例只抬高计划参考值以隔离复盘诊断，不受规划器最低可进球力度漂移影响。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
