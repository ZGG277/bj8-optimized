# 瓜瓜台球

Vite + React + Three.js 的 3D 中式八球（黑八）单机游戏：240 Hz 确定性物理内核、纯规则状态机、shot/tactical/spectator 显式相机、360° 球桌粗瞄 + 默认固定 1/8 精瞄且可轻点切换的无限拨轮、杆法（高低杆与加塞）、动态实力 AI「顾燃」、默认开启但可记住关闭偏好的预测辅助线，以及按需计算的逐杆路线展示。放好母球、点台落位或有效拖放幽灵球后，相机自动进入对齐杆向的第一人称；抓瞄准线粗调不触发转场。击球时先锁住触球画面 300ms，再自动切回全台观察球局。

手机端默认采用 1.5× 像素比上限、60Hz 运动快照、1024 阴影贴图与低功耗 GPU 偏好；球桌静止且相机/动画收敛后停止空转 rAF。React 到 Three.js 分成 world / aim / visibility / camera 四条去耦通道，纯相机环绕或抬升不重放球位、球杆或阴影。走位 Worker 仅在用户从灯泡菜单显式开启“走位与击球复盘”后启动，顾燃的瞄准容错统一换算到母球真实杆向，并把随机执行误差连续限制在袋口安全窗口内。

v1.4 采用纯视觉五控件 HUD：视角、灯泡、击球点、蓄力和拨轮均无可见操作文字。视角控件上/下端一键切换全台与击球模式，两者分别记住高度和方位；中间图形键只开关全台自由环绕，推杆只调当前模式高度。触屏长按 340ms（14px 防抖）、鼠标长按 420ms 后由合成层逐帧跟手，靠近右侧或底部 48px 自动吸附并保留沿边落点；三套响应式布局写入本机。开球先隐藏实体母球，手指在合法区域落实后立即出现无限拨轮；拨轮首次即为固定 1/8 传动的精瞄档，轻点可退出/再进入粗精档，不会因扫过袋口自动变档。

无论击球或全台视角，点台面或抓幽灵球的单次指针手势都冻结当下真实可见的活相机，屏幕落点与所见画面保持一致；只有所有者指针的有效 aim/ghost 抬指才触发相机转场，副指针、取消和纯粗瞄拖动都不误切视角。幽灵球与母球的最小球心距离为两球直径，进入近球区后保留上一稳定杆向，并以 10% 迟滞带与相邻采样线段跨心检测避免边界抖动、低采样翻向和 NaN 传播。

零出杆记录的新用户首次开始对局会看到可跳过的一行微提示：放好白球后提示粗瞄，杆向真实变化后提示“轻拨拨轮·精细瞄准”，拨轮真实改变角度后才提示下拉蓄力并松手击球；点击或误触不会越级。另有一枚跟随可移动灯泡、会在视口边界自动翻转的一次性提示，告知新用户其中包含“瞄准辅助线 · 走位/击球复盘”；点灯泡或关闭后永久收起，老用户不弹。两类提示本体都穿透交互，只保留 44px 具名关闭热区。

六个袋口在共享物理几何中使用角袋 100mm、中袋 102mm；角袋/中袋分别向台内切出 8mm/7mm 的半椭圆凹弧，球心连续越过这条弧线即开始落袋。视觉在不改几何和 draw call 的前提下，以固定种子程序贴图表达台呢纵向梳毛法线、低频色差和粗糙度，袋口则分层为中性粒面皮圈、护口、斜壁、更深暗腔与白色菱形网；刷新后台呢/皮革纹理可复现，且去掉了约 16MB 的全尺寸临时数组。球桌上的主要控件静置时统一以 56% 内容透明度退后，按住、键盘聚焦或拖动时恢复实色。

当前对局提供两种关系：**陪练**按置信度修正后的玩家水平 `+3`，保留走位/复盘；**挑战**按 `+10` 匹配并关闭赛中规划提示。玩家与顾燃的档案整局锁定，所有真实出杆在胜负确定后才一次结算；只有明确目标球与袋口的进攻杆影响执行精度。顾燃的独立战术 Worker 在硬仿真预算内验证进球/洗袋，挑战模式还会优先保留下一杆候选，不再因通用长搜索超时频繁退化成直接击球。

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
- 走位规划引擎：`src/planner/planner.test.ts`（母球杆向容错/几何候选/概率单调性/整链结构/预算封顶）+ `src/planner/bench.test.ts`（仿真耗时基线）
- 精瞄几何：`src/aim/aim-solution.test.ts`（360° 首碰、袋口窗口、遮挡与迟滞）
- 瞄准拨轮：`src/hooks/useAimInteraction.test.ts`（默认精瞄与有效落位事实）+ `src/input/aim-dial.test.ts`（上层粗/精双档、压力增益/视觉与普通触摸回退）+ `src/components/AimDial.test.tsx`（粗/精状态与无障碍语义）
- 异步规划取消：`src/planner/async.test.ts`（新请求终止旧 worker、Promise 必结算）
- 跨局结算守卫：`src/hooks/shot-settlement-guard.test.ts`
- 键盘瞄准积分：`src/input/use-shot-input.test.ts`（60/120Hz 等价与速度封顶）
- 加塞停球收敛回归：`src/spin-settle.test.ts`
- 固定步调度器：`src/simulation/fixed-step-runner.test.ts`
- 移动渲染预算：`src/render-policy.test.ts`（竖/横屏手机 1.5×、1024 阴影、低功耗 GPU；桌面保持 2×/2048）
- 自适应对手：`src/opponent/model.test.ts` + `src/opponent/tactical-shot.test.ts`（整局一次评估、v1/v2 迁移、0–100 边界、+3/+10 映射、硬预算进球/避免洗袋）
- 控件布局：`src/layout/control-layout.test.ts`（三类布局、自由钳制、沿边落点、碰撞避让、容量拒绝与旧偏移迁移）
- 辅助线偏好：`src/hooks/useAimAssist.test.ts`（首次/损坏存储默认开启、显式关闭与安全持久化）
- 灯泡新用户提示：`src/components/BulbAssistControl.test.tsx`（真新用户门禁、可移动锚点、视口避让与关闭持久化）
- 幽灵球稳定：`src/input/ghost-aim.test.ts`（两球直径安全圆、快速跨心、迟滞、闭边界与 NaN 防线）
- 首局引导：`src/first-match-guide.test.ts`（误触/角度阈值、真实动作推进、直接出杆收敛、跳过持久化与受限存储回退）
- 相机状态机：`src/camera-state.test.ts`（模式记忆、有效落位第一人称→击球保持→结果全景、临时快照、观战交棒与手势锁镜）+ `src/camera-view.test.ts`（各高度环绕与横竖屏全台安全边界）

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
| `scripts/verify-interaction.mjs` | 真实指针回归门禁（48 断言）：桌面/竖屏/横屏、活相机近母球幽灵球拖拽、落位第一人称、键盘出杆原子取消未松指针、结果全景与出杆动画 |
| `scripts/verify-precision-aim.mjs` | 开球虚母球跟手/落实、落位即显示无限拨轮、默认精瞄、近袋不自动变档、轻点粗精切换与固定低速拨动（8 断言） |
| `scripts/verify-aim-accuracy.mjs` | 缺省偏好下默认开启、含 throw 的预测线与真实碰撞方向一致性（19 断言） |
| `scripts/verify-break-group.mjs` | 开球→连续进球→分组端到端（17 断言） |
| `scripts/verify-win8.mjs` | 清台后打进 8 号获胜与庆祝动效（5 断言） |
| `scripts/verify-scoreboard-group.mjs` | 比分板球型图标跟随分组 |
| `scripts/verify-mobile-spinpad.mjs` | 移动端击球点盘布局与球杆造型截图（9 断言） |
| `scripts/verify-mobile-portrait-v12.mjs` | 390×844 辅助线、触屏防抖长按、同边换位、五控件拖放、压力精细度/视觉/普通触摸回退、存储节流与横竖拨轮（23 断言） |
| `scripts/verify-spectator-camera.mjs` | 390×844 shot/tactical/spectator 生命周期、有效落位自动第一人称、全台环绕、观战交棒、活相机锁镜与纯镜头通道耗能（15 断言） |
| `scripts/verify-position-plan.mjs` | 按需 Worker、最高概率分杆规划、关闭后方案快照与手动复盘集成（35 断言） |
| `scripts/verify-themes.mjs` | 调色盘折叠入口、控件静置透明/按住实色/无框策略、三主题持久化及 1280×800、390×844、844×390 视觉矩阵（26 断言） |
| `scripts/verify-pockets.mjs` | 台呢整桌连续 UV、六袋局部 UV、共享袋口几何、浅驼皮圈/细缝边/白色菱形网及角袋 jaw 无缝衔接的四机位回归 |
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
  opponent/         整局玩家画像与陪练/挑战限预算战术对手
  layout/           五控件三类响应式布局、沿边吸附/避让/容量与 v3 持久化
  planner/          走位规划引擎（几何候选→erf→MC→3 层前瞻，含可取消 Web Worker）
  input/            出杆输入层（世界角、手动粗/精双档、帧率无关键盘微调、蓄力与击球点）
  simulation/       固定步调度器与 React 物理循环桥
  camera-state.ts   shot/tactical/spectator 纯状态机与渲染派生状态
  camera-view.ts    连续视角纯几何（高度、全台方位、环绕与位姿）
  Scene3D.ts        Three.js 场景适配器（分离 world/cue/camera 通道、活相机、规划渲染）
  components/       HUD 控件（只转发事件，不持有对局状态）
  hooks/            对局编排拆出的 React Hooks（含相机控制器、Scene 桥接与走位预算）
  styles/           base → layout → controls → themes 样式体系
scripts/            浏览器回归脚本
shots/              视觉回归截图证据
```

## 文档约定（GEB）

每个目录有 `CLAUDE.md` 成员清单地图（L1/L2 父子互链），业务文件头部带 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]` L3 契约；改动代码时同步更新最近的 `CLAUDE.md` 与文件头。
