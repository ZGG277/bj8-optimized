# 公主请开球

当前基线为小红书 V1.0.27 双人封面版，2026-11-22 回读状态为审核中。[交付记录](RELEASE_1_0_27_20261122.md) · [文件映射](PUBLIC_SOURCE_MANIFEST.json)

[固定试玩](https://zgg277.github.io/guagua-game-prototypes/princess/)

唯一维护源为本仓库 variants/princess-daylight。Node/npm 项目，先用 npm ls --depth=0 检查依赖；缺失时 npm ci --ignore-scripts。npm run dev 开发；npm run check 检查；npm run build:minitool 生成离线包。

Android/iOS、Chrome61与小红书宿主验证需分别完成；普通浏览器首次有声播放可能需要轻触。
