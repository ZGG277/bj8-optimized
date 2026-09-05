# 固定机器回归合同 — 2026-09-05

执行记录：本合同首轮由 Spark 实际执行并报告 FAIL，见 `shots/optimization-spark-result.md`。该历史输入指纹保留不覆盖。修复只涉及两项下游测试及地图，主 Session 最终重锁指纹为 `ff22c0458c0073b3b2c7bcf5417b3b9e5d00a3b1d6807a5dd81ee381765a50a8`，按相同快照→diff→check→快照清单承接；日志见 `shots/optimization-final-check.log`。

你是主任务 `01a0577c-b164-75c3-8b10-91238126fd3e` 的独立固定测试执行单元。中央已选定 gpt-5.3-codex-spark；不二次路由、不委派、不修改产品。用户授权本地测试与构建，不授权提交、推送、发布或外部写入。你不是唯一工作者；父任务已暂停所有产品写入。

工作目录：`/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration`

冻结 HEAD：`0e1e7193971d0aeea78075c4d980058ea25e63e2`

冻结 sourceSha256：`e875c5b57c3bc0d4b020fd35f18162c3f034713a7e15fa53d522f3dbd29be742`，149 个文件。

保护文件：

- src/components/IntroScreen.tsx：352dc8bd4ad1f5d7fd0ca16bc0829101be27c0ec7973b1ee4957fd98cbb1cb1c
- src/styles/layout.css：69accbe0b39fc3eb980ba73d43e8181e47f232e98df7d98287f6714ffdac3953

依赖已验证完好，无 package/lock 改动，不安装依赖。npm 已在 PATH。严格串行执行以下固定步骤，任一失败立即停止并报告，不开放式诊断或修复：

1. `node scripts/optimization-snapshot.mjs`，核对冻结 HEAD、源码和保护哈希。一项不同报告 STALE 并停止。
2. `git diff --check`，退出码必须为0。
3. `npm run check`，即 typecheck → 全部 Vitest → build，退出码必须为0。不得降阈值或修改测试。最长5分钟，超时终止本任务启动的命令并报告TIMEOUT。
4. `node scripts/optimization-snapshot.mjs`，源码和保护哈希仍一致；记录此次 dist/index.html 的新 SHA-256 与 bytes。
5. 最终回答简明表格：状态 PASS/FAIL/STALE/TIMEOUT、每步退出码、测试文件数/测试数、失败摘要、源码哈希、构建哈希/字节数。反馈通过本 CLI 最终输出由中央收取，不发送飞书或调用其他任务消息。

只读源码/脚本/配置/测试/文档，不修改上述文件或 git 索引。仅允许 npm 工具缓存与 dist 构建产物；不启动浏览器、Vite、监听器，不安装软件，不读取无关用户资料。不要为本次固定测试生成新计划或额外测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
