# 瓜瓜台球

> 当前唯一产品源码基线：`v1.4.0`（2026-08-31）

Vite + React + Three.js 的 3D 中式八球（黑八）单机游戏：240 Hz 确定性物理内核、纯规则状态机、开局白球标准位自动就绪且可在合法开球区按住拖放、可停留任意高度的第一人称→俯视连续视角、360° 球桌粗瞄 + 默认无限拨轮 + 从灯泡按需切换的方向键、杆法（高低杆与加塞）、动态实力 AI「顾燃」、默认关闭的预测辅助线、按需计算的逐杆路线展示，以及克制的球碰、碰库、进袋和胜局彩炮合成音效。每个真实玩家杆都会生成一个最高优先级诊断，但复盘默认收起，只在灯泡中打开后以“复盘”中性文案显示；未查看规划时只根据玩家自己的目标球/袋口意图诊断，不暴露答案，整局结束再给一个下一局训练目标。陪练和挑战都允许玩家主动使用走位规划；挑战只提高顾燃强度，不替玩家决定是否使用辅助。

渲染层默认使用低功耗 GPU：介绍页保持零 WebGL/零程序化纹理，用户开始对局后才装配 Three.js；手机以 2×/1024/45Hz 提高清晰度，桌面为 1.75×/1536/30Hz。运动中 Scene3D 直接消费物理世界，不再为每个展示帧克隆全世界并重渲染 React HUD；球桌静止且相机/动画收敛后停止空转 rAF。运行中优先使用 WebGL GPU timer（不支持时退化为渲染耗时+掉帧）判断持续高压，带滞回地从均衡档降到 warm/hot，并在窗口变化时重新计算 DPR、阴影和展示帧率。240Hz 物理、规则和输入采样不受降档影响。走位 Worker 仅在用户点亮灯泡后启动，产品预算为 320 次、两层、2.5 秒截止；规划库保留 8000 次默认值只供显式深度调用。

v1.4 采用纯视觉五控件 HUD：视角、灯泡、击球点、蓄力和瞄准均无可见操作文字；视角控件内提供紧凑手动相机图形开关，开启后拖动球桌只改变观察方位、既有推杆继续控制高度，退出后保留画面直到下一次瞄准。默认瞄准槽使用可持续 360° 的拨轮，轻点控件才进入或退出固定 1/8 传动的精瞄档，不会因扫过袋口自动改变手感；灯泡可将其原位切换成球杆左右键，单击按 0.004rad 步长移动，按住 320ms 后以 140ms 间隔低速连续移动。灯泡同时把瞄准线、走位规划、击球复盘和瞄准器作为四个独立开关，复盘初始关闭。其余控件触屏静止长按 340ms、鼠标 420ms 后可调整布局，靠近右侧或底部 48px 自动吸附并保留沿边落点。蓄力沿出杆方向仍可拉到屏幕边缘，横向或反方向移出有效走廊再松手会取消出杆。

零出杆记录的新用户首次开始对局会看到可跳过的一行微提示：白球已自动在标准位就绪，进入瞄准后的首条稳定提示是拖动球桌粗瞄，随后提示拨动瞄准轮微调，真实改变角度后再提示下拉蓄力并松手击球；点击或误触不会越级。顾燃回合只保留轻量观战文案，玩家后续回合按实际操作发现视角、杆法和长按移动控件，但这些可选项不阻塞出杆，任意成功出杆都会安全收起过期提示。微提示按真实尺寸避让对应控件，本体穿透，仅保留有 aria 名称的 44px 弱化 ×；跳过、首局完成或首局结束后写入本机，不再重复打扰。

六个袋口在共享物理几何中使用角袋 100mm、中袋 102mm；角袋/中袋分别向台内切出 8mm/7mm 的半椭圆凹弧，球心连续越过这条弧线即开始落袋，不再要求深入外侧台阶。视觉依据同一参数重构为台内浅凹口、下沉进木帮的浅驼皮护口、沿同一曲线向下包住袋腔的皮裙、≤1.8mm 细缝边、六层十八股白色菱形网与后置暗腔；六袋护口都穿过两侧 jaw 锚点并把端头藏入库边，俯视不再出现悬空月牙与袋腔偏心。球桌上的主要控件静置时统一以 56% 内容透明度退后，按住、键盘聚焦或拖动时恢复实色，并取消僵硬的独立卡片外框而保留原触控热区。

当前对局提供两种关系：**陪练**按置信度修正后的玩家水平 `+3`，**挑战**按 `+10` 匹配；两种关系都保留玩家主动控制的走位/复盘开关。规划计算中会立即显示状态，当前局面没有可靠直攻路线时也会明确说明，不再表现成按钮失效。玩家与顾燃的档案整局锁定，所有真实出杆在胜负确定后才一次结算；只有明确目标球与袋口的进攻杆影响执行精度。顾燃的独立战术 Worker 在硬仿真预算内验证进球/洗袋，挑战模式还会优先保留下一杆候选。

视觉语言 v1.3 以“静谧球房”的信息架构、54px 控制轨和手势几何为共同底座，提供三套可即时切换的表达：默认「青瓷」、正式竞技「决赛之夜」、年轻夜场「霓虹球房」。左下角小调色盘展开主题选项，URL `?theme=celadon|noir|neon` 与 `[` / `]` 键也可切换，选择会保存在本机；主题只改视觉，不改游戏逻辑与触控几何。

既有线上版（飞书妙搭托管；本次 `v1.4.0` 尚未发布，线上版本可能较早）：https://lg22l37ytz.aiforce.cloud/app/app_17b18dh5axj

## 源码与版本约定

- GitHub 唯一权威仓库：https://github.com/ZGG277/bj8-optimized
- 日常开发只使用 `main`；可交付基线用带注释的 `v*` 标签固定。
- `guagua-pool-share` 仅保留为 `v1.4.0` 公开分享快照，不再作为开发源或接收独立修改。
- 历史实验线保留在 `archive/*` 分支、预整合远端分支与本地 Git bundle 中；不再保留第二份可编辑产品源码。
- 完整对账与恢复规则见 `docs/REPOSITORY-CONSOLIDATION.md`。
- Kimi Code 案例文章与图片位于 `docs/case-study/`。

## 快速开始

```bash
npm ci
npm run dev        # 默认 http://localhost:5173，--host 已开
```

## 质量门禁

```bash
npm run check      # typecheck + vitest 单测 + vite build，提交前必过
npm run test:mobile # 390×844 真实触控专项门禁（连接下方 :5199 / :9333）
npm run test:control-intent # 慢速瞄准手势互斥与蓄力移出取消
npm run test:render-thermal # 介绍页零 WebGL、桌面 GPU 温控、空闲停帧、帧率上限与手机 2× 清晰度
npm run test:pockets-visual # 四机位袋口视觉回归（连接下方 :5199 / :9333）
```

- 物理内核单测：`src/physics.test.ts`（含手感指标）+ `src/physics/table-geometry.test.ts`（六袋台内圆弧捕获、安全窗口、擦角、挂袋、侧旋与高速防穿透）
- 规则矩阵：`src/match/match-machine.test.ts`（含“只进对方花色须换人”双向回归）
- 走位规划引擎：`src/planner/planner.test.ts`（母球杆向容错/几何候选/概率单调性/整链结构/预算封顶）+ `src/planner/bench.test.ts`（仿真耗时基线）
- 精瞄几何：`src/aim/aim-solution.test.ts`（360° 首碰、袋口窗口、遮挡与迟滞）
- 瞄准拨轮：`src/input/aim-dial.test.ts`（默认粗档、显式固定 1/8 精瞄档、压力增益/视觉与普通触摸回退）+ `src/components/AimDial.test.tsx`（粗/精状态与无障碍语义）
- 异步规划取消：`src/planner/async.test.ts`（新请求终止旧 worker、Promise 必结算）
- 跨局结算守卫：`src/hooks/shot-settlement-guard.test.ts`
- 键盘瞄准积分：`src/input/use-shot-input.test.ts`（60/120Hz 等价与速度封顶）
- 加塞停球收敛回归：`src/spin-settle.test.ts`
- 固定步调度器：`src/simulation/fixed-step-runner.test.ts`
- 渲染预算：`src/render-policy.test.ts` + `src/thermal-governor.test.ts`（手机 2×/1024/45Hz，warm/hot 为 1.5×/30Hz、1.25×/24Hz；桌面 1.75×/1536/30Hz；带活动滞回与停帧静置恢复）
- 自适应对手：`src/opponent/model.test.ts` + `src/opponent/tactical-shot.test.ts`（整局一次评估、v1/v2 迁移、0–100 边界、+3/+10 映射、硬预算进球/避免洗袋）
- 控件布局：`src/layout/control-layout.test.ts`（三类布局、自由钳制、沿边落点、碰撞避让、容量拒绝与旧偏移迁移）
- 控件手势意图：`src/components/ControlDeck.test.ts` + `src/components/ShootControl.test.ts`（内容位移与静止长按布局互斥、蓄力走廊移出取消）
- 辅助线偏好：`src/hooks/useAimAssist.test.ts`（首次关闭、损坏回退与安全持久化）
- 首局引导：`src/first-match-guide.test.ts`（误触/角度阈值、真实动作推进、直接出杆收敛、跳过持久化与受限存储回退）
- 观战相机：`src/camera-view.test.ts`（顾燃观战锁定、竖屏纵台/横屏横台、玩家非俯视杆向跟随与全台安全边界）

## 浏览器回归（可选）

多数脚本连接一个已启动的无头 ego lite；默认游戏地址为 `:5199`、调试地址为 `:9333`：

```bash
npx vite --port 5199 --strictPort &
"/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
  --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
```

所有脚本均支持 `GAME_URL` 覆盖。连接型脚本另支持 `BROWSER_URL`；`verify-render-thermal.mjs` 与 `verify-control-intent.mjs` 自行启动 Chrome，不使用 `BROWSER_URL`，可用 `PUPPETEER_EXECUTABLE_PATH` 指定浏览器。然后按需运行：

| 脚本 | 覆盖 |
|------|------|
| `scripts/verify-render-thermal.mjs` | 桌面空闲停帧、Retina DPR、最终 WebGL 帧上限、GPU 负载快照、温控合成降级与手机 2× 绘制缓冲区（10 断言） |
| `scripts/verify-control-intent.mjs` | 390×844 慢速瞄准跨过长按时限不移动布局、蓄力横向移出取消与正常出杆回归 |
| `scripts/verify-desktop-compact.mjs` | 1280×800 双方水平、无文字控件、右侧停靠轨与无溢出（15 断言） |
| `scripts/verify-interaction.mjs` | 真实指针回归门禁（41 断言）：桌面/竖屏/横屏、纯视觉端点、隐藏力度语义、瞄准映射与出杆动画 |
| `scripts/verify-precision-aim.mjs` | 白球标准位自动就绪、默认拨轮、灯泡四开关、方向键切换、单击/长按与显式粗精档 |
| `scripts/verify-aim-accuracy.mjs` | 经灯泡显式开启后，含 throw 的预测线与真实碰撞方向一致性（19 断言） |
| `scripts/verify-break-group.mjs` | 开球→连续进球→分组端到端（17 断言） |
| `scripts/verify-win8.mjs` | 开球分组、清台后打进 8 号获胜、庆祝动效与结算摘要（6 断言） |
| `scripts/verify-scoreboard-group.mjs` | 比分板球型图标跟随分组 |
| `scripts/verify-mobile-spinpad.mjs` | 移动端击球点盘布局与球杆造型截图（9 断言） |
| `scripts/verify-mobile-portrait-v12.mjs` | 390×844 辅助线、触屏防抖长按、同边换位、五控件拖放、压力精细度/视觉/普通触摸回退、存储节流与横竖拨轮（23 断言） |
| `scripts/verify-spectator-camera.mjs` | 390×844 纵台与 1280×800 横台固定俯视、观战滑动锁定、玩家非俯视杆向跟随、手动视角与触屏锁镜 |
| `scripts/verify-position-plan.mjs` | 最高概率分杆规划、复盘默认收起/独立开关、中性文案与手动轨迹对比 |
| `scripts/verify-themes.mjs` | 调色盘折叠入口、控件静置透明/按住实色/无框策略、三主题持久化及 1280×800、390×844、844×390 视觉矩阵（26 断言） |
| `scripts/verify-pockets.mjs` | 前探鼻尖/下沿内凹库边、共享袋口几何、浅驼皮圈/细缝边/白色菱形网及角袋 jaw 无缝衔接的桌面俯视、角袋近景、中袋近景与 390×844 竖屏四帧回归 |
| `scripts/verify-screens.mjs` | 视觉回归截图（shots/01–06） |

截图证据存于 `shots/`。

## 妙搭产物交接

正式构建会生成无外部 chunk 依赖的单 HTML 入口。主仓只负责构建和验收；飞书包装必须从已提交、带版本标签且工作区干净的主仓产物单向同步，不能从这里直接发布 `dist/`。

```bash
npm run check
cd ../bj8-miaoda-app
npm run sync:game
```

同步会在包装内生成 `client/public/game/BUILD_PROVENANCE.json`，记录主仓提交、精确标签与单 HTML 的 SHA-256；它不等于发布。发布须在 `bj8-miaoda-app` 中按其 README 操作，并另行取得发布授权和完成真实浏览器验收。

## 目录结构

```
src/
  physics.ts        240 Hz 确定性二维台球内核（连续扫掠库边/圆弧角衬与不可返回线）
  physics/          袋口/库边/台内捕获圆弧的单一参数化几何与球球碰撞模型
  aim/              360° 世界角与目标球→袋口局部精瞄纯几何
  match/            中式八球纯规则状态机（开球/分组/犯规/8 号胜负/自由球）
  opponent/         整局玩家画像与陪练/挑战限预算战术对手
  layout/           五控件三类响应式布局、沿边吸附/避让/容量与 v3 持久化
  planner/          走位规划引擎（几何候选→erf→MC→3 层前瞻，含可取消 Web Worker）
  input/            出杆输入层（世界角、手动粗/精双档、帧率无关键盘微调、蓄力与击球点）
  simulation/       固定步调度器与 React 物理循环桥
  camera-view.ts    连续视角纯几何（观战横竖屏固定俯视、玩家杆向跟随与全台适配）
  thermal-governor.ts GPU 负载窗口与三档滞回温控状态机
  Scene3D.ts        Three.js 场景适配器（共享袋口、最终帧上限、GPU timer 与自适应温控）
  components/       HUD 控件（只转发事件，不持有对局状态）
  hooks/            对局编排拆出的 React Hooks（含 usePositionPlan 走位规划预算）
  styles/           base → layout → controls → themes 样式体系
scripts/            浏览器回归脚本
shots/              视觉回归截图证据
```

## 文档约定（GEB）

主要源码目录有 `CLAUDE.md` 成员清单地图（L1/L2 父子互链），业务文件头部带 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]` L3 契约；改动代码时同步更新最近的 `CLAUDE.md` 与文件头。
