# Blender 场景第一版 · 本地验收

2026-09-08。基于唯一产品主树 `main@741cae41e7686d989460a2f3feb44de677ea580d` / `v1.5.1`。状态：本地实现、资产验证、完整机器回归和指定浏览器旅程完成；未提交、推送、同步妙搭或发布。Blender 制作文件保留在用户已打开的 Blender 中。

## 实现与边界

- 通过用户配置的 Blender MCP，在 Blender 5.2.1 LTS 中创建独立 `BJ8_Quiet_Room_V1` 场景。交付可编辑 blend、台面几何参考、原创建模脚本、GLB 和来源哈希清单。
- 桌体改为分层木质台裙、六脚底座、金属细边与十八个台帮镶点；新增石材地面、深绿墙面、座椅和薄框长灯。调整实时照明、呢面/库边/木框材质，压暗地面以保持球路优先。
- 新增 `src/scene/studio-environment.ts`，Scene3D 委托其创建环境和照明。资产在开始对局后加载，成功前或失败时保留基础台底/地面，异步结果晚于卸载时释放。灯具显隐遵循实际相机高度。
- 保留共享台面、袋口、库边、球、球杆动画、240Hz 物理、规则、AI、规划及控件行为。本轮没有引入三维碰撞或真实网袋物理。
- Vite 对本 GLB 显式内联。妙搭包装树完全未修改。

## 产物与字节证据

| 对象 | 结果 |
| --- | --- |
| `src/scene/assets/billiards-room-v1.glb` | 651,768 bytes；17 网格，22,860 三角形，无外部纹理或解码器依赖 |
| GLB SHA-256 | `63320ee63b0b616a9387366a770c2e0d9d317c70ba935cb54fe55940bd1ab50f` |
| `dist/index.html` | 2,233,158 bytes，约 2.13 MiB；通过既有 10 MiB 限制 |
| HTML SHA-256 | `78d3b9bf17c40e37a3e8c94d33075ab77b995a9cbe90031bfefeff6227012d39` |
| 制作源 | `assets/blender/billiards-room-v1/quiet-room-v1.blend`；同目录 provenance.json 记录 blend、GLB、参考和作者脚本哈希 |
| 运行时源码 | `shots/scene-blender-v1/source-snapshot.json` 记录源码/构建输入及聚合哈希 |

实际 GLB 解析检查了桌心、半宽 .635m、半长 1.27m 的世界坐标、有限顶点和法线、非退化三角形及可玩台面的安全边界。新外壳实际世界边界为 X ±.739m、Z ±1.374m，顶部最高 .04815m 为木帮镶点。前期发现并修正了薄金属片的倒角退化，并移除远景地砖不必要的倒角，将面数由 36,940 降至 22,860；没有放宽门槛。

## 实测结果

1. 两个工作树在开始时均干净，主树 `npm ls --depth=0` 成功；未安装依赖，package-lock.json 未改变。
2. 唯一一次完整 `npm run check` 成功：47 个 Vitest 文件、352 项测试通过，类型检查及生产构建成功。日志：`shots/scene-blender-v1/check.log`。保留 Vite CJS 弃用和单 chunk 大小提示；单文件交付仍在预算内。
3. `node scripts/verify-scene-asset.mjs` 通过。结果：`asset-verification.json`。
4. `node scripts/verify-blender-scene.mjs`：15 项检查通过。覆盖介绍页零 WebGL/零资产加载、实际 17 网格装配、俯视灯具隐藏、空闲停帧、真实视角控件和鼠标出杆，以及资源失败可玩和卸载竞态。结果：`dev-verification.json`。
5. 既有六袋/四机位检查 8/8、渲染温控 10/10、390×844 真实合成触摸的慢速瞄准与蓄力取消/正常出杆 6/6 通过；各日志为 `pockets.log`、`render-thermal-runner.log`、`control-intent-runner.log`。
6. 关闭开发服务器后，在同一个 `http://127.0.0.1:5199/` 端口运行主树 `vite preview`，`PRODUCTION=1 node scripts/verify-blender-scene.mjs` 10 项通过。浏览器收到的 HTML 字节 SHA-256 与构建一致；两视口均成功进入对局、调整视角，无外部 GLB 请求和页面错误。

浏览器为本机无头 Google Chrome，干净测试页、无登录；桌面 1280×800，手机视口 390×844（含 2× 截图、温控脚本的 3× 设备像素比模拟）。测试服务和浏览器串行运行，任务结束均关闭；原有其他项目的 5173 服务保持原状，用户本来开启的 Blender 保留。

## 图像与局限

- `shots/scene-blender-v1/production-desktop.png`、`production-mobile.png`：最终生产首局全台。
- `production-desktop-low.png`、`production-mobile-low.png`：通过实际视角控件进入低机位的生产画面。
- `pocket-corner-close.png`、`pocket-side-close.png`：开发夹具的袋口机位，已目视检查，不冒充真实进球旅程。
- `blender-viewport.png`：Blender 制作视口；台面/球是制作参照，实时游戏以生产截图为准。

本次是视觉重构，新增房间会增加渲染工作。1280×800 单次静止帧采样从 264 calls / 87,833 triangles 变为 272 / 107,723；该样本不是等热态性能基准。既有温控门禁和帧率上限通过，未据此声称性能提升、真机长期低发热或全设备验收通过。真实手机硬件长时运行、完整整局 AI/规划旅程和正式线上入口未在本轮重新验收。
