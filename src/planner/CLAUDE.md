# src/planner/

> L2 | 父级: `../CLAUDE.md`

走位规划引擎（纯 TS，不依赖 React/DOM）：给定球局与合法目标球，搜索最优连续 1–3 杆击球方案。管线：几何候选 → erf 粗筛 → MC 精排 → 精确终态滚动前瞻；标定若改变杆向/力度则以标定参数重算 MC 概率，清完本组后下一层合法球自动切到 8 号。全程 240Hz、默认 8000 仿真预算；异步门面可抢占旧 worker，不留悬挂 Promise。

## 成员清单

`candidates.ts`: 几何候选生成器——消费/re-export physics 统一 POCKETS，ghost-ball 点 + 2R 走廊遮挡 + 切角 ≤75° 过滤；袋口左右安全点先反解 ghost，再以母球看两个 ghost 的实际杆向夹角计算容错 Δφ，供 MC、能力模型与 AI 执行共用；每个 (目标球, 袋口) 只出基础候选，总数截断 60。

`evaluate.ts`: 概率模型与蒙特卡洛——erf 解析进球率（Abramowitz–Stegun 近似）、Box-Muller 高斯扰动 MC 评估（成功=进球+合法首碰+不洗袋，母球停位 2R 网格聚类）、无扰动展示轨迹仿真（每 4 步记点、事件加密，带出 endWorld 精确终态供链条滚动构造）、瞄准标定 refineAimForPocket（几何角未计入投掷/滚动损耗，以无扰动仿真为准做 ±0.04rad 角度 × +16/−8 力度微调扫描，取第一组精确进球且不洗袋的参数；扫描受预算严格门控）；SimBudget 预算按样本粒度截断。

`search.ts`: 3 层精确终态滚动搜索与评分；`nextLegalNumbers` 在本组清空后把 8 号加入下一杆；每层 refine 改参后重跑对应 MC，展示概率/zone/评分不再沿用旧候选数据；PlannedStep 携带 endWorld 供整链播放。

`planner.test.ts`: 母球杆向容错/候选/概率/遮挡/结构/预算/链条自洽/截断/分组测试，覆盖近袋轻低杆安全性与强低杆回拉入对侧中袋风险，并覆盖最后一颗本组球→8 号收尾链。

`bench.test.ts`: 单杆全仿真耗时 benchmark（240Hz 与降频对比）及宽松回归阈值；活跃球配对后当前约 4–5ms/杆，以 20ms/杆阻止数量级退化。

`plan-worker.ts`: Web Worker 入口——接收 { world, legal, opts }（纯 JSON 结构化克隆），跑 planPosition 回传 plans；Vite module worker，把 0.2–1s 搜索移出主线程。

`async.ts`: 异步门面 planPositionAsync / planPositionWithinDeadline——内联 Blob Worker 随单 HTML 产物发布；新请求 reject 旧 Promise 并 terminate 旧 worker，墙钟超时同样终止并返回专用错误；普通请求在 worker 创建失败时降级主线程，限时请求则立即失败，避免同步搜索阻塞截止时间。

`async.test.ts`: FakeWorker 回归：第二请求抢占第一请求、截止时间终止 worker、worker 不可用时限时请求立即失败、旧 Promise 以对应错误结算、新请求正常返回。

`review.ts`: 中性赛后复盘——ShotCapture 同时记录玩家杆向推断出的目标球/袋口意图与可选显式计划；每杆至多精确回放一次，按犯规→未进球厚薄/偏侧→洗袋→袋口边缘/力度→稳定动作只给一个诊断。planned=null 仍产出自主复盘但不暴露系统轨迹；主动查看过规划时保留 zone/行程/杆法与计划/实际对比。

`review.test.ts`: 复盘层单元测试——覆盖显式计划 perfect/力度/厚薄、自主意图复盘不暴露计划、犯规优先、开球建议，以及既无意图也无结算事实时安全跳过。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
