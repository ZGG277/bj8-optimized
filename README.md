# 台球产品源码

本分支保存两款独立游戏工程。公主源码更新于2026-10-30；中八保持2026-10-26基线。

| 产品 | 源码位置 | 本分支范围 |
|---|---|---|
| 中八台球（瓜瓜台球） | 仓库根目录 | v1.7.4 衍生小工具工程，包含存档兼容修复、胜局分享及开发依赖安全升级；不含后续关注作者候选 |
| 公主请开球 | [variants/princess-daylight](variants/princess-daylight/) | 用户已接受的透明R4版：透明上缘、圆弧袋口、更高第一视角、统一短句卡及逐胜局同图卡册、帮助和双视角选色、台球模拟声与轻音乐；保留开场 |

两个工程各有 package.json、锁文件与独立存档键。根目录不能覆盖公主，其他历史 variants 不是当前维护入口。`main` 保留原 v1.7.6 发布线，本分支不将其覆盖或声称已合并。

## 开发

使用 Node 24 / npm 11（验收为 Node24.14.0、npm11.9.0）。在选定工程目录运行：

```sh
npm ls --depth=0
# 仅首次克隆且依赖缺失时：
npm ci --ignore-scripts
npm run typecheck
npm run build
npm run dev -- --host 127.0.0.1
```

公主先 `cd variants/princess-daylight`。`npm test` 执行工程测试；`npm run build:minitool` 生成离线包，但上传时必须重新核对平台当日规范，GitHub 同步不是平台发版。

先读[当前版本入口](VERSIONING.md)，另见[项目基线](PROJECT_BASELINE.md)、[版本对应](VERSION_MATRIX.md)与各工程 `PUBLIC_SOURCE_MANIFEST.json`。生成产物、私有证据、素材原包与依赖缓存不属于源码交付。素材来源与第三方许可见[ASSET_SOURCES.md](ASSET_SOURCES.md)。
