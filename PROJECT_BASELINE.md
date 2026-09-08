# 瓜瓜台球项目基线

2026-09-08：**v1.6.0 已发布到妙搭并通过正式入口验收，作为新的可交付项目基线。**

## 固定版本与发布回执

| 项目 | 已核对的值 |
| --- | --- |
| 产品仓库 / 分支 | https://github.com/ZGG277/bj8-optimized / `main` |
| 不可变源码标签 | `v1.6.0`，带注释标签 |
| 产品源码提交 | `8fc242a35b05a9fc3238e5767502a216e562b52e` |
| 妙搭包装提交 | `fdc73c90ef94b4d9405699126cacd15a15076a30`，`sprint/default` |
| 妙搭应用 | `app_17b18dh5axj`，瓜瓜台球 |
| 本次唯一 release | `7683015635928927432`，`finished`；返回的 `commit_id` 与包装提交一致 |
| 部署完成时间 | 2026-09-08 12:29:06（Asia/Shanghai） |
| 正式入口验收 | 2026-09-08 12:29:27–12:29:45（Asia/Shanghai），18/18 通过 |
| 单 HTML 产物 | 2,892,342 bytes |
| HTML SHA-256 | `56e1bb5782c50d75ed14bea32129c1f781f5cb68fa566b86498b22f44a499cea` |

主树构建、包装内产物、包装构建输出及正式入口实际 iframe 响应逐字节相同；线上 `BUILD_PROVENANCE.json` 也与上述源码提交、标签、哈希一致。`main` 后续追加本次发布回执、验收脚本和截图，产品运行时代码继续与 `v1.6.0` 完全一致。

正式入口：[打开瓜瓜台球](https://lg22l37ytz.aiforce.cloud/app/app_17b18dh5axj)。CLI 返回的 `feishuapp.com` 别名未另行验收，交付和后续复验继续使用已确认的 `aiforce.cloud` 固定入口。

实际 iframe 为 `https://lf-miaoda-static.feishucdn.com/app_17b18dh5axj/fdc73c90ef94b4d9405699126cacd15a15076a30/client/game/index.html`。此 CDN 路径只作版本证据，用户从正式入口进入。

## 正式入口验证

本机 Chrome 152.0.7977.77，无头模式；每个视口使用全新浏览器上下文，没有提供登录态或 Cookie，正式入口可直接进入。桌面 1280×800 / DPR 1、手机模拟 390×844 / DPR 2 串行执行。

实际完成介绍页、开始对局、视角控件进入低机位、桌面鼠标蓄力松杆、手机真实触摸事件蓄力松杆，观察到击球运动画面。两端没有 JavaScript 错误、外部 GLB 请求或横向溢出。截图人工检查确认球桌、台面、球、库边和袋口细节正常。此结果是本机手机视口模拟，真实手机长时发热仍未重测。

可复查证据位于 `shots/release-v1.6.0/`：`hosted-verification.json`、`hosted-browser.log`、`verify-hosted.mjs`、双视口 intro/table/low/shot 截图、`release-receipt.json`、产品和包装构建日志。验收浏览器已由脚本关闭；用户试玩用的本地 preview 继续保留。

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
