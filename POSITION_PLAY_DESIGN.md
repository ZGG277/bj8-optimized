# 走位规划与拍照还原球局 —— 调研与设计文档

> 功能一「💡 走位」已交付（2026-07）：`src/planner/` + `usePositionPlan` + `PlanOverlay`。
> 功能二「拍照还原球局」为调研/方案阶段，未实施。
> 本文档记录完整调研、方案决策、实测数据与交互设计。

## 〇、核心结论

走位规划不是玄学：单杆物理已完全解析化（90°/30° 规则），清台顺序有约 30 条成文法则，学术界（PickPocket/CueCard，ICGA 台球奥赛）二十年前就用「确定性物理仿真 + 蒙特卡洛采样 + 2 层前瞻搜索」打赢人类。本项目已有确定性 240Hz 物理内核（实测单杆仿真 0.14–0.15ms），复刻这条管线的条件比当年所有团队都好。多杆走位规划是商业产品空白，拍照还原球局已被 pix2pockets（arXiv 2025）打通技术但无消费级产品——两个方向都是真空白、真差异化。

---

## 一、调研结果

### 1.1 同类产品扫描

**单杆瞄准辅助（已泛滥，灰产）**

- **腾讯桌球 / 台球帝国**：瞄准延长线是标配且做成付费点（球杆等级=线长），只画「母球→目标球→袋口」+ 分离角方向，不涉及走位。围绕其形成庞大延长线外挂生态。
- **Miniclip 8 Ball Pool 外挂**（Aim Tool / Cheto / Snake Engine）：屏幕 overlay 延长瞄准线、支持翻袋轨迹，全部违反 ToS 会被封号，常夹带恶意软件。**全部停留在「这一杆怎么进」，没有战略层。**
- **ShootersPool**（shooterspool.net）：物理最真的 PC 模拟器，Physics Tracking Lines 手动摆球+单杆轨迹可视化+慢镜头，但**不给多杆规划建议**，上手门槛极硬核。

**教学/训练产品（静态内容，不对真实球局计算）**

- **Dr. Dave Billiards + Billiard University**（drdavepoolinfo.com / billiarduniversity.org）：学术派教学事实标准（科罗拉多州立大学物理教授 Alciatore）。讲原理（分离角/切线/力度）+ drill 图册 + BU 考级体系，无软件化实时规划。
- **DrillRoom**（drillroom.ai，iOS）：与功能二最接近的现有产品——iPhone 架三脚架俯视真实球桌，CV 追踪进球与杆速，30+ drill 虚拟教练实时反馈。**但只判「进没进」，不还原完整球局、不给走位建议**；iOS only、需三脚架、订阅制。
- **Pool Drill Master / Pocket-Sniper 等**：电子化 drill 图册，pattern play 靠固定套路背诵。

**拍照/录像还原球局（技术成熟，产品缺位）**

- **pix2pockets**（arXiv 2025，https://arxiv.org/abs/2504.12045）：单张野生照片 → 桌面/球检测（195 张标注图、5748 mask）→ 单应变换俯视 → 球位误差 0.4cm（AP50 91.2）→ 击球建议。关键结论：**标准 RL 算法全部失败（清台必犯规），简单启发式 baseline 单杆成功率 94.7%**——规则+物理模拟的启发式搜索就够用。
- **pool-playing-robot**（GitHub: opticsensors/pool-playing-robot）：完整开源管线——相机标定 → homography 对齐桌角 → 球检测 → 计算所有可行击球并排序。最直接的代码参考。
- **Stanford Pool Cue Guide**（Weatherford）：纯传统 CV（homography + 模板匹配 + 形态学），不用深度学习也能从单张照片还原并给瞄准向量，代价是光照/视角鲁棒性差。
- **Stochasticks**（MIT，1997）：鼻祖级 AR 论文，头戴相机 + 概率颜色模型，对所有可能击球排序并叠加轨迹到头显。1997 年就完整提出这件事，死于硬件形态而非算法。
- 实时追踪类开源：billystat（YOLOv3 斯诺克统计）、TrackingSnookerBalls、pool_coach、PoolShotPredictor（YOLOv8）。
- **共同翻车点**：斜视照片球间遮挡、花色/号码识别、光照多样性。所有失败项目都死在追求 100% 全自动——给一条「10 秒手动修正」路径比再提 2% 精度值钱。

**空白区判定**：游戏辅助与外挂只做单杆，教学产品只做静态 drill，「在任意真实球局上自动生成多杆走位方案」没有产品做。单机/教学定位下做此功能不触碰外挂合规问题。

### 1.2 学术技术路线（ICGA Computational Pool 谱系）

核心范式二十年未变：**确定性物理引擎 + 击球参数注入高斯噪声 + 蒙特卡洛采样 + 有限深度 look-ahead 搜索**。

- **PickPocket**（Smith 2007，Alberta，AI Journal 171:1069，多届 Olympiad 冠军）：Probabilistic search（解析算每杆成功概率并按概率剪枝）+ Monte-Carlo search（加噪仿真多次取均值，「当前最优已无法被超过」时提前停采）。论文 PDF：http://webdocs.cs.ualberta.ca/~jonathan/PREVIOUS/Grad/Papers/smith.msc.pdf
- **CueCard**（Archibald/Stanford，IJCAI 2009，492:144 胜 PickPocket）：①候选生成——每合法球×袋口生成瞄准角 φ 与最小速度 v₀，无噪声仿真粗筛；②采样评估——每候选 25–100 次高斯扰动仿真取均分；③**结果聚类**——~50 个结果局面 K-Means 聚成 5–10 个代表（被证明贡献最大的 domain-independent 技术）；④top-20 进第二层。结论：**2 层 look-ahead 是甜点位，第 3 层靠评价函数「最好 3 杆概率加权和」隐式覆盖**。https://www.ijcai.org/Proceedings/09/Papers/231.pdf
- **评价函数共识结构**：局面分 ≈ Σ（最好 N 杆成功概率，N=3）；单杆分 = 进球概率×价值 + 母球停位质量（递归定义为下一杆最好球成功率）。
- **进球概率模型**：P(make) ≈ erf(Δφ/√2σ)。Δφ = 进球容错角半宽（pooltool `required_precision` 同款：瞄准左右两个袋口角尖的切角差）；Dr. Dave TP 3.4/3.6：容错随目标球-袋距离线性收缩、随切角增大收缩（有效袋口模型）。σ = 执行误差，可作难度旋钮（Deep Green 标定到高级业余每 10 杆丢 1 杆）。精排用蒙特卡洛扰动统计，天然覆盖库边反弹、二次碰撞、袋口 rattle。
- **pooltool**（ekiefl/pooltool，JOSS 2024）：开源物理引擎，AI 层只有几何工具（viable_pockets / required_precision / ghost-ball 瞄准），无搜索无概率模型——印证「候选生成器可抄、搜索层自建」。
- **事件驱动仿真**（Greenspan，Deep Green，IEEE Computer 2008）：解析预测下次碰撞时刻，比定步长快 2–3 个数量级。本项目实测定步长已够快（0.14ms/杆），无需迁移。
- **学习方法存在但未取代搜索**：Macro/Micro RL nine-ball（CoG 2019，DNN+MCTS，run-out 率 40.6%）、CueTip（arXiv 2501.18291，MLP 价值代理加速评估）。学习组件适合当价值网络/剪枝先验，主干仍是物理仿真+搜索。pix2pockets 的 RL 失败案例进一步佐证。
- **实时性账**：本项目实测 240Hz 全杆仿真 0.14–0.15ms（Node 20，Apple Silicon），1000 次仿真 ≈ 0.15s，默认预算 8000 次 ≈ 1.2s。手段按性价比：几何粗筛（零成本）→ Web Worker 后台跑 → 早停/预算截断。降频仿真、WASM、事件驱动均不需要。

### 1.3 走位理论的可形式化程度

| 层次 | 内容 | 可形式化程度 |
|---|---|---|
| 单杆物理 | 90° 规则（stun 切线分离，TP 3.1）、30° 规则（自然滚动自然角，TP B.13）、draw/follow 弧线（轨迹恒与切线相切出发再弯曲）、塞效应（throw/碰库反踢） | **高**——Dr. Dave TP 文档全是公式；本人物理内核已实现滑动/滚动两阶段模型 |
| 走位目标 | **zone 而非点**（梯形/三角形区域，沿纵轴进入、避开窄端）、正确侧/错误侧、留角度不留直球（15°–45°，30° 最优）、Keep it Natural、Stay Centered | **高**——纯几何约束 |
| 清台顺序 | **从黑八倒推**（定黑八袋→定 key ball→倒推当前）、先难后易、尽早清中路、key ball、保险球、成组清球、最小化母球运动、Think three shots ahead、每杆后重估 | **中高**——Dr. Dave 20 条 + Byrne 13 条 + Bullseye 7 条，各来源惊人一致 |
| 难度量化 | 容错随距离/切角收缩解析模型（TP 3.4/3.6）、TDF 球台难度系数、BU 渐进式 drill 分档 | **高**——有公开公式 |
| 路线偏好 | 哪条 pattern 最顺、K 球拆堆结果 | **低**——蒙特卡洛采样补齐，无需深度学习 |

**关键洞察**：职业选手刻意把每杆留成自然角，正是为了让 30° 规则可预测（Dr. Dave 原文：*"a good player executing good position control, leaving natural angles on each shot, the 30 degree rule applies for almost every shot"*）。台球的「随机性」来自执行误差（连续动作空间），用高斯扰动+蒙特卡洛建模，而非棋类的离散分支因子。

**中文语境**：中式八球教学内容与美式体系完全同构（中袋使用率高、先难后易、留黑八叫位；参考郑宇伯清台拆解、搜狐「三颗球清台技巧」）。

### 1.4 关键参考文献

- Smith, PickPocket（AI Journal 2007）：http://webdocs.cs.ualberta.ca/~jonathan/PREVIOUS/Grad/Papers/smith.msc.pdf
- Archibald et al., CueCard（IJCAI 2009）：https://www.ijcai.org/Proceedings/09/Papers/231.pdf
- Archibald 博士论文（Stanford 2011）：https://stacks.stanford.edu/file/druid:xq716gb1252/ArchibaldThesis-augmented.pdf
- Greenspan, Deep Green（IEEE Computer 2008）：https://drdavepoolinfo.com/physics_articles/Greenspan_IEEE_08_article.pdf
- Silva, MiniPool 实时方案综述：https://fenix.tecnico.ulisboa.pt/downloadFile/563345090414009/MEIC-66392-David-Silva-extAbst.pdf
- pix2pockets（arXiv 2025）：https://arxiv.org/abs/2504.12045
- pooltool AI 几何工具：https://github.com/ekiefl/pooltool/tree/main/pooltool/ai
- pool-playing-robot 开源管线：https://github.com/opticsensors/pool-playing-robot
- CueTip（arXiv 2025）：https://arxiv.org/html/2501.18291v2
- Dr. Dave：Technical Proofs 全目录 https://drdavepoolinfo.com/technical-proof/ ；8 球战略 20 条 https://drdavepoolinfo.com/faq/strategy/8-ball/ ；90°/30° 规则 https://drdavepoolinfo.com/faq/30-90-rules/30-degree-rule/
- Bullseye Pattern Play 法则：https://bullseyebilliards.com/blogs/articles/18949755-pattern-play-rules-of-thumb-planning-a-runout
- Scott's Pool School 走位十原则（zone play）：http://www.mypoolblog.com/lessons-and-articles/principles-of-position-play
- DrillRoom（功能二最近竞品）：https://drillroom.ai/

---

## 二、功能一「💡 走位」实现架构（已交付）

### 2.1 管线

```
球局变化（进入玩家回合）→ usePositionPlan 检测世界指纹变化
  → planPositionAsync（Web Worker，generation 令牌防陈旧，失败降级主线程）
    → candidates.ts  几何候选生成（ghost-ball/遮挡/切角≤75°/tolerance 容错宽度）≤60 个
    → erfProb 粗筛 top-10（P = erf(Δφ/√2σ)，σ=0.006）
    → 杆法变体展开（中心/高杆/低杆三档，必要：中心杆直球近袋必跟进洗袋）
    → evaluate.ts    monteCarloShot 精排（默认 24 样本/候选，角度 N(0,σ)+力度±5% 扰动）
    → search.ts      精确终态滚动前瞻：第 2/3 步各从上一步无扰动展示仿真的
                     endWorld（含被带动他球的真实终态）重新 erf 粗筛 top-3 +
                     MC 精评（16/12 样本）；展示杆按 MC 排名逐个精确校验，
                     几何角差之毫厘的杆经 refineAimForPocket 标定（±0.04rad 角度
                     × +16/−8 力度微调，几何未计入投掷/滚动损耗）后采用标定参数，
                     标定失败即递补，全灭则链条截断；simBudget=8000 截断
    → zone 凸包（Andrew monotone chain，<3 点退化八边形）+ note 规则模板注解
  → plans ready → 💡 按钮微光
→ 点击 → PlanOverlay 提示条 + Scene3D.showPlanChain 整链直绘（俯视视角，禁瞄准）
```

### 2.2 评分函数（search.ts 顶部命名常数）

```
score = P1·(1 + 0.8·P2 + 0.5·P3) − 1.5·foulRate + 0.2·P2 + sideBonus − 0.05·碰库次数
sideBonus：下一杆切角 ∈ [0.26, 0.79] rad（15°–45°）窗口内，30° 取峰值 0.12
chainProb = P1·P2·P3（展示为「三杆连贯成功率」）
```

对应教练法则的编码：留角度不留直球（sideBonus 窗口）、最小化母球运动（碰库惩罚）、合法执行（foulRate 惩罚含洗袋/首碰非法）。key ball/保险球/拆堆未编码（见 §四后续项）。

### 2.3 实测数据

- benchmark（`src/planner/bench.test.ts`）：240Hz 全杆仿真 0.14–0.15ms；120Hz 0.06–0.07ms；60Hz 0.03ms；cloneWorld ≈0.005ms。
- 典型局面实际消耗约 1000–1500 次仿真（≈0.2s），最坏情况预算 8000 次（≈1.2s）截断。
- 杆法变体的必要性实测：中心杆直球近袋 foulRate 0.96（跟进洗袋），低杆变体 prob=1.0。
- 质量门禁：`npm run check` 全绿（85 单测）；`verify-interaction` 41/41；`verify-position-plan` 18/18。截图 `shots/38-position-plan.png`（播放中）、`shots/40-plan-on-table.png`（桌面整链直绘）、`shots/41-plan-on-table-portrait.png`（竖屏）。
- 链条自洽性回归（2026-07-28 修复）：旧实现第 2/3 杆候选来自 MC 聚类中心虚拟局面，与链条无扰动仿真 cueEnd 有厘米级偏差，规划视图展示杆打不进球。修复后每个展示杆都经无扰动精确仿真校验（重放必进球且不洗袋），由 `planner.test.ts`「链条自洽性」用例锁定。
- 瞄准标定回归（2026-07-28 修复）：实战中分组后中局（legal=本组 ≤7 颗）曾稳定只有第 1 杆——ghost-ball 几何角未计入投掷/滚动损耗，无扰动精确仿真差之毫厘被拒（实测中局 erf≥0.5 候选约 1/3 精确失败，全部可用小修正救回）。refineAimForPocket 标定后，自对弈中局（分组语义）最优 plan ≥2 步占比从 43% 升至 80%（3 种子 49 局面），由「中局分组语义」用例锁定。

### 2.4 交互设计（已实现，2026-07-28 改版：桌上整链直绘 + 顶部提示条）

- **触发即预算**：对手停球/任何球局变化且轮到玩家 → 后台 Worker 自动预算，玩家无感知；按钮三态常驻见 §2.5（computing 呼吸 → ready 微光，无可行方案灰显不隐藏）。
- **桌上整链直绘**：点 💡 后三杆方案一次性画在台面上，不再有右侧面板/底部抽屉。每杆一个颜色（`PLAN_STEP_COLORS`：第 1 杆暖橙、第 2 杆青、第 3 杆紫），画母球轨迹 polyline + 停位环、目标球轨迹、袋口环；袋口处放 CanvasTexture sprite 序号徽章（①②③，圆底同杆色），玩家顺着「同色轨迹+同色序号」读完整条走位链。
- **首杆完整决策信息**：第 1 杆额外画白色瞄准虚线 + ghost 环 + zone 半透明凸包（opacity 0.14）。zone 只画首杆是刻意取舍：三层 zone 叠染在台面上不可读，且玩家当下要决策的只有第 1 杆，第 2/3 杆的停位精度由轨迹终点环表达。
- **顶部紧凑提示条**：替代旧面板，顶边贴比分行之下（`calc(var(--topbar-h) + var(--scoreboard-h) + 4px)`，竖屏自动折两行），内容压缩为：路线分段（≥2 条时显示「①75%」）+ 每杆一个 chip「1·低杆中力」（杆法 高/低/中 + 塞 左/右 + 力档 小/中/发，阈值与 search.ts buildNote 一致）+ 「连贯 NN% / 本杆 NN%」+ ▶ 播放 + ✕。打开时自动切俯视、禁瞄准、隐藏常规瞄准辅助；关闭恢复原视角与输入。
- **▶ 整链播放**：三杆连续播放，每杆 1.3s、杆间停顿 0.3s；每杆起点用 `snapBallsTo(上一步 PlannedStep.endWorld)` 把全部球网格贴合到无扰动仿真精确终态（被带动的他球也归位，不走落袋动画、不改 lastWorld），末杆播完停留 0.8s 后 `sync(lastWorld)` 复位真实球局。复位而非停留在计划终态是安全取舍：计划世界未经真实输入校验，直接接管球局有状态分叉风险。

### 2.5 灯泡三态常驻（2026-07-28 交付）

- **三态**：`is-lit`=ready（暖色微光，可点击打开）；`is-open`=showing（描边表示展开中，点击=关引导，与提示条 ✕ 等价）；`is-dim`=computing（灰色保留呼吸）/failed/idle（灰色静态，disabled）。
- **常驻保上下文**：玩家回合内按钮始终可见——failed/idle 不再隐藏，玩家能感知「这局没有好方案」而非「功能消失了」；非玩家回合仍 `visibility:hidden`（保 control-deck 网格列稳定，布局不跳）。
- **toggle 语义**：showing 态点 💡 = 关引导；复盘对比展开中点 💡 = 收复盘。

### 2.6 击球复盘「计划 vs 实际」（2026-07-28 交付）

- **捕获点**：`handleCommit` 的 `doShot()` 在 `strikeCueBall` 前快照（克隆世界 + angle/power/spin + 当时 `plans[0].steps[0]`）；对手杆走 useOpponentAI 不经此路，天然只记玩家杆。
- **判定（planner/review.ts）**：结算后把实际杆参数跑一遍 `simulateForDisplay` 无扰动仿真，与计划比对——进球+停位在 zone（凸包+0.05m 容差）= perfect「完美复现」；进球+zone 外 = position-miss，主信号用**母球行程总长差**（±0.2m，碰库反弹拉长行程与力度同向，比停位投影稳健）报「力度偏大/偏小」，行程相近看停位侧向报「杆法没打出来」，洗袋报「力度偏大跟进洗袋」；未进球 = pot-miss，实际切角 vs 计划 cutAngle（±2°）判厚薄、叉积符号判偏袋口左右侧。
- **UI**：折叠态 `.review-chip`「复盘：{诊断} · ▶ 对比」常驻顶部提示条区域（下一杆出杆自动消失；对手杆结算时清除）；▶ 展开 `.review-bar`（verdict 色签+诊断+图例+✕）并切俯视，场景叠加对比渲染——计划=暖橙虚线+停位圆环，实际=母球白/目标球红实线+停位 ✕ sprite。复盘讲上一杆、规划讲下一杆可共存；planOpen 时 chip 让位不渲染。

产品灵魂注解：辅助线和外挂告诉玩家「怎么进」，本功能告诉玩家「为什么这么打」——整链直绘把三杆思路一次性铺在台面上，chip 把每杆压缩成「低杆中力」可复述口令，这是区别于灰产的定位。

---

## 三、功能二「拍照还原球局」方案（未实施）

### 3.1 管线设计

拍照/上传 → **四角手动校准**（用户拖四个角点贴齐桌角，绕过所有开源项目的自动检测翻车点）→ homography 转俯视 BEV → 球检测与花色分类 → **修正界面兜底**（点球切换花色/拖动调位/放白球，10 秒可修完）→ 导入球局 → 复用功能一引擎出走位建议。

### 3.2 球识别路线（按序演进）

- **MVP：视觉 LLM API**（Kimi/Qwen-VL）：俯视校正后的图 → 结构化 JSON（各球 x, y, 花色/号码）。零训练零客户端体积；中式八球只需纯色/花色/黑八分类+号码，比斯诺克简单。代价：需 API key + 轻代理（妙搭静态托管无后端，可用妙搭云函数），有延迟与成本，需隐私提示。
- **V2：客户端传统 CV**（OpenCV.js：Hough 圆 + HSV 颜色分割）：免费离线即时，四角校准+近俯视后精度够用，光照敏感。
- **V3（远期）：蒸馏小模型**（YOLOv8n-seg → ONNX/TF.js 端侧），pix2pockets 级精度（0.4cm），需标注数据。

### 3.3 交互流程（四步全屏卡片）

1. **拍摄引导**：「站在长边正中、手机举高俯拍，拍全整张台」+ 取景框参考线。明确不承诺斜视第一视角全自动（所有 demo 翻车点，用引导规避）。
2. **四角校准**：拖四个角点贴齐桌角。
3. **识别 + 修正**：俯视图上点选球→底部色板改花色，长按拖动微调，白球手动放置。
4. **导入球局**：进入 3D 场景复现，自动弹出规划视图。

入口：主菜单「实拍复盘」。

---

## 四、后续项（明确不在本期）

- 防守/安全球规划（候选为空时目前隐藏按钮）
- key ball / 保险球 / 拆堆 K 球的评分编码（教练法则剩余部分）
- AI 对手「顾燃」换用 planner 引擎（σ 即难度旋钮，替代 planSimpleShot）
- RL/价值网络（唯一值得考虑的位置：小价值网络替代第 2 层搜索，CueTip surrogate 思路）
- zone 透明度视觉调优
