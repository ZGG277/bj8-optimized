# 仓库合并与历史归档（2026-08-31）

## 结论

`main` 是唯一产品源码主线，`v1.4.0` 是本次重建的可追溯验收基线。GitHub 权威仓库为 <https://github.com/ZGG277/bj8-optimized>。

## 对账结果

| 来源 | 对账时状态 | 处理 |
| --- | --- | --- |
| 本地 `bj8-main-integration` | `main` 基于 `433b0b2`，包含已验收但未提交的 v1.4.0 实现 | 作为最终产品树 |
| GitHub `origin/main` | `33e30df`，与本地 `main` 分叉 | 以合并父提交保留历史，不覆盖已验收本地树 |
| `guagua-pool-share` | 初始分享提交 `6586e54` 的产品源码与本地验收树一致；归档 README 后冻结于 `282ef5d` | 仅保留公开案例快照，不再独立开发；整合期测试脚本修正只进入权威主仓 |
| 本地 `bj8-optimized` | `agent/ghost-cue-aim-dial` 及未提交历史实验 | 固化到 `archive/local-ghost-cue-aim-dial-20260831` |
| `kimi-code-share` | 案例文章、HTML 与图片，不含独立产品逻辑 | 迁入 `docs/case-study/` |
| `bj8-miaoda-app` | 妙搭托管包装，内嵌静态游戏产物滞后 | 保留为包装工作树，通过 `npm run sync:game` 单向消费已验收产物 |

## 版本管理规则

1. 新开发只从 `main` 开始，不从分享镜像或历史分支回流。
2. 可交付基线先通过 `npm run check` 和必要的真实浏览器验收，再创建带注释的 `v*` 标签。
3. 妙搭包装的 `BUILD_PROVENANCE.json` 必须指向已提交主仓提交，并记录单 HTML 产物的 SHA-256。
4. `archive/*` 只用于追溯；需要复用时从其创建新分支并显式审核，不直接继续开发。
5. 本地 `archives/*.bundle` 是 GitHub 之外的第二恢复路径，不是源码工作树。
