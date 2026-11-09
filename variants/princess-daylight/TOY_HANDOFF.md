# 《公主请开球》B 站 Toy PC 版

接手分支为 `toy/princess-pc-20261108`，构建目录为 `variants/princess-daylight`。本分支交付 2026-11-09 验收的紧凑横屏版。

- `vite.toy.config.ts` 是 B 站构建入口。它启用 `VITE_BILIBILI_TOY`，加载 `src/styles/toy-desktop.css`。小红书沿用自己的工作树与构建入口。
- 宽屏比分条 60px、工具栏文字 13px、陪练提示 14px。桌面默认箭头瞄准，辅助菜单可以切换拨轮并保留偏好。
- 本地验收覆盖 1280×720、906×708、650×438 横屏，以及 390×844 触屏。B 站此前已生成上一版的链接预览，紧凑版目前是本地验收包。

## 构建和打包

在仓库根目录执行以下命令。已有依赖时先用 `npm ls --depth=0` 核对，干净检出按锁文件安装。

```sh
cd variants/princess-daylight
npm ci --ignore-scripts
npm run typecheck
npm exec -- vite build --config vite.toy.config.ts
mkdir -p artifacts/toy
python3 scripts/package-toy.py \
  --zip artifacts/toy/princess-billiards.zip \
  --receipt artifacts/toy/zip-receipt.json
```

用 `python3 -m http.server 4173 --bind 127.0.0.1 --directory dist-toy-pc` 启动本机试玩，进入 `http://127.0.0.1:4173/`。

验收 ZIP 含 64 项文件，SHA-256 为 `a28892964552867aa7897d6475deb7d885c0aa70bd94e2afe5447b419d69aa54`。如果压缩库版本导致 ZIP 字节不同，可用打包回执逐项核对解压后的文件。
