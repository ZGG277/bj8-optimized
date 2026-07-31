# 瓜瓜台球

Vite + React + Three.js 的 3D 中式八球（黑八）单机游戏：240 Hz 确定性物理内核、纯规则状态机、可停留任意高度的第一人称→俯视连续环绕视角、360° 球桌粗瞄 + 幽灵球落位即出现且轻点切换固定精瞄档的无限拨轮、杆法（高低杆与加塞）、动态实力 AI「顾燃」、默认关闭的预测辅助线，以及最高概率方案的逐杆路线展示。顾燃回合会平滑抬升到完整全台观战构图，横向滑动只环绕相机、不改变真实瞄准角，纯视觉按钮可随时回正。

v1.4 采用纯视觉五控件 HUD：视角、灯泡、击球点、蓄力和拨轮均无可见操作文字；视角控件内提供紧凑手动相机图形开关，开启后拖动球桌只改变观察方位、既有推杆继续控制高度，退出后保留画面直到下一次瞄准。触屏长按 340ms（14px 防抖）、鼠标长按 420ms 后由合成层逐帧跟手，靠近右侧或底部 48px 自动吸附并保留沿边落点，同边落到另一控件时直接换位，其他冲突才做最小距离避让；三套响应式布局写入本机。开球先隐藏实体母球，手指在合法区域落实后立即出现无限拨轮；拨轮默认始终是可持续 360° 的粗档，轻点控件才进入或退出固定 1/8 传动的精瞄档，不会因扫过袋口自动改变手感。支持压感的触控笔/屏幕按得越重传动越紧并显示收紧光环，普通触摸和鼠标保持原速度；键盘方向键拨动，Enter/Space 切档。

零出杆记录的新用户首次开始对局会看到可跳过的一行微提示：放好白球后才提示粗瞄，拖动结束且杆向真实变化后才提示轻点拨轮切入精瞄，只有精瞄档真实改变角度后才提示下拉蓄力并松手击球；点击或误触不会越级。顾燃回合只保留轻量观战文案，玩家后续回合按实际操作发现视角、杆法和长按移动控件，但这些可选项不阻塞出杆，任意成功出杆都会安全收起过期提示。微提示按真实尺寸避让对应控件，本体穿透，仅保留有 aria 名称的 44px 弱化 ×；跳过、首局完成或首局结束后写入本机，不再重复打扰。

六个袋口在共享物理几何中使用角袋 100mm、中袋 102mm；角袋/中袋分别向台内切出 8mm/7mm 的半椭圆凹弧，球心连续越过这条弧线即开始落袋，不再要求深入外侧台阶。视觉依据同一参数及真实中式球台照片重构为台内浅凹口、窄幅浅驼皮圈、≤1.8mm 细缝边、六层十八股白色菱形网与后置暗腔，角袋缝边仍以精确角衬锚点跨接并把端头藏入库边。球桌上的主要控件静置时统一以 56% 内容透明度退后，按住、键盘聚焦或拖动时恢复实色，并取消僵硬的独立卡片外框而保留原触控热区。

当前对局提供两种关系：**陪练**按置信度修正后的玩家水平 `+3`，保留走位/复盘；**挑战**按 `+10` 匹配并关闭赛中规划提示。所有真实玩家出杆每三杆批量结算一次，未满批次跨局、刷新保留；只有明确目标球与袋口的进攻杆影响执行精度。顾燃在批次完成后的下一次出杆渐进重定向，每批最多变化 3 分。

视觉语言 v1.3 以“静谧球房”的信息架构、54px 控制轨和手势几何为共同底座，提供三套可即时切换的表达：默认「青瓷」、正式竞技「决赛之夜」、年轻夜场「霓虹球房」。左下角小调色盘展开主题选项，URL `?theme=celadon|noir|neon` 与 `[` / `]` 键也可切换，选择会保存在本机；主题只改视觉，不改游戏逻辑与触控几何。

线上版（飞书妙搭托管）：https://lg22l37ytz.aiforce.cloud/app/app_17b18dh5axj

## 快速开始

```bash
npm install
npm run dev        # 默认 http://localhost:5173，--host 已开
```

## 质量门禁

```bash
npm run check      # typecheck + vitest 单测 + vite build，提交前必过
npm run test:mobile # 390×844 真实触控专项门禁（需先启动下方本地浏览器）
npm run test:pockets-visual # 四机位袋口视觉回归（需先启动下方本地浏览器）
```

- 物理内核单测：`src/physics.test.ts`（含手感指标）+ `src/physics/table-geometry.test.ts`（六袋台内圆弧捕获、安全窗口、擦角、挂袋、侧旋与高速防穿透）
- 规则矩阵：`src/match/match-machine.test.ts`（20 用例）
- 走位规划引擎：`src/planner/planner.test.ts`（几何候选/概率单调性/整链结构/预算封顶）+ `src/planner/bench.test.ts`（仿真耗时基线）
- 精瞄几何：`src/aim/aim-solution.test.ts`（360° 首碰、袋口窗口、遮挡与迟滞）
- 瞄准拨轮：`src/input/aim-dial.test.ts`（默认粗档、显式固定 1/8 精瞄档、压力增益/视觉与普通触摸回退）+ `src/components/AimDial.test.tsx`（粗/精状态与无障碍语义）
- 异步规划取消：`src/planner/async.test.ts`（新请求终止旧 worker、Promise 必结算）
- 跨局结算守卫：`src/hooks/shot-settlement-guard.test.ts`
- 键盘瞄准积分：`src/input/use-shot-input.test.ts`（60/120Hz 等价与速度封顶）
- 加塞停球收敛回归：`src/spin-settle.test.ts`
- 固定步调度器：`src/simulation/fixed-step-runner.test.ts`
- 自适应对手：`src/opponent/model.test.ts`（三杆批量、跨刷新续批、0–100 边界、+3/+10 映射与顾燃限速）
- 控件布局：`src/layout/control-layout.test.ts`（三类布局、自由钳制、沿边落点、碰撞避让、容量拒绝与旧偏移迁移）
- 辅助线偏好：`src/hooks/useAimAssist.test.ts`（首次关闭、损坏回退与安全持久化）
- 首局引导：`src/first-match-guide.test.ts`（误触/角度阈值、真实动作推进、直接出杆收敛、跳过持久化与受限存储回退）
- 观战相机：`src/camera-view.test.ts`（独立视觉方位、各高度 180° 环绕与 390×844 全台安全边界）

## 浏览器回归（可选，需无头 ego lite）

前置：

```bash
npx vite --port 5199 --strictPort &
"/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
  --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
```

然后按需运行（均支持 `GAME_URL` / `BROWSER_URL` 环境变量覆盖）：

| 脚本 | 覆盖 |
|------|------|
| `scripts/verify-desktop-compact.mjs` | 1280×800 双方水平、无文字控件、右侧停靠轨与无溢出（15 断言） |
| `scripts/verify-interaction.mjs` | 真实指针回归门禁（41 断言）：桌面/竖屏/横屏、纯视觉端点、隐藏力度语义、瞄准映射与出杆动画 |
| `scripts/verify-precision-aim.mjs` | 开球虚母球跟手/落实、落位即显示无限拨轮、近袋不自动变档、轻点后显式精瞄与固定低速拨动（8 断言） |
| `scripts/verify-aim-accuracy.mjs` | 经灯泡显式开启后，含 throw 的预测线与真实碰撞方向一致性（19 断言） |
| `scripts/verify-break-group.mjs` | 开球→连续进球→分组端到端（17 断言） |
| `scripts/verify-win8.mjs` | 清台后打进 8 号获胜与庆祝动效（5 断言） |
| `scripts/verify-scoreboard-group.mjs` | 比分板球型图标跟随分组 |
| `scripts/verify-mobile-spinpad.mjs` | 移动端击球点盘布局与球杆造型截图（9 断言） |
| `scripts/verify-mobile-portrait-v12.mjs` | 390×844 辅助线、触屏防抖长按、同边换位、五控件拖放、压力精细度/视觉/普通触摸回退、存储节流与横竖拨轮（23 断言） |
| `scripts/verify-spectator-camera.mjs` | 390×844 顾燃回合自动全台、手动/全局环绕、纯视觉回正、控件避让、触屏锁镜与退出保留视角（14 断言） |
| `scripts/verify-position-plan.mjs` | 最高概率分杆规划与手动复盘集成（34 断言） |
| `scripts/verify-themes.mjs` | 调色盘折叠入口、控件静置透明/按住实色/无框策略、三主题持久化及 1280×800、390×844、844×390 视觉矩阵（26 断言） |
| `scripts/verify-pockets.mjs` | 共享袋口几何、浅驼皮圈/细缝边/白色菱形网及角袋 jaw 无缝衔接的桌面俯视、角袋近景、中袋近景与 390×844 竖屏四帧回归 |
| `scripts/verify-screens.mjs` | 视觉回归截图（shots/01–06） |

截图证据存于 `shots/`。

## 部署（飞书妙搭）

正式构建会生成无外部 chunk 依赖的单 HTML 入口，兼容妙搭将静态资源重定向到签名对象存储的发布方式。

```bash
npm run build
lark-cli apps +html-publish --app-id app_17b18dh5axj --path ./dist --as user
lark-cli apps +release-get --app-id app_17b18dh5axj --release-id <release_id>   # 轮询至 finished
```

## 目录结构

```
src/
  physics.ts        240 Hz 确定性二维台球内核（连续扫掠库边/圆弧角衬与不可返回线）
  physics/          袋口/库边/台内捕获圆弧的单一参数化几何与球球碰撞模型
  aim/              360° 世界角与目标球→袋口局部精瞄纯几何
  match/            中式八球纯规则状态机（开球/分组/犯规/8 号胜负/自由球）
  opponent/         三杆批量玩家画像与陪练/挑战渐进对手档案
  layout/           五控件三类响应式布局、沿边吸附/避让/容量与 v3 持久化
  planner/          走位规划引擎（几何候选→erf→MC→3 层前瞻，含可取消 Web Worker）
  input/            出杆输入层（世界角、手动粗/精双档、帧率无关键盘微调、蓄力与击球点）
  simulation/       固定步调度器与 React 物理循环桥
  camera-view.ts    连续视角纯几何（高度、独立观战方位、全台适配与端点语义）
  Scene3D.ts        Three.js 场景适配器（共享袋口轮廓/袋腔、落袋方向动画、相机与规划渲染）
  components/       HUD 控件（只转发事件，不持有对局状态）
  hooks/            对局编排拆出的 React Hooks（含 usePositionPlan 走位规划预算）
  styles/           base → layout → controls → themes 样式体系
scripts/            浏览器回归脚本
shots/              视觉回归截图证据
```

## 文档约定（GEB）

每个目录有 `CLAUDE.md` 成员清单地图（L1/L2 父子互链），业务文件头部带 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]` L3 契约；改动代码时同步更新最近的 `CLAUDE.md` 与文件头。
