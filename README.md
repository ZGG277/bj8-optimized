# 瓜瓜台球

> 当前正式项目基线：`v1.7.2`（2026-09-10），公开世界收敛为静谧球房、云海浮台和安静湖面，修复湖面参数覆盖、球桌布边/中袋外壳，并建立顾燃低中高实力梯度；Git 与妙搭发布、桌面及 390×844 正式入口验收均已完成。发布证据见 [PROJECT_BASELINE.md](PROJECT_BASELINE.md)。

局前现在只公开静谧球房、云海浮台与安静湖面；`?world=` 链接预选世界，湖面兼容 `?lake360=1`，切回室内或云海会清除湖面覆盖。宇宙、竹林与极光资产及可编辑源继续保留，当前不出现在玩家入口；历史验收见 [WORLD_SCENES_V3_ACCEPTANCE.md](WORLD_SCENES_V3_ACCEPTANCE.md)。

首次打开且没有任何对局记录时，玩家与两种模式的顾燃都从 25 级开始；顾燃有效实力不超过 50 时，无可靠直攻路线也会继续尝试进攻，不主动选择安全球，51 级起才解锁安全球回退。击球后的目标近景回全台改为约 1.4 秒缓入缓出，降低突然拉远的跳变感。

Blender 球房第一版：独立桌体外壳、六脚底座、台帮镶点、石材地面、深绿墙面和长灯；保留既有台面/袋口物理、球杆、相机与控件。GLB 在开始对局后加载，失败保留基础场景；构建继续生成单 HTML。制作源在 `assets/blender/billiards-room-v1/`，验证见 `SCENE_BLENDER_V1_ACCEPTANCE.md`。

台内精修 V2：台呢与库边统一使用 160mm 细织纹；六袋增加 Blender 实体双道针脚与细包边、细皮革表面；球号清晰度、六点白球及贴地接触阴影便于观察实际滑动/滚动。沿用现有物理摩擦、球半径和袋口捕获几何。制作源在 `assets/blender/table-craft-v2/`，当前验证见 `TABLE_CRAFT_V2_ACCEPTANCE.md`。

既有 v1.5.1 行为：在普通击球后继续保留已锁定的目标球/袋口近景，目标球落袋或运动后停下才短暂停留并平滑回全台；开球或没有可靠目标时仍直接回全台。手机端触摸任一控件就会在该控件旁显示对应操作说明，原本的瞄准、蓄力或点击手势照常执行，松手后说明短暂停留；控件同时取消可取消的 Pointer/contextmenu 浏览器默认行为。

v1.5.1 功能：每个按钮提供鼠标悬停/键盘聚焦的新手提示，优先出现在按钮左侧；贴左屏边时移至上方，避免出屏或遮住按钮。一般控件成功操作后不再提示，进度保存在当前浏览器；俯视、手动视角和出杆三个控件另外保留常驻的悬停功能说明，已学会也可查看，手动视角文案跟随开关状态、出杆文案跟随停靠方向。取消、禁用或没有实际变化的动作不计为学会；触屏则不依赖学习状态，每次触摸都在当前控件旁直接说明，松手后自动收起。专项本地验证见 `CONTROL_HOVER_ACCEPTANCE.md`。

袋口包边改为共享木框裁口、闭合护口/皮裙实体和实际库边端座，修复后弧漏空、端头折叠与悬空；不扩大物理袋口，不封闭入球通道。定向几何及完整348项测试通过，实施与截图证据见 `POCKET_TRIM_IMPLEMENTATION.md` 和 `shots/pocket-trim-release-20260905/central-acceptance.md`。

放置瞄准幽灵球并抬手确认后，自动为白球、首碰目标球与候选袋口求解完整可见的出杆构图：优先低机位，根据视口与贴边控件安全区后退/抬高；没有可靠目标时回退到 16% 稍高出杆位，不改杆向。重新摆实体白球不触发切镜。真实击球后先跟随已锁定目标球与袋口，进袋或未进结果可见后再恢复全台；电脑横屏横向放台、手机竖屏纵向放台，并按木帮外缘求紧密拟合。手动视角仍可用，下一次幽灵球落位或击球恢复自动流程。

本轮执行方案见 [OPTIMIZATION_EXECUTION_PLAN.md](OPTIMIZATION_EXECUTION_PLAN.md)，当前验收与限制见 [OPTIMIZATION_ACCEPTANCE.md](OPTIMIZATION_ACCEPTANCE.md)。本地优化加入全时间区间球球 CCD、步内事件顺序、接触岛求解、中杆初始滑动和侧旋冲量耦合；未进行真实球台参数标定，二维袋口捕获弧仍保留。不能把本地实现/验收视作已发布。

袋网改为每袋一个合并的实体绳索 Mesh。落袋消费事件里的位置、速度与角速度，先连续导入袋腔、再按重力下落，始终保持球尺寸；轨迹与可见袋腔共用剖面，零角速度不伪造旋转。导入段是视觉近似，不是袋壁碰撞或软网物理。全台避让采用整组相机平移，保留横/纵台方向，默认自由停靠的底部拨轮也纳入安全区。

Vite + React + Three.js 的 3D 中式八球（黑八）单机游戏：240 Hz 确定性物理内核、纯规则状态机、开局白球标准位自动就绪且可点击或拖到合法开球区重放、可停留任意高度的第一人称→俯视连续视角、360° 球桌粗瞄 + 默认无限拨轮 + 从灯泡按需切换的方向键、杆法（高低杆与加塞）、动态实力 AI「顾燃」、默认展示且可关闭的预测辅助线、按需计算的逐杆路线展示，以及克制的球碰、碰库、进袋和胜局彩炮合成音效。每个真实玩家杆都会生成一个最高优先级诊断，但复盘默认收起，只在灯泡中打开后以“复盘”中性文案显示；未查看规划时只根据玩家自己的目标球/袋口意图诊断，不暴露答案，整局结束再给一个下一局训练目标。陪练和挑战都允许玩家主动使用走位规划；挑战只提高顾燃强度，不替玩家决定是否使用辅助。

渲染层默认使用低功耗 GPU：介绍页保持零 WebGL/零程序化纹理，用户开始对局后才装配 Three.js；手机以 2×/1024/45Hz 提高清晰度，桌面为 1.75×/1536/30Hz。运动中 Scene3D 直接消费物理世界，不再为每个展示帧克隆全世界并重渲染 React HUD；球桌静止且相机/动画收敛后停止空转 rAF。运行中优先使用 WebGL GPU timer（不支持时退化为渲染耗时+掉帧）判断持续高压，带滞回地从均衡档降到 warm/hot，并在窗口变化时重新计算 DPR、阴影和展示帧率。240Hz 物理、规则和输入采样不受降档影响。走位 Worker 仅在用户点亮灯泡后启动，产品预算为 320 次、两层、2.5 秒截止；规划库保留 8000 次默认值只供显式深度调用。

v1.4 采用纯视觉五控件 HUD：视角、灯泡、击球点、蓄力和瞄准均无可见操作文字；视角控件内提供紧凑手动相机图形开关，开启后拖动球桌只改变观察方位、既有推杆继续控制高度，退出后保留画面直到下一次瞄准。默认瞄准槽使用可持续 360° 的拨轮，轻点控件才进入或退出固定 1/8 传动的精瞄档，不会因扫过袋口自动改变手感；灯泡可将其原位切换成球杆左右键，单击按 0.004rad 步长移动，按住 320ms 后以 140ms 间隔低速连续移动。灯泡同时把瞄准线、走位规划、击球复盘和瞄准器作为四个独立开关，复盘初始关闭。其余控件触屏静止长按 340ms、鼠标 420ms 后可调整布局，靠近右侧或底部 48px 自动吸附并保留沿边落点。蓄力沿出杆方向仍可拉到屏幕边缘，横向或反方向移出有效走廊再松手会取消出杆。

零出杆记录的新用户首次开始对局会看到可跳过的一行微提示：白球已自动在标准位就绪，进入瞄准后的首条稳定提示是拖动球桌粗瞄，随后提示拨动瞄准轮微调，真实改变角度后再提示下拉蓄力并松手击球；点击或误触不会越级。顾燃回合只保留轻量观战文案，玩家后续回合按实际操作发现视角、杆法和长按移动控件，但这些可选项不阻塞出杆，任意成功出杆都会安全收起过期提示。微提示按真实尺寸避让对应控件，本体穿透，仅保留有 aria 名称的 44px 弱化 ×；跳过、首局完成或首局结束后写入本机，不再重复打扰。

六个袋口在共享物理几何中使用角袋 100mm、中袋 102mm；角袋/中袋分别向台内切出 8mm/7mm 的半椭圆凹弧，球心连续越过这条弧线即开始落袋，不再要求深入外侧台阶。视觉依据同一参数重构为台内浅凹口、下沉进木帮的浅驼皮护口、沿同一曲线向下包住袋腔的皮裙、≤1.8mm 细缝边、六层十八股白色菱形网与后置暗腔；六袋护口都穿过两侧 jaw 锚点并把端头藏入库边，俯视不再出现悬空月牙与袋腔偏心。球桌上的主要控件静置时统一以 56% 内容透明度退后，按住、键盘聚焦或拖动时恢复实色，并取消僵硬的独立卡片外框而保留原触控热区。

当前对局提供两种关系：首次无记录时双方均从 **25** 起步；建立对局记录后，**陪练**按置信度修正后的玩家水平 `+3`，**挑战**按 `+10` 匹配。两种关系都保留玩家主动控制的走位/复盘开关。规划计算中会立即显示状态，当前局面没有可靠直攻路线时也会明确说明，不再表现成按钮失效。玩家与顾燃的档案整局锁定，所有真实出杆在胜负确定后才一次结算；只有明确目标球与袋口的进攻杆影响执行精度。顾燃的独立战术 Worker 在硬仿真预算内验证进球/洗袋，挑战模式还会优先保留下一杆候选；有效实力 50 及以下禁用主动安全球回退。

视觉语言 v1.3 以“静谧球房”的信息架构、54px 控制轨和手势几何为共同底座，保留默认「青瓷」、正式竞技「决赛之夜」、年轻夜场「霓虹球房」三套表达。玩家界面不再显示调色盘入口；已有 URL `?theme=celadon|noir|neon`、`[` / `]` 键与本机偏好继续生效。主题只改视觉，不改游戏逻辑与触控几何。

正式线上入口（飞书妙搭托管；本次 release 回执 URL）：https://lg22l37ytz.feishuapp.com/app/app_17b18dh5axj

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
- 辅助线偏好：`src/hooks/useAimAssist.test.ts`（首次开启、显式关闭恢复、损坏回退与安全持久化）
- 首局引导：`src/first-match-guide.test.ts`（误触/角度阈值、真实动作推进、直接出杆收敛、跳过持久化与受限存储回退）
- 观战相机：`src/camera-view.test.ts`（顾燃观战锁定、竖屏纵台/横屏横台、玩家非俯视杆向跟随与全台安全边界）
- 自动瞄准视角：`src/hooks/useAimInteraction.test.tsx`（幽灵球抬手确认、取消/桌外点/摆白球不误切镜）
- 击球近景时序：`src/shot-camera-follow.test.ts`（目标球未触球不误结束、运动后停止、落袋与整杆停止回退）
- 逐控件提示：`src/control-onboarding.test.ts` + `src/components/ControlOnboarding.test.tsx`（成功后独立持久化、容错、左侧定位与边缘避让）

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
| `scripts/verify-shot-camera-help.mjs` | 390×844 触摸控件就地说明、长按默认行为取消与目标球近景→全台时序 |
| `scripts/verify-position-plan.mjs` | 最高概率分杆规划、复盘默认收起/独立开关、中性文案与手动轨迹对比 |
| `scripts/verify-themes.mjs` | 调色盘折叠入口、控件静置透明/按住实色/无框策略、三主题持久化及 1280×800、390×844、844×390 视觉矩阵（26 断言） |
| `scripts/verify-pockets.mjs` | DEV 场景同源木框、一体护口/皮裙最终壳体闭合及四机位截图；需 DEV 句柄，生产入口另行真实验收，承托与面域不靠元数据自证 |
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
