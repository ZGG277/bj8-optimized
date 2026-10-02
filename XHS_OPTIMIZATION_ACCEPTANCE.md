# 小红书瓜瓜台球优化与本地验收 · 2026-10-02

状态：本地实现与验收通过；未提交、推送或发布。小红书原生分享、客户端覆盖升级未验收。

## 入口与版本

- 本地预览：http://127.0.0.1:5218/dist-minitool/ 。点击「开始对局」，右侧最上方按钮切换俯视。
- 源码唯一主线：bj8-main-integration；HEAD `8280ad4f94558f6aa2a1d7d373d35238018dd895`（v1.7.4），保留原有未提交适配，不冒充纯标签构建。
- 包：`artifacts/guagua-billiards-xhs-minitool-v1.7.4-xhs.20261002.zip`，1,162,647 字节（约 1.11 MiB）。相对原 v1.7.1 的 4,161,578 字节缩小 72.1%。
- ZIP SHA-256：`50e6495b540b5afe9414ae124c3a1f850615ddf74c5021cb3f7c52b8dabe8dc2`。
- 源码聚合指纹：`27f93b272a3e93c6b80833e16cbb11230f8f8799b8dda09fb163a69ae854197d`；逐文件记录在包内 BUILD_PROVENANCE.json，已核对零不一致。
- ZIP 与实际预览 dist-minitool 文件逐一相同。正式包不含 __bj8 验收入口；fixture 使用单独 preview 构建。
- 预览服务：本任务 PID 61041，127.0.0.1:5218，工作目录为本主线；带小工具 CSP，保留至用户验收。重启：`python3 scripts/serve-minitool-preview.py --port 5218`。

## 实现

1. 相机：8px 基础留白、4px 控件间隔；同一构图函数服务渲染和拾取。横屏悬浮比分栏也参与避让，避免上沿袋口被盖住。默认手机几何回归确认全台投影宽度增加超过 3.5%；不承诺在所有屏幕比例下填满两轴。
2. 建模：原始 GLB/Blender 源不变；2.5m 距离及迟滞控制针脚 LOD，远景省去 16,640 三角形，近景恢复原细节，包边/袋口/物理边界保留。单测与浏览器验证远近切换。不是实机 FPS 或功耗提升结论。
3. 场景资源：当前主线公开入口为室内、云海、湖面，小工具只打包这三项；历史星系/竹林/极光源码和模型仍保留。主要包体收益来自不可达历史资源剔除，非重压缩全部模型。
4. 计算：走位/对手搜索改为同一可迭代实现，普通 Worker 同步消费，小工具在候选/路线边界让出主线程并支持取消。搜索预算、随机顺序和规则保持不变。8ms 是调度目标，单个候选/路线仍可超过它，低端真机长任务需后续测量。
5. 分享：胜局按钮 → 720×960 本地 JPEG 卡片（约 46KB）→ 玩家点击 postNote → 小红书编辑/发布/取消。无网络、额外 SDK、自动发笔记或 WebGL preserveDrawingBuffer。防重复点击、取消、失败重试、卸载保护均覆盖。网页预览明确提示在小红书内分享；小工具不再展示依赖妙搭包装的留言入口。
6. 结构：平台分享和合作式调度独立在 minitool；公开场景注册表共用，FOV 仅保留一个来源；未重写 Game/Scene3D、未引入依赖。

分享接口依据：[小红书小工具容器能力清单](https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8323q4m0uaga06277180ac7t8006ptl0e12ek1g)（页面更新 2026-08-11）；离线包同时按 minitool-zip-builder 1.2.0 三份规范执行。

## 旧用户存档：必守约束

- 没有修改存储键、版本、读取/保存代码，没有调用清库或重置存档。
- 保留 player-skill:v3 的等级、累计统计，control-layout:v3 的三个视口布局，以及 learned-controls:v1、first-match-guide:v1、aim-assist:v1、bj8-ui-theme；旧 v1/v2 画像仍可读取。
- 同源浏览器内从原 v1.7.1 ZIP 切换至候选，再进入对局，7 项测试记录保持原值：61 级、42 局、321 杆、自定义拨轮 x=.43/y=.87、学习记录、引导完成、辅助偏好、主题及未知记录哨兵。为合成测试档，不涉及实际小红书账号。
- 正式发布必须更新原小工具、保持同一应用身份与存储空间，不新建替代应用、不清容器数据。真实客户端覆盖升级仍需用已有存档的测试账号验证。不能把同源浏览器验证说成已完成客户端升级验收。

## 验收证据

- `npm ls --depth=0` 成功；未安装依赖，package-lock.json 未修改。
- `npm run check`：62 文件 / 415 项通过、常规构建通过，见 `artifacts/xhs-optimization-20261002/check.log`。随后横屏避让修复补跑 typecheck 与 37 项相机测试全部通过（其中新增一项比分栏回归）。最终小工具构建和规范扫描通过。
- Chrome 153.0.8010.54，隔离浏览器配置，无登录；同一预览服务器和实际 dist-minitool。
- 390×844、844×390、1280×800：整台与六袋在可视区域，袋口无控件/比分栏遮挡，无横向溢出，拨轮可操作。
- 正式产物三个场景逐一进入、WebGL 可用，真实触摸切换拨轮、Enter 出杆触发物理运动；无外部请求，无页面/控制台错误。
- 分享使用隔离的玩家获胜 fixture 和 mock 原生 SDK：败局不显示、预览、无 SDK 降级、重复点击阻止、取消、失败重试、成功回执、再来一局均通过。未通过调试入口伪造「完整打赢一局」或「真实发笔记」结论。
- 复现最终浏览器验收：预览服务运行时执行 `node scripts/verify-minitool-final.mjs`。浏览器在 finally 中关闭。
- 机器回执：`artifacts/xhs-optimization-20261002/final-browser-acceptance.json`、`storage-upgrade.json`、`layout-matrix.json`、`share-scenarios.json`。
- 最终截图：`production-studio-390.png`、`production-cloud-sea-390.png`、`production-lake-390.png`、`candidate-844x390.png`、`candidate-1280x800.png`、`victory-share-390.png`（均在证据目录）。逐张检查后修复了横屏比分栏遮挡和分享次按钮层级。
- Ego 截图通道异常的画面已排除并移除；以上最终截图由项目隔离 Chrome 验收重新采集。

## 保全与未验证项

- 修改前源码备份：`artifacts/xhs-optimization-20261002/source-before.zip`；原工作区补丁：`working-tree-before.patch`。
- 原 v1.7.1 ZIP 未改，SHA-256 仍为 `e8c68d55006e7b01e35d56aed4567796e19e3045cb533a9ac5d43725b4f6249e`。
- 不涉及其他项目、妙搭包装树、历史归档、提交、推送、外部通知或发布。
- 待真实小红书 iOS/Android 容器验证：postNote 页面唤起/编辑/取消、覆盖升级存档、安全区和低端设备持续性能；平台审核与实际发布均未发生。
