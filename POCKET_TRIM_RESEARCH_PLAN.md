# 袋口包边专项研究与实施方案

状态：**研究与方案完成，产品未修复、未重新构建、未发布。**

日期：2026-09-05（Asia/Shanghai）。专项执行：gpt-6-astra / xhigh。中央任务：`01a0577c-b164-75c3-8b10-91238126fd3e`。

## 1. 结论与本轮边界

**新构建里仍存在真实几何问题，不能把本轮复现归结为“浏览器没加载优化”。** 独立页面的内联业务脚本 SHA256 与当前 dist 相同，桌面与手机真实俯视都能看到皮圈接头不整齐。已定位三个相互关联但不能互相替代的原因：

1. **木帮裁口没有参与共享边界。** 四个角袋的皮圈后沿到木帮实体之间，沿袋口中央外向轴有约 **27mm** 空隙；向下射线穿到地板。中袋后轴恰好相接，但两肩的曲线仍不一致。
2. **最终皮圈在两端发生折叠。** 每袋 96 个顶面三角形中，77 个朝 −Y、19 个朝 +Y；每袋外沿与内沿发生两次真正的非相邻线段交叉。`DoubleSide` 能显示两面，不能把折叠改成正确实体。
3. **“隐藏端点”没有藏入实体。** 六袋的左右端面，每端内/中/外三个投影点，下方首先碰到的是 y=0 台呢；没有碰到木帮或 jaw。两端悬在台呢上方，再叠加折叠，看起来像短舌、豁口和绿色切入。

推荐：把目前只共享 trim/apron/lip 控制点的 `seam-contract` 升级为 **整个袋口接合区的截面与边界契约**。木帮裁口、皮圈顶/底/内壁、两端承托面都消费实际同一批边界顶点。保留朝台内的入球开口，不封成完整圆环，不扩大物理袋口。

本轮仅写本文及 `shots/pocket-trim-research-20260905/` 证据。未编辑产品源码、Game、相机、物理规则、引导、包装工作树和锁文件；保留所有既有未提交改动。未安装依赖、提交、推送、发布或修改飞书文档。

## 2. 实际入口与版本对账

唯一工作树：`/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration`。实际入口：[localhost:5199](http://localhost:5199/)。

| 核对对象 | 结果 |
| --- | --- |
| HEAD | `0e1e7193971d0aeea78075c4d980058ea25e63e2` |
| 当前源码（149 文件） | `f95ea7349ec417aecadbd40178d4897e1be42c330d3bc776138bb412bb4582eb` |
| 当前 dist/index.html | 1,286,748 bytes；SHA256 `0a9ea5aedc4aa8bb3ad27f2d180a5993751bd33ee9e423db15021627c92bdee1` |
| 5199 HTTP 解压正文 | 200；同为 1,286,748 bytes，SHA256 与 dist 完全一致 |
| 浏览器实际 DOM 内联 module 脚本 | SHA256 `f15cbc61166d5fe84335aabe50774c237a8c4825ae99d122b34b6c5ec63a3b0d`，与从 dist 提取的脚本逐字节哈希一致 |
| 监听进程与目录 | PID 21302；cwd 为上述唯一工作树；父任务 10:21 启动的 `vite preview --host 127.0.0.1 --port 5199 --strictPort` |
| HTTP 缓存声明 | `Cache-Control: no-cache`；ETag `W/"13a25c-PewolwmDFzPQCeasDYX8dnGAbh4"` |
| npm 依赖 | 初次及恢复后 `npm ls --depth=0` 均成功；没有安装 |
| 保护文件 IntroScreen.tsx | `352dc8bd4ad1f5d7fd0ca16bc0829101be27c0ec7973b1ee4957fd98cbb1cb1c`，未变 |
| 保护文件 layout.css | `69accbe0b39fc3eb980ba73d43e8181e47f232e98df7d98287f6714ffdac3953`，未变 |

证据：[恢复基线](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/snapshot-resumed.json)、[实际 HTTP](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/http-resumed.json)、[dist 内联脚本](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/artifact-scripts.json)、[浏览器脚本与桌面尺寸](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/browser-desktop.json)、[结束源码快照](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/snapshot-final.json)。

本任务先在 10:36–10:39 核对旧的 `ff22c045… / 09ae041f…` 基线，随后按中央要求 `PAUSED_FOR_UI_TASK`。恢复时由中央明确归属的新 UI 提示改动形成上述 `f95ea734… / 0a9ea5ae…` 基线；袋口几何、Scene3D、相机、物理及两个保护文件不变。旧版本记录仅为调度历史，不能替代此次基线。

**版本判断的限度：**这是静态 preview，改 src 不会自动更新 dist。`no-cache` 不等于已打开标签页自动换代码。但本任务新建独立标签页的脚本已实测与新 dist 相同，因此当前复现不依赖用户原标签页的缓存状态。没有刷新或读取用户正在玩的旧球局，也不声称核实了它的加载版本。

## 3. 真实画面与逐袋缺陷编号

浏览器为本任务自己的 Codex 应用内浏览器，页面无需登录；未连接或操作用户原标签页。走真实“开始对局”入口，未出杆；俯视按钮 `aria-pressed=true`，视角推杆 `100`。桌面 1280×800，canvas CSS/缓冲区均 1280×752、起点 (0,48)，DPR=1；手机布局 390×844，canvas CSS/缓冲区 390×798、起点 (0,46)，DPR=1。手机证据是浏览器窄视口，**不是实体手机或 DPR=3 触摸设备验收**。

### 3.1 原始截图

**桌面标准俯视，全六袋：**

![桌面 1280×800 真实俯视全台](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/desktop-top-1280x800.jpg)

**手机标准俯视，全六袋：**

![手机布局 390×844 真实俯视全台](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/mobile-top-390x844.jpg)

补充原图：[桌面对侧俯视](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/desktop-top-opposite-1280x800.jpg)、[对侧推杆 85 的斜俯视](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/desktop-oblique85-1280x800.jpg)。对侧来自真实“开启手动视角”后水平拖动约 393 CSS px，画面中的白球/球堆换边；不是精确数值相机夹具，不把它记录为精确 180.000°。

工具原生截图实际为 JPEG，已按文件签名改用 `.jpg` 扩展名，未修改图像内容。`desktop-near-native.jpg` 是一次工具 clip 返回的缩放异常片段，**排除出测量证据**。位置检查以全尺寸原图为准；JPEG 不承担亚像素缝隙测量，毫米数据由下面的实际网格计算提供。

### 3.2 六袋定位与两端检查

P0–P5 使用 `createPocketGeometries` 的现有索引。下表矩形均为全截图 CSS/图像像素 `(x,y,w,h)`，用于定位，非自动分割测量。L/R 指沿袋口局部 tangent 的负/正端，避免换相机后左右混淆。

| 编号 / 袋 | 默认桌面位置、检查区域 | 手机位置、检查区域 | 两端与周边观察 / 数值对应 |
| --- | --- | --- | --- |
| D01 / P0 角袋 | 远侧左 `(160,103,81,69)` | 左上 `(33,180,42,44)` | 两端在绿色 jaw 边缘有短尖、接合轮廓不顺；外侧出现第二道暗轮廓。L/R 均有折叠、未承托端面；后轴有约 27mm 结构空隙。 |
| D02 / P1 角袋 | **近侧左** `(70,520,98,86)` | 右上 `(268,180,43,44)` | 近侧清楚可见两端皮舌及绿色切口；U 形圈外侧与木框轮廓分离。L/R 两次交叉；后轴约 27mm 空隙。 |
| D03 / P2 中袋 | 远侧中 `(594,102,70,53)` | 左中 `(25,411,32,43)` | 顶圈遮住一部分袋腔，端部呈两根短脚，不能由远侧外观判“无缺陷”。L/R 折叠/悬空；后轴无 27mm 间隙，两肩另有曲线间距。 |
| D04 / P3 中袋 | **近侧中** `(588,548,74,64)` | 右中 `(282,411,33,43)` | 两根皮脚直接结束于绿色库边附近；横向进入通道是正常开口，但皮脚的卷入和截断不是正常收口。L/R 折叠/悬空；不能照搬角袋“加宽后沿”的修法。 |
| D05 / P4 角袋 | 远侧右 `(1017,103,81,70)` | 左下 `(21,655,49,53)` | 远侧弧圈可辨，接头在 jaw/木帮交界形成多个小轮廓；手机端细节仅几像素。L/R 折叠/悬空；后轴约 27mm 空隙。 |
| D06 / P5 角袋 | **近侧右** `(1090,520,95,88)` | 右下 `(273,654,48,56)` | 最直观的 U 圈外侧暗缝与两端短舌之一；对侧视图同类现象转到另一排。L/R 折叠/悬空；后轴约 27mm 空隙。 |

本次现场可识别 **六个实体孔洞**，各自产生网袋、内圈、外圈和接头轮廓。没有发现第七/第八个独立孔洞。用户说“8个”究竟是口误还是数到这些重叠轮廓，本轮不能还原；不能用数量差异否定其包边缺漏的体验。

## 4. 根因证据与排除项

### 4.1 计算方法与可复现性

[analyze-geometry.cjs](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/analyze-geometry.cjs) 在内存中加载**当前未修改源码**，执行 `Scene3D.buildTable()` 得到实际 BufferGeometry。只把纹理生成和 2D Canvas 绘制替换为空对象；不调用 Scene3D 构造器、WebGLRenderer、游戏循环、浏览器或产品构建。使用已安装 Three.js r185，做 CPU 三角形、边相交、向下射线检查。每个被加载源码的 SHA256 保存在输出中。

- [完整几何数值、源码哈希及射线结果](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/geometry-analysis.json)
- [最终轮廓交叉与三角形方向](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/topology-summary.json)
- [轮廓检查脚本](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/inspect-numeric.cjs)
- [作图脚本](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/plot-geometry.py)，[可缩放 SVG](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/geometry-plan.svg)

命令均从唯一工作树运行：

```sh
node shots/pocket-trim-research-20260905/analyze-geometry.cjs
node shots/pocket-trim-research-20260905/inspect-numeric.cjs
python3 shots/pocket-trim-research-20260905/plot-geometry.py
```

这是对现有几何的诊断执行，不是替代版本构建。图中的颜色用于区分部件和问题，**不是游戏渲染截图，也不是拟议修复效果图**。

![当前实际几何投影：木帮裁口分离及皮圈端部折叠](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/shots/pocket-trim-research-20260905/geometry-plan.png)

### R1：共享契约缺少木帮裁口（已证实）

源位置：[Scene3D.ts:542](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/Scene3D.ts:542) 至木框构建段；[seam-contract.ts](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/pocket-render/seam-contract.ts)。

木框仍用 `sidePocketHalfWidth=mouthHalfWidth+0.014`、`sidePocketDepth=RAIL_W-0.018`、`cornerPocketSpan=mouthHalfWidth*sqrt(2)+0.008`、`cornerPocketOffset=0.029` 独立生成轮廓，再做 3mm 横向/2mm 纵向 bevel。它不消费 trim 的外沿，也不知道隐藏端点。

角袋中央轴（局部 lateral=0，depth 朝台外）：trim 内沿 depth=106mm、外沿 depth≈129mm。0.25mm 步长 CPU 采样显示，depth=129.25–155.75mm 的垂直射线先命中 y≈−820mm 地板；从约 156mm 才命中木框。四角一致。trim 自己可以闭合，**整张桌面的承接区域仍会漏到桌下**。

中袋不能一概套用：后轴 trim 外沿≈97mm，木框 bevel 在约 97mm 已出现；但肩部 station 19/29，沿实际外沿方向仍需约 6.25mm 才遇木框。这个值是曲线到木框的距离，**不是全部位置的空气孔洞宽度**；jaw 附近可能有其他实体承托，须由共享面域统一解决。

结论：应把木框内裁口回接到正确的护口承托边界，而不是把角袋皮圈整体加宽 27mm、放大洞或另加遮挡圆环。

### R2：混合后的外沿穿过内沿（已证实）

源位置：[Scene3D.ts:965](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/Scene3D.ts:965) 的 endBlend、968–980 的法向混合/收窄及 994–1017 的索引/法线；[trim-geometry.test.ts](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/pocket-render/trim-geometry.test.ts)。

`outwardTrimNormals()` 先给出相对袋腔连续朝外的法向；Scene3D 随后把端部法向朝 `pocket.outward` 混合。后者是袋口轴向，不是两侧每一点的横向外法向。端点偏移方向因此近似沿曲线折返，形成短舌和反折。

六袋最终网格均测得：

| 指标 | 各袋结果 | 意义 |
| --- | --- | --- |
| 顶面三角形 | 96 | 不是整段未生成 |
| +Y / −Y 几何面方向 | 19 / 77 | 顶面混合绕序；理想顶面应一致朝 +Y，不能只把全部索引倒一次就修好 |
| 外沿与内沿非邻边交叉 | 2 次 | 外沿段 2 穿内沿段 7，外沿段 45 穿内沿段 40；两端真正折叠 |
| 独立 cap 的未配对拓扑边 | 0 | 索引闭合不等于空间嵌入有效 |
| 96 个顶面质心被更高桌体遮挡 | 0 | 仅为垂直射线抽样；不能据此宣称任意相机无遮挡 |

现有测试检查的是混合前的 normals 和等宽外沿步长，没有消费最终 widthScale、endBlend、triangle index 和 woodFrame，所以“测试通过”不能否定这次结果。`computeVertexNormals()` 只计算/平均法线，不负责重建拓扑；对于硬皮顶面与侧壁，共用顶点还可能把侧壁/错误面方向混入高光。[Three.js BufferGeometry 官方文档](https://threejs.org/docs/pages/BufferGeometry.html)

### R3：隐藏端点与实际承托实体脱离（已证实）

源位置：[seam-contract.ts:11](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/pocket-render/seam-contract.ts:11)；[Scene3D.ts:955](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/Scene3D.ts:955) 及 1034–1066；[cushion-join.ts](/Users/zgg/Projects/游戏/bl8-3D台球/bj8-main-integration/src/pocket-render/cushion-join.ts)。

局部坐标以下均为毫米，格式 `(lateral, depth)`：

| 类型 | 端内沿 | 端外沿 | cap 高度 |
| --- | --- | --- | --- |
| 角袋 L/R | `(±47, −10.287)` | `(±47, −2.237)` | 顶48、底41 |
| 中袋 L/R | `(±47.94, −8.5725)` | `(±47.94, −1.9225)` | 顶48、底41 |

在每个端面宽度的 0/50/100% 处，从 y=41mm 下射，首先击中的是台呢 y=0；36 个检测点（六袋×两端×三点）一致。原始 mouth anchor 在 depth=0、横向 ±50/±51mm，所谓隐藏端点反而向台内前移且横向收窄。它没有与木帮或 jaw 顶面的承托区域做相交计算。

另外，库边顶面38mm、木帮主体45mm（bevel最高约47mm）、cap底41mm/顶48mm。即使 XZ 某处挨到 jaw，仍不能仅凭位置接近宣称存在高度接合。“厚度仅1.6mm”的代码注释也与实际7mm不符。下一轮应把高度、厚度、终端承托截面写入同一个契约。

### 4.2 不是已证实主因的项目

- trim/apron/lip 均为 `DoubleSide`。单纯开背面剔除并不能解释当前全部缺漏，更不能靠再加 `DoubleSide` 修复已交叉的边。[Three.js Material 官方文档](https://threejs.org/docs/pages/Material.html)
- cap顶48mm，高于木框 bevel 顶≈47mm、jaw顶38mm；没有证据表明整片顶面被更高木帮系统性盖住。但低角度时几何侧壁和 jaw 当然会遮挡一部分皮裙，必须分视角判断。
- 当前 apron 与 cap 的接口确实使用同一组48段点；它解决了一部分旧接口偏差。lip 仍以 TubeGeometry 44段沿同一条连续曲线另行采样；这是离散接缝风险，**未证明它是27mm后缝或两端折叠的主因**。
- 本轮没有录制足以证明深度闪烁的时间序列，不把所有深色尖角都称为 z-fighting。已证明的折叠足以产生共面覆盖风险，仍应做动态专项验收。
- profile/well/rope-net 和落袋轨迹未发现足以推翻上述包边诊断的新证据；不把研究扩展为第二次物理或袋网重写。

## 5. 正常入球开口与实物参考边界

必须保留台呢通向袋腔的进球通道：从台内看两侧 jaw 之间本来就是开放的。这里的“连续”指 **从左侧接头沿外后弧到右侧接头的皮圈，以及皮圈与支撑部件的接合**；不要求一条横梁跨过入球口。

制造商资料可直接核对：JOY 的 [Q7 产品页](https://www.joybilliard.com/billiards-table/silver-leg-billiards-table.html) 描述机械成型袋口；其[球台产品说明](https://www.joybilliard.com/billiards-table/)列出铜与牛皮护口材料，并说明六袋配置。这支持保留有厚度的护口与真实接头，不支持漂浮的装饰圆环。网页所列某型号袋宽85mm不能替代本项目现有100/102mm。

本轮读到了制造商文字和原图链接，但原图在应用内浏览器加载超时，未完成可测量的实物近照目视核验。因此本方案的**尺寸根因来自当前网格**，不冒称已按某型号实物逐毫米复刻。实施前的外观定型可补一张角袋、一张中袋真实接头近照；这不影响先消除已证明的交叉、悬空和后沿漏面。

## 6. 推荐整体几何设计

### 6.1 一个接合区契约，多个材质面域

建议将 `pocket-render/seam-contract.ts` 扩展为具名 `PocketSurfaceContract`（或同职责新模块，避免两份并存事实源）。输入仅为只读 PocketGeometry、PocketRenderProfile、渲染木帮/库边截面参数；输出包括：

| 契约项 | 具体要求 |
| --- | --- |
| 坐标与物理锚点 | 固定 mouthCenter/outward/tangent 和原 mouth/jaw/shelf/capture 数据；禁止在渲染处重新算物理宽度。所有六袋通过同一局部模型刚性变换。 |
| 统一采样站 | 输出带语义编号的 station 数组；包括左右 jaw 锚点、终端接触截面、后弧关键点、材质过渡点。按曲率误差自适应细分但设上限；所有相接部件消费相同位置，不能分别 getPoints(48)/TubeGeometry(44) 再碰运气。 |
| 内/外边界 | `innerTop`、`outerTop` 是两个明确、有序、不交叉的边界。末端由真实接触截面约束；不得把侧向法向混向整个袋口 outward。需要修形时改变有约束的边界曲线，不能事后旋转挤出方向。 |
| 木帮裁口/承托边 | 木框孔边与 `outerTop/seat` 共源，考虑现有 bevel 的实际扩展；保留台帮外轮廓。用裁口/承托结构补回角袋无故挖掉的区域，不把皮圈增厚加宽成遮挡补丁。 |
| 左右端头 | 为每端输出真实支持部件、接触面和终端切平面。先求与 jaw/木帮实体的有效交集，再决定停止位置；端面要被正确终端面封住或进入真实承托范围，不能落在空中的台呢投影上。 |
| 厚度/高度 | 沿站点输出顶/底高度与厚度；以现有最大厚度7mm、背弧顶48mm和现有23/19mm名义宽度为初始外观约束。若接到38mm jaw顶，端部底面必须落到该承托截面，顶面随厚度约束过渡；不能全段底41mm仍声称贴合。最终厚度是具名设计参数，注释与实值一致。 |
| 皮裙/袋腔连接 | cap内下边直接生成 apron 上边；连接袋腔的过渡沿 profile 源几何定义，不跨越原入球通道。确需分材质时允许重复法线顶点，位置值必须复用同一来源。 |
| 索引/法线 | 顶面一致 +Y、底面 −Y，内/外壁按具名角色定向；硬顶面/侧壁可拆法线索引，避免平顶高光被竖面平均。网格生成器负责正确绕序，DoubleSide 不承担补洞职责。 |
| 重叠与接缝 | 相邻可见面共边、不共面叠加；设计为皮革压在木头上时使用明确的有限承托槽/接触关系，不允许暴露在孔洞里的隐藏三角或无限 polygonOffset。 |

推荐把 cap 与 apron 合为一个闭合的护口壳体（可保留材质分区），lip 只作为细缝边消费同一条离散边界；woodFrame 从同一组座边反推孔边。保持 `Scene3D` 为装配器，把曲线求解/三角化放在纯几何模块，测试直接调用最终生成器。

`ExtrudeGeometry` 的 bevel 会扩展轮廓；共享“未倒角二维线”尚不足以保证最终实体相接，须将对应截面也纳入合同。[Three.js ExtrudeGeometry 官方文档](https://threejs.org/docs/pages/ExtrudeGeometry.html)

### 6.2 必要备选与不采用的补救

| 方案 | 适用条件 | 取舍 |
| --- | --- | --- |
| **推荐：共享离散边界 + 有厚度分面壳体 + 木帮回接** | 当前只两种袋型、运行时规则稳定、已有程序化生成体系 | 能用现有 Three.js 和纯测试完成，边界可验证；需要一次同时收敛 seam/trim/wood 的跨文件改造。 |
| 备选：两种参数化二维面域，统一三角化后挤出 | 简单双边 sweep 在终端仍无法保证有效面域 | 显式构造 U 形简单多边形，用现有 ShapeUtils 三角化，随后生成上下/侧面；更易检查相交，但仍须共享 wood/jaw 端点，不能变成独立导出资产。 |
| 仅在外观方向另获授权时：制作两种固定模型资产 | 制造商细节超出当前程序化表面能力 | 维护与物理参数适配成本增加，本轮不推荐，不新增依赖或外部建模工序。 |

不采用：把U口闭成圆环、整体放大孔洞、靠调相机藏问题、再加一圈皮片、把 trimWidth 或 joinExtension 加到“看不见缝”、关闭 depthTest、叠加透明片、用 DoubleSide/法线重算替代拓扑修复。

## 7. 分层实施任务、所有权与模型安排

**以下是待实施合同，不是本轮已执行项。** 中央确认进入实现后按次序办理；当前仍停止于研究文档。模型为建议角色，实际派发由中央按当时可用性/预算路由一次。GPU 限流存在或夜间低发热窗口时保持串行。

| 层级 / 任务 | 产物与验收 | 唯一文件所有权 | 建议能力与依赖 |
| --- | --- | --- | --- |
| T0 绑定实现基线 | 当前 source/dist/保护哈希、袋口截图、明确物理与界面禁改清单 | 执行合同/专项证据 | 中央；先于所有修改。保留UI专项与其他既有改动。 |
| T1 定义接合区契约 | 两种袋型的具名边界、端面承托、高度截面；数据即可画出面域；六袋变换一致 | `src/pocket-render/seam-contract.ts`，必要的新 `surface-contract.ts` 二选一；相关类型 | Astra 高推理或复杂几何负责人；先审边界再接场景。 |
| T2 实现正确护口实体 | 最终顶面方向统一、0交叉、有效厚度和端面；纯生成器供测试直接调用 | `trim-geometry.ts` 与必要 `surface-geometry.ts`；对应测试 | 同一几何负责人（优先 Astra / Sol high）；依赖T1。不可分派两人各自改同一截面。 |
| T3 木帮/jaw座边整合 | wood裁口共源，消除后轴空区；端部真实承托；旧独立常量路径删除 | **一名整合者独占** `src/Scene3D.ts`；`cushion-join.ts`仅在需要输出既有截面座边时修改，不改物理鼻尖 | Sol high或上述同一负责人；依赖T1/T2。避免“木框一人、皮圈一人”同时修改Scene3D。 |
| T4 定向机器门禁 | 六袋最终网格/面域/接触/物理不变量测试；新旧常量禁回归；可重复命令 | 明确列出的 `src/pocket-render/*.test.ts`、专项测试脚本，不改生产文件 | Terra执行明确测试设计；若交给Spark，只在中央授权的固定测试合同冻结后执行，不让其开放式修形。 |
| T5 串行集成检查与构建 | typecheck+相关Vitest；交付前一次完整check；新dist与实际5199正文/浏览器script哈希一致 | 构建产物与验收记录 | 固定命令可按中央Spark窄授权；不得安装成功依赖、改锁、开第二服务或重做已通过且未失效的检查。 |
| T6 实际入口视觉验收 | 桌面/手机两标准视口、六袋近远两端、斜视旋转、无闪烁及性能对照；通过后再交付 | 截图、专项验收文档；源码只读 | 一名体验复核者按风险安排；不与主执行者重复完整旅程。发现新几何失败回T2/T3，不继续盲调材质。 |

保护文件仍为 `IntroScreen.tsx`、`styles/layout.css`；禁写 Game、相机、physics、规则、包装树、依赖锁。profile/rope-net/pocket-drop 默认只读；若共享表面必须扩展 profile 的渲染输出，先列出最小接口变化与保持物理不变量的证明，再由中央纳入范围。不要用本方案自动授权扩展。

最大三个实施风险：

1. 只修端部折叠会留下角袋后缝，只补木框会留下悬空皮脚；T2与T3必须作为同一几何契约交付。
2. 以更高/更宽皮片遮缝可能侵入实际球路或改变口宽观感；入口锚点、碰撞尺寸、原捕获曲线和完整球体可见通道要独立锁定。
3. 一个Mesh不等于一个draw call。当前net是透明DoubleSide，Three.js默认可能双pass；性能门禁应测实际 renderer.info，不沿用旧 `userData` 自报。

## 8. 可检查的验收标准

下列是下一轮修复的门槛，本轮状态均为**未实施**。

### 8.1 最终几何和六袋契约

- 测试实际返回给 Scene3D 的 BufferGeometry，不能只测辅助法向或中间曲线。
- 六袋 cap 顶面绕序全部 +Y、底面 −Y；非退化面积阈值具名且与米制相符；去重位置后的壳体边关联为2，法线有限且长度正确。几何自交、非相邻内外边交叉、倒折面均为0。
- 共用边界位置差≤`1e-6 m`。皮圈与木帮/端座应接合处，不允许超过`0.1mm`的未声明裂隙；量化整段面域而非只查三个点或 `seamlessEndCount`。
- 用实际轮廓差集或有界网格/射线矩阵检查袋口外后弧和两侧接合面域，尤其原角袋depth129–156mm区域：不得透到地板或远处背景。明确排除合法入球通道和网袋孔隙。
- 十二个终端必须有实际支撑/闭合端面：内中外位置及端面内部采样成立；不能仍在38/41mm之间留空，也不能投影到台呢上就称“隐藏”。
- 冻结原 mouthWidth100/102mm、mouthCenter、jawSegments、shelfDepth、captureInset、dropHalfWidth、ballRadius，前后逐值/哈希相同。渲染不能把原入球开口封住、放宽或用更大的假洞遮住缺陷。
- 接头与皮裙无未声明三角相交、共面重复面；双面材质只服务正确表面的可见侧。平顶/侧壁分离法线后检查材质高光，不允许折叠阴影再伪装成皮革纹理。

### 8.2 实际页面和所有方位可见性

- 唯一验收入口仍为 `http://localhost:5199/`。确认服务cwd/进程及源码→dist→HTTP→独立浏览器实际script哈希一致；需要新构建时只在既有preview读完新dist后刷新**自己的标签页**。
- 1280×800和390×844各走“开始→俯视100”，保存完整六袋原图；记录实际canvas、DPR、浏览器、资源/构建信息。手机布局不替代最终真机/触摸与高DPR补验。
- 每袋记录左右端头、外后弧、内壁，至少覆盖台内正视、外侧反看与左右斜看。CPU可见性矩阵用12个方位×高/中/低三层高度；实际浏览器在标准俯视和两侧斜视核对六袋，接缝原始图以不被JPEG压缩吞掉的分辨率保存。
- 对已确认属于应可见包边的面域，连续覆盖、无断端、无通背景缝；允许正确的jaw遮挡和朝台内的进球开口。无木帮、台呢、jaw穿入皮圈的可见边界，不能靠相机固定到唯一“好角度”。
- 轻微旋转/改变视角高度时接头不闪、不出现跳变缺面。桌面与手机保留相同几何质量；不可为验收改变相机逻辑、控件位置或新手引导。
- 原截图D01–D06逐项标PASS/FAIL并链接新证据；D02/D04/D06近侧组合必须额外对照，不能仅凭远侧一张图关闭全部缺陷。

### 8.3 有界渲染成本与回归

- 护口/皮裙/缝边最多维持现有每袋3个可见部件；推荐合并为2个，不允许为每个采样点/裂缝增加独立Mesh。整袋现有7个命名Mesh的上限不因补缝增加。
- 当前程序化桌体有201个直接Mesh子节点（CPU装配统计，**不是实际帧draw calls**）；在同一环境、同一视角和温控档位对照 `renderer.info.render.calls/triangles`，本专项 draw calls 不高于原基线；网格细分有固定上限，建议每袋最多96个轮廓站点，超过需提供曲率误差与预算理由。
- 透明DoubleSide可能每Mesh双pass：[官方Material说明](https://threejs.org/docs/pages/Material.html)；本地r185 `WebGLRenderer.js:2133` 也可核实。不得用Mesh数量或 `mergedRopeMesh=true` 自报性能通过；也不为追求数字擅自改袋网透明表现。
- 旋转与重开若干次后几何/材质/纹理计数回到稳定值，无每帧创建几何、无新增持续渲染；回收路径可检查。
- 原物理与相机相关回归保持通过；按项目规定先typecheck及直接相关Vitest，交付前串行一次完整check，随后实际入口验证。无变化时不循环完整构建/浏览器重验。

## 9. 本轮验收状态和明确未验项

已完成：新基线对账、真实桌面/手机全台俯视、独立手动对侧与85斜俯视、六袋逐项定位、当前最终网格CPU根因、整体方案/备选/所有权和验收标准。所有数值结论可由留存脚本重放；截图和数值各自标明证据类型。

未完成且不冒称：修复实施及效果；用户原球局缓存；实体手机/高DPR；精确全方位时间序列与深度闪烁；运行时GPU draw-call基线；制造商袋口近照的可测量复刻。原图外链超时后未重复无变化重试，研究主结论不依赖其图片。

清理：独立球局标签已关闭，临时视口已reset；超时遗留的about:blank参考页也已关闭。本任务未启动Vite/Chrome/Puppeteer/构建/安装或后台任务；用户PID21302的5199预览服务保留。

恢复与结束的源码/构建指纹相同。研究只在本文和证据目录落盘。此前 `OPTIMIZATION_ACCEPTANCE.md` 不作为本轮成功依据；旧Graphify图（2026-08-31）没有当前pocket-render模块，未用其历史边证明当前结构，也未重建图或修改hook。
