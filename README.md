# 瓜瓜台球

Vite + React + Three.js 的 3D 中式八球（黑八）单机游戏：240 Hz 确定性物理内核、纯规则状态机、可停留任意高度的第一人称→俯视连续环绕视角、360° 球桌粗瞄 + 幽灵球落位即出现的无限变速拨轮、杆法（高低杆与加塞）、动态实力 AI「顾燃」、默认熄灭的 💡 走位/复盘总开关，以及最高概率方案的逐杆路线展示。

v1.2.0 采用零浪费 HUD：桌面删除产品/回合/杆数顶栏，手机端只保留 34px 单行球组状态；右侧四个单手控件等宽，视角采用可停任意位置的长行程推杆；开球先隐藏实体母球，手指在合法区域拖动半透明预览，落实后立即出现球桌内横向拨轮；拨轮可反复抬手续拨，接近袋口时连续降低传动比。

当前对局提供两种关系：**陪练**按玩家长期能力匹配略弱对手，保留走位/复盘；**挑战**匹配高一档对手并关闭赛中规划提示。玩家能力只从目标明确的非开球样本更新，AI 档案在每局开始生成后锁定，局内不会追着比分升降。

视觉语言 v1.3 在不改变上述信息架构、54px 控制轨与手势几何的前提下，统一为“静谧球房”深绿黑烟熏表面，并借用“竞技仪表”的状态层级、等宽数字和刻度秩序；三案比较与验收边界见 `VISUAL_LANGUAGE_V13.md`。

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
```

- 物理内核单测：`src/physics.test.ts`（含手感指标）
- 规则矩阵：`src/match/match-machine.test.ts`（20 用例）
- 走位规划引擎：`src/planner/planner.test.ts`（几何候选/概率单调性/整链结构/预算封顶）+ `src/planner/bench.test.ts`（仿真耗时基线）
- 精瞄几何：`src/aim/aim-solution.test.ts`（360° 首碰、袋口窗口、遮挡与迟滞）
- 瞄准拨轮：`src/input/aim-dial.test.ts`（粗档、3.8× 接近区连续降速、180px 全袋口精瞄行程）
- 异步规划取消：`src/planner/async.test.ts`（新请求终止旧 worker、Promise 必结算）
- 跨局结算守卫：`src/hooks/shot-settlement-guard.test.ts`
- 键盘瞄准积分：`src/input/use-shot-input.test.ts`（60/120Hz 等价与速度封顶）
- 加塞停球收敛回归：`src/spin-settle.test.ts`
- 固定步调度器：`src/simulation/fixed-step-runner.test.ts`
- 自适应对手：`src/opponent/model.test.ts`（难度归一、防抖、辅助降权、冷启动、模式映射与持久化）

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
| `scripts/verify-desktop-compact.mjs` | 桌面顶栏删除、长行程视角推杆、黑色控制轨与无数字开球控件（14 断言） |
| `scripts/verify-interaction.mjs` | 真实指针回归门禁（41 断言）：桌面/竖屏/横屏三矩阵、瞄准映射、出杆动画 |
| `scripts/verify-precision-aim.mjs` | 开球虚母球跟手/落实、落位即显示无限拨轮、非袋口粗档、3.8× 接近区与精瞄档（8 断言） |
| `scripts/verify-aim-accuracy.mjs` | 含 throw 的预测线与真实碰撞方向一致性（19 断言） |
| `scripts/verify-break-group.mjs` | 开球→连续进球→分组端到端（16 断言） |
| `scripts/verify-win8.mjs` | 清台后打进 8 号获胜与庆祝动效（5 断言） |
| `scripts/verify-scoreboard-group.mjs` | 比分板球型图标跟随分组 |
| `scripts/verify-mobile-spinpad.mjs` | 移动端击球点盘布局与球杆造型截图（9 断言） |
| `scripts/verify-mobile-portrait-v12.mjs` | 竖屏虚母球拖动、落位拨轮、连续视角停留/环绕、整轨编辑、击球点与灯泡总开关（48 断言） |
| `scripts/verify-position-plan.mjs` | 最高概率分杆规划与手动复盘集成（34 断言） |
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
  physics.ts        240 Hz 确定性二维台球内核（不依赖 React/DOM/规则）
  aim/              360° 世界角与目标球→袋口局部精瞄纯几何
  match/            中式八球纯规则状态机（开球/分组/犯规/8 号胜负/自由球）
  opponent/         玩家能力画像与陪练/挑战局间锁定对手档案
  planner/          走位规划引擎（几何候选→erf→MC→3 层前瞻，含可取消 Web Worker）
  input/            出杆输入层（世界角、帧率无关键盘微调、蓄力与击球点）
  simulation/       固定步调度器与 React 物理循环桥
  camera-view.ts    连续视角纯几何（高度、环绕方位、观察轴心与端点语义）
  Scene3D.ts        Three.js 场景适配器（连续环绕相机、瞄准辅助、球杆动画、规划轨迹/走位区域渲染）
  components/       HUD 控件（只转发事件，不持有对局状态）
  hooks/            对局编排拆出的 React Hooks（含 usePositionPlan 走位规划预算）
  styles/           base → layout → controls 样式体系
scripts/            浏览器回归脚本
shots/              视觉回归截图证据
```

## 文档约定（GEB）

每个目录有 `CLAUDE.md` 成员清单地图（L1/L2 父子互链），业务文件头部带 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]` L3 契约；改动代码时同步更新最近的 `CLAUDE.md` 与文件头。
