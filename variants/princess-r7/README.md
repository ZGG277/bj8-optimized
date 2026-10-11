# 公主请开球 · 可重建源码候选

台球产品同源迭代，保留独立 princess-billiards 存档命名空间；不覆盖瓜瓜旧档。来自指定 Sites 源码提交 287f900b36af3e9421366ee966aae2f056132942（站点标题 R4，源码已含 R7 开场、谢不赢与手势）。

此完整工程不含 10 月 9 日附件新增珠宝 GLB 的原始源码；后者保存在并列 daylight-1009 候选。以 VERSION_MATRIX.md 为版本边界。

在本目录执行 npm ci --ignore-scripts、npm run check、npm run dev。首次已有依赖时先 npm ls --depth=0。默认不部署。相比原源仅修复测试的仓库外 baseline 引用和本机 Skill 打包依赖；冻结对照文件来自其历史 efcfed8。
