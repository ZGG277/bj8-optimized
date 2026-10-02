# 小红书“小工具”上传包

## 当前上传基线：2026-10-02

源码分支 `release/xhs-minitool-20261002`，标签 `xhs-minitool-20261002`。上传包固定为 `artifacts/guagua-billiards-xhs-minitool-v1.7.4-xhs.20261002-upload.zip`；最终哈希、源码提交与验收回执见 `XHS_UPLOAD_20261002.md`。旧候选全部保留。小红书上传/审核/发布尚未执行。

构建：`MINITOOL_REQUIRE_COMMITTED=1 MINITOOL_VARIANT=xhs.20261002-upload npm run build:minitool`。上传构建要求相关源码已提交，避免包与 GitHub 源码不一致。

## 历史候选：2026-10-02 控件清晰度与完局免提示 UI3

`artifacts/guagua-billiards-xhs-minitool-v1.7.4-xhs.20261002-ui3.zip`。出杆和母球可见宽度 48px、静置不透明度 44%；完整一局后停止瞄准/出杆/母球提示，老用户按历史完局记录直接生效。验收见 `XHS_CONTROLS_UI3_ACCEPTANCE.md`。仍为本地候选，未发布。

## 上一轮：2026-10-02 浮动布局 UI2

`artifacts/guagua-billiards-xhs-minitool-v1.7.4-xhs.20261002-ui2.zip`（约 1.11 MiB）。瞄准贴底、右侧入口折叠、白球与出杆靠右下、静置控件淡显、球桌取消整片控件避让。仅未调整的旧默认布局采用新默认，历史成绩与自定义位置保留。

本地验收与精确指纹见 `XHS_FLOATING_CONTROLS_ACCEPTANCE.md`。构建：`MINITOOL_VARIANT=xhs.20261002-ui2 npm run build:minitool`。预览：http://127.0.0.1:5218/dist-minitool/ 。尚未发布；原生容器与覆盖升级仍待真机验证。

## 上一轮：2026-10-02 优化候选

当前源码基线 v1.7.4 / `8280ad4f94558f6aa2a1d7d373d35238018dd895`，包含保留的本地小工具适配与本次未提交修改。候选为 `artifacts/guagua-billiards-xhs-minitool-v1.7.4-xhs.20261002.zip`；原 v1.7.1 ZIP 保留。

- 俯视改为像素留白，避让控件和横屏悬浮比分栏；保留控件尺寸和旧布局。
- 小工具只打包当前主线三个公开场景（室内、云海、湖面）；历史场景及 Blender 源资产仍保留在源码中。
- 远景针脚 LOD、候选/路线边界分段计算；不改物理和持久存储合同。
- 胜局卡片通过小工具官方 `window.xhs.miniTool.postNote` 接入笔记编辑；小工具不显示依赖妙搭包装的留言入口。
- 本次包约 1.11 MiB，符合推荐 <2 MiB；实际 SHA、源码指纹及验收见 `XHS_OPTIMIZATION_ACCEPTANCE.md` 和包内 `BUILD_PROVENANCE.json`。

构建：`MINITOOL_VARIANT=xhs.20261002 npm run build:minitool`。默认未指定变体时输出 `v<package.json版本>-local.zip`。不改 npm 锁文件。

### 旧用户存档硬约束

必须在原小工具项目/相同应用身份下覆盖升级，不能新建另一小工具替代；不得清除容器数据或更换存储命名空间。现有等级/累计统计、v3 自定义布局、控件学习、首局完成、瞄准辅助及主题键名保持不变；v1/v2 画像兼容保留。本地同源旧包→新版验收通过，不等于真实客户端升级已验证。正式发布前需以已有记录的测试账号，在原小工具内更新后确认数据保留。

本轮仅本地实现与验收，未提交/推送/发布。原生分享与客户端覆盖升级仍待平台内复验。

---

## 历史记录：v1.7.1 初始适配

基线：`v1.7.1` / `91331ffacb07163b9b46d11d24ffcebf6c20f461`。本地适配层未提交，不把 ZIP 误记为该标签的逐字节原产物；包内 `BUILD_PROVENANCE.json` 同时记录基线和实际构建文件 SHA-256。

## 检查与修复

- 应用是 Vite 编译的 HTML/CSS/JavaScript 静态 Web 应用；运行时依赖 React、Three.js，但不需要服务端。
- 未发现业务外部网络请求、CDN、远程图片或远程字体；全部 Blender GLB、程序化纹理、样式和脚本进入 ZIP。
- 小工具构建把 JavaScript 外置，补齐 `viewport-fit=cover` 和本地图标，ZIP 根目录直接放置唯一 `index.html`。
- Worker/SharedWorker/Service Worker、fetch/XMLHttpRequest、WebSocket、WASM、iframe/object、动态执行、外链和受限设备 API 均由产物扫描拒绝。
- 原走位和顾燃战术 Worker 在小工具构建中改为保持同一消息合同的主线程异步适配器；GLB data URL 直接解码后 parse，不调用 Three.js 网络加载分支。
- 390×844 production preview 已验证开始对局、WebGL、5 个控件、真实触摸切换瞄准档、零横向溢出、零外部请求和零页面错误；截图位于 `artifacts/xhs-minitool-390x844.png`。
- 源码和构建产物未发现常见密钥、令牌或私钥模式。项目内 Blender 资产的 README/provenance 记录为本地原创，不含第三方下载、付费模型或外部纹理；`THIRD_PARTY_NOTICES.json` 随包保留 React、ReactDOM、Scheduler 与 Three.js 的版本和完整许可证文本。

## 风险

- ZIP 约 4 MiB，超过官方“推荐总包 <2 MiB”，但 1.2.0 规范未把 2 MiB 写成硬上限；后台若执行更严格的未公开限制，需另做画质/场景裁剪版。
- 小工具禁用 Worker 后，用户主动打开走位计算或顾燃进行高预算战术搜索时会在主线程执行；低端真机可能出现短暂停顿。现有 240 Hz 物理、按需渲染和温控降档仍保留。
- 当前只完成本地 Chrome production preview；未进入小红书 PC 模拟器和真机容器，容器内最终兼容性须在后台上传后复验。

## 构建与上传

运行 `npm run build:minitool` 生成 `artifacts/guagua-billiards-xhs-minitool-v1.7.1.zip`。在小红书开放平台进入对应“小工具”项目，选择版本/代码包上传，直接选择该 ZIP；不要再次包裹外层文件夹。上传后先在 PC 模拟器检查首屏、开始对局、世界选择、瞄准、蓄力与出杆，再在至少一台 iOS 和一台 Android 真机复验安全区、触控、音效、WebGL 场景加载及连续两局性能。确认无白屏、资源/CSP 报错、横向溢出和明显卡顿后，填写版本说明并提交平台审核；审核通过后再执行发布。
