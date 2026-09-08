# 瓜瓜台球项目基线

2026-09-08：v1.6.0 发布候选已完成本地验收，正在按用户授权发布；线上验收完成后更新本记录。

## 版本范围

- 主线：`bj8-main-integration/`，GitHub `ZGG277/bj8-optimized` 的 `main`；可交付源码以带注释的 `v1.6.0` 标签固定。
- 前次基线：`v1.5.1` / `741cae41e7686d989460a2f3feb44de677ea580d`。
- 本版：Blender 球房、独立桌体和底座，台呢与库边细织纹，球体树脂反光和六点母球，六袋皮革、520 段双道针脚与细包边，球底接触阴影。
- 延续既有 240Hz 物理、摩擦系数、球半径、碰撞及袋口捕获几何、规则、AI、相机和输入。
- Blender 可编辑制作源位于 `assets/blender/`；运行时 GLB 位于 `src/scene/assets/`，构建继续输出单 HTML。

## 本地证据

完整 `npm run check`：类型检查、48 个测试文件 / 358 项测试、生产构建通过。功能冻结后的完整结果见 `shots/table-craft-v2/check.log`，定向与真实浏览器验证见 `TABLE_CRAFT_V2_ACCEPTANCE.md`；版本号更新仅修改 package 和 lock 根元数据，发布构建另行核对。

v1.6.0 版本元数据更新后的生产构建通过，HTML 与此前已验收构建逐字节一致：2,892,342 bytes，SHA-256 `56e1bb5782c50d75ed14bea32129c1f781f5cb68fa566b86498b22f44a499cea`。发布源码指纹为 `7795bbb03b56ca7c720d3ba18d8a6272dbbe692d62ef8e51ceef68b184b87021`；相对功能验收指纹仅 package 和 lock 根版本从 1.5.1 更新为 1.6.0，依赖未改变。

台内 V2 浏览器检查 19/19，生命周期补验 2/2，既有袋口 8/8，温控 10/10，最终本地生产入口 10/10。完整 AI 整局、音效和真实手机长时间发热未在本版重新测试。

## 发布约定

妙搭只从已提交、已加精确版本标签且干净的主树执行 `npm run sync:game`。`bj8-miaoda-app` 的 `sprint/default` 消费产物，`BUILD_PROVENANCE.json` 记录源码提交、标签和 HTML SHA-256。线上验收必须从固定正式入口进入，核对实际 iframe 字节和 provenance，覆盖桌面 1280×800、手机 390×844 的首屏、开始对局、视角和出杆。

固定正式入口：https://lg22l37ytz.aiforce.cloud/app/app_17b18dh5axj

后续开发从主树 `main` 继续；不将妙搭包装树、归档或历史镜像作为产品源码。版本标签保持不可变，发布后的回执文档可以在 `main` 追加。
