# 袋口护口实现交付

2026-09-05；执行任务 `01a06f6a-6de1-7b03-804c-a21973638788`，中央任务 `01a0577c-b164-75c3-8b10-91238126fd3e`。本次完成专项方案 T1–T4 的产品实现与定向机器验证，交付后停止写入。T5 完整检查/构建及 T6 生产入口视觉验收、发布由中央继续，本文不代表视觉验收或发布通过。

目标是同时修复角袋后方漏空、六袋护口端部折叠和端座悬空，保留开放的 U 形入球通道。研究证据见 [研究方案](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/POCKET_TRIM_RESEARCH_PLAN.md)。主工作树为 `/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration`。

## 实现与文件归属

| 文件 | 最终变化 |
| --- | --- |
| `src/pocket-render/seam-contract.ts` | 以真实 jaw 顶面斜接剖面形成两端承托，搭接路径至少 7mm；从 jaw 末端切线连接至原 profile 后缘，输出护口、皮裙、缝边与木框共用的世界坐标站点。删除负深度隐藏延长和端点法向混合。 |
| `src/pocket-render/trim-geometry.ts` | 生成闭合、有厚度的皮板/薄皮裙 L 形实体；每袋一个真实 Mesh。缝边沿相同站点生成并封端。修正最终三角绕序，保留折角法线，移除不再使用的中间法向辅助函数。 |
| `src/pocket-render/cushion-geometry.ts`（新增） | 从 Scene3D 原样提取库边剖面和生成器；集中具名渲染尺寸，使端座验证消费真实库边面。没有修改物理段、鼻尖或既有包呢外形。 |
| `src/pocket-render/frame-geometry.ts`（新增） | 六袋内裁口消费同一契约，木框孔边不再独立扩大或倒角偏移；保留既有木框外轮廓、圆角及外倒角尺寸。 |
| `src/Scene3D.ts` | 接入上述生成器，删除独立袋型裁口常量和独立皮裙 Mesh；每袋皮板/皮裙为一个闭合实体，缝边为一个实体。未改相机、台腿、袋壁、袋网或落袋动画。 |
| `src/pocket-render/trim-geometry.test.ts` | 从中间法向测试改为实际最终 BufferGeometry 的拓扑、绕序、承托、接缝覆盖、开放通道和物理输入回归。 |
| `src/pocket-render/CLAUDE.md`、`src/CLAUDE.md` | 同步模块地图，删除隐藏端点旧描述和“一 Mesh 等于一 draw call”的错误说明。 |

皮板厚度沿用 7mm，角袋/中袋名义宽度沿用 23/19mm；端部底面为实际 jaw 顶面 38mm、顶面45mm，后弧顶面平滑升至48mm。皮裙厚度1.5mm，在端座收回皮板内，后部下缘到3.5mm。缝边半径仍为角袋1.8mm/中袋1.6mm。颜色、材质、球半径和物理口宽未扩大。

本执行单元未改 `profile.ts`、物理、Game、相机、界面或依赖。开始时 `npm ls --depth=0` 成功，未安装依赖。中央单独拥有并已通知的变化包括：版本1.4.1→1.5.0（package与lock根版本）、`scripts/verify-pockets.mjs`、脚本地图、README、根CLAUDE与发布计划；最终源码指纹包含这些变化，不能把本次整个工作树 dirty diff 归为护口实现。

## 定向验证证据

`npm run typecheck` 通过；以下直接测试共 **6文件45项全部通过**：

```text
npm run test:unit -- src/pocket-render/trim-geometry.test.ts src/pocket-render/cushion-join.test.ts src/pocket-render/profile.test.ts src/pocket-render/rope-net.test.ts src/physics/table-geometry.test.ts src/pocket-drop.test.ts
```

原始日志：[类型检查](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/typecheck.log)、[45项测试](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/direct-tests.log)。测试命令退出码均为0；只出现既有 Vite CJS API 弃用提示。

独立 CPU 审计直接调用未改写的 `Scene3D.buildTable`，仅对 Canvas/贴图提供空替身，不启动构造器、WebGL或浏览器。复现命令为 `node shots/pocket-trim-implementation-20260905/audit-geometry.cjs`。此方法检验真实构建器输出，但不证明屏幕外观、阴影、高DPR或 GPU draw call。

| 检查 | 结果 |
| --- | --- |
| 六袋站点数量 | 四角袋各47；两中袋各49 |
| 护口三角数 | 角袋各544，中袋各564 |
| 缝边三角数 | 每袋656；护口+缝边分别1200/1220，低于每袋1600预算 |
| 木框三角数 | 2232 |
| 实体闭合与方向 | 六袋皮壳、六条缝边及木框：按1微米坐标焊接后非流形边0、方向不一致边0、退化三角0；有向体积均正 |
| 护口最终顶面 | 角袋各92面、中袋各96面，向下0；原先每袋77面朝下 |
| 轮廓与遮挡 | 六袋内外沿投影交叉0，木框开口无交叉；全部560个顶面三角重心的首个射线命中均为自身护口 |
| 端座共边 | 260个边界点到真实 jaw 顶三角最大距离 `5.40104344971459e-8m`（约0.054微米），小于1微米 Float32 容差 |
| 端座面内承托 | 360条严格向下射线全部命中 jaw 顶面；高度最大误差约 `1.22e-9m` |
| 后接缝覆盖 | 六袋后弧各38段，在接缝两侧 -1/-0.1/+0.1/+1/+3mm 共1140条射线均命中护口或木框上部 |
| 原角袋漏空 | 四角袋原缺陷区：横向±5mm内5列，后深130–155mm、间隔0.5mm，共1020点均被上部实体覆盖；中心线每袋51点首命中木框，原先为地板 |
| 开放入球通道 | 六袋 shelf 深度、横向-10/0/+10mm的18个点均没有木框/护口横桥 |
| 桌体实际 Mesh | 原201→195，减少6个独立皮裙 Mesh；不据此声称运行时 draw call 或温控通过 |
| 物理回归 | 角袋100mm、中袋102mm，球半径28.575mm不变；六袋几何/入球、完整球体落袋及既有 profile/绳网/库边接合测试通过 |

最初直接射线检查在四角袋精确共边各出现一个 miss；实际点到 jaw 三角约3.75纳米。这是双精度数学点与 Float32 网格共边的舍入，不通过位移产品几何来掩盖。最终测试分别验证“边界点到真实顶面距离小于1微米”和“面内严格射线命中”，并保留原始 miss 记录供追溯。

完整数据：[几何汇总](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/geometry-summary.json)、[逐点审计](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/geometry-audit.json)、[审计脚本](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/audit-geometry.cjs)。研究目录中的旧图和原始证据未覆盖。

## 冻结输入与入口状态

| 项目 | 值 |
| --- | --- |
| HEAD | `0e1e7193971d0aeea78075c4d980058ea25e63e2` |
| 实现前 sourceSHA / 文件数 | `f95ea7349ec417aecadbd40178d4897e1be42c330d3bc776138bb412bb4582eb` /149 |
| 最终 sourceSHA / 文件数 | `c0abce477a32c3638af818fc0c13b960b3a68737639ef64be0522c5612b4ea24` /151 |
| IntroScreen SHA | `352dc8bd4ad1f5d7fd0ca16bc0829101be27c0ec7973b1ee4957fd98cbb1cb1c`（与前快照相同） |
| layout.css SHA | `69accbe0b39fc3eb980ba73d43e8181e47f232e98df7d98287f6714ffdac3953`（与前快照相同） |
| 当前 dist SHA /字节 | `0a9ea5aedc4aa8bb3ad27f2d180a5993751bd33ee9e423db15021627c92bdee1` /1286748（旧构建，未变化） |

[前快照](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/snapshot-before.json)与[最终快照](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-implementation-20260905/snapshot-after.json)由 `scripts/optimization-snapshot.mjs` 生成；该源码指纹不包含Markdown和shots证据文件。

CPU载入文件逐字节与研究基线比较，物理三文件、相机两文件、render-policy、thermal-governor、pocket-drop、profile、rope-net及cushion-join均未变化，SHA列在几何汇总中。既有5199预览仍为PID21302，继续消费旧dist；本执行未启停该服务，未留下新Vite/浏览器进程。

## 中央验收接续

旧脚本假设已交由中央更新，本执行未修改该脚本。接口为：

- 木框 `sharedSurfaceContract=true`。
- 六个 `pocket-top-trim-*` 真实闭合实体：`integratedApron=true`、`surfaceContractVersion=2`、`sharedSeamContract=true`，每袋 `jawAnchorCount=2`、`seamlessEndCount=2`。
- 独立 `pocket-leather-apron-*` 数量为0，不添加占位 Group 来满足旧计数。
- 六个 `pocket-lip-*` 都有真实两端锚点，总计12，`sharedSeamContract=true`。
- 删除已失实的 `embeddedDepth` / `joinExtension` 自报数据；承托以实际顶面、最终网格与射线证明。

接续顺序：冻结此输入后串行完整check与构建；核对新dist、5199响应正文及浏览器脚本一致；再验桌面1280×800、手机390×844、六袋近远端、反向/斜视与旋转闪烁，并测实际renderer.info/温控。特别复核木框内口直边与皮板高度过渡、缝边下降段的外观。机器拓扑通过不能代替这些视觉证据。

本执行已完成T1–T4并停止写入；未做完整check、构建、生产入口新画面验收、提交、推送、发布、包装树修改或对外通知。无实现阻塞；尚待中央完成T5/T6和发布门禁。
