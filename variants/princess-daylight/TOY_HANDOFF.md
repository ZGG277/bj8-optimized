# 《公主请开球》B 站 Toy PC 版

接手分支为 `toy/princess-pc-20261108`，构建目录为 `variants/princess-daylight`。本分支交付 2026-11-09 验收的紧凑横屏版。

- `vite.toy.config.ts` 是 B 站构建入口。它启用 `VITE_BILIBILI_TOY`，加载 `src/styles/toy-desktop.css`。小红书沿用自己的工作树与构建入口。
- 宽屏比分条 60px、工具栏文字 13px、陪练提示 14px。桌面默认箭头瞄准，辅助菜单可以切换拨轮并保留偏好。
- 横屏开场是 `src/assets/opening/arrival-landscape.mp4`（1280×720，正好 8.0 秒，H.264 + AAC）。来源是 Grok Imagine 2026-11-10 生成的视频，原声由视频制作官合成，Tian 核准这一版并要求保持比旧片更短。B 站 Toy 白名单包含 `.mp4`，所以桌面包直接使用该文件和片内音轨，不再转成无声 WebP。竖屏视口仍播放原来的 `arrival.webp`。来源说明在 `src/assets/opening/landscape-provenance.json`，打包后写入 `OPENING_LANDSCAPE_PROVENANCE.json`。
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

横屏开场加入后，本地验收 ZIP 为 67 项、15,665,810 字节（解压 19,645,892 字节）。其中 `arrival-landscape.mp4` 为 5,180,265 字节。入口 `index.html` 仍低于 1MB。如果压缩库版本导致 ZIP 字节不同，可用打包回执逐项核对解压后的文件。
