2026-10-28：`impact-feedback.ts` 独立拥有真实碰撞/落袋 glint 与袋口反馈，Scene3D 在 daylight 和 fallback 均挂载；crystal-style 只保留宝石内部结构。三个实例批次提供 160ms 碰撞 glint、220ms 落袋 glint、440ms entryX/entryZ 光圈和 520ms 粒子；每次落袋 8 枚金色/珠光粒子，热档 4 枚，减少动态仅保留 glint，白球落袋使用中性珠光色。事件按杆/索引/内容去重，跨杆或时间回退清空；active 到期停止续帧，dispose 释放组件几何、材质与实例缓冲。

V4（2026-10-12）：jewel-ball-finish 从同一七色表派生全色球与半色球，后者以不透明珠光白色腰带遮罩透射；保留编号 UV。hot 源没有 transmissionMap，显式借用 quality 原号码遮罩，不伪造空白号码。三张图复用通道承载色彩、透射/发光遮罩、粗糙度/珠光。

V3（2026-10-11）：袋口共享倍率收至 1.28，profile 底部半轴仍容纳完整球体；装饰袋口沿两轴同步收缩。daylight-environment 管理城堡天空/日光反射；castShadow 在质量档开启家具与台面，hot 家具不投影。宝石弦长吸收和内部环境反射为低成本近似，原始 GLB 保持不变。

V2（2026-10-11）：daylight-jewelry 同步收窄外侧家具与装饰袋口；实际袋口沿 size-contract 1.65。castle-platform 为独立可释放的程序化城堡平台，public-worlds 注册；Game 切换场景只重建 Scene3D，保留球局。湖面继续保留。

日光湖面源码候选：daylight-jewelry.ts 接入珠贝金边桌与 16 编号宝石球，保留物理台呢/库边/袋内几何。两档完整桌体、分档贴图与折射，加载失败恢复旧资源。视觉仍待用户确认。

R2最终几何：六袋下层裙边以局部圆润下凹让出真实袋腔；移除两枚侵入侧袋的内部饰片，补缝位于井后并延长至-.113m。金线不与井体相交。袋口细包边6侧光滑法线、同路径/半径，GLB24448三角面。

R2候选：柔和绿色细呢、可辨冷青水晶；共享球径75.438mm、角袋150mm/中袋153mm，扩大容错；未部署，须离线图验收。

公主请开球R1预算修复：96边界平面水保留全部外轮廓及原shader；createBallRenderGeometry以物理半径生成web48×32/mini20×12/hot16×10；target-rings与overlay-batching合并无语义变化的平面标记；湖面不得作为预算可删装饰。

公主请开球默认湖面无需URL；相机far由worldId=lake启用。球杆象牙白只改数字材质，杆长/先角/皮头接触位置不变。

# scene/

2026-10-15 球色续调：用户反馈v2球体仍暗、与开场不符。jewel-ball-finish降低正常档透射96%→52%，增加体色反射与七色明度、减轻吸收；保留边缘透光和号码/腰带遮罩。桌体象牙/金线、全局光照、物理与视频不变。最新标识ivory-gold-bright-gems-v3-20261015，仅本地候选。

2026-10-15 画质候选：用户明确桌体为象牙并含金线。daylight-jewelry降低城堡补光与曝光，全部桌壳（包括源GLB命名为Crystal/Pearl的结构）用不透明暖象牙细纹、低清漆、无虹彩，金饰独立使用金属反射。jewel-ball-finish减少混白和额外天空加亮，保留透射、编号与珠光腰带，hot仍不透明降级；table-surfaces强化柔和接触阴影，gem-caustics降低光晕。源GLB、七色配对、球袋几何与开场视频保持原样；以手机同视角截图判断视觉结果。

`lake360.ts` / `assets/lake360.glb`：Blender 清水候选：真实浅沙床与稀疏石块、透明 Fresnel 水层、方向连续天空，以及解析细波/焦散；仅 3 批次、无贴图与额外反射渲染。10Hz 请求节奏，隐藏页/卸载/减少动态偏好停止请求，默认水波开启，无环顾或暂停入口。公开 `world=lake` 与旧 `lake360=1` 均启用湖面，室内/云海选择会清除覆盖。

> L2 | 父级: `../CLAUDE.md`

`studio-environment.ts`: 共用 Blender 桌体与比赛照明、Quiet Zone 和 World Shell 装配器；开始对局后才解析 GLB，加载失败保留基础台底/地面，卸载后到达的资产自行释放。保留单个 renderer 和 rAF，灯具显隐使用实际相机高度；主光继续消费现有温控阴影预算。

`assets/billiards-room-v1.glb`: Blender 生成的自包含桌体外壳、球房和吊灯，保留米制 Y-up 锚点；不含台呢、库边、袋口、球或碰撞体。生产构建显式内联，制作源位于 `../../assets/blender/billiards-room-v1/`。

`table-surfaces.ts`: 台面米制 UV、皮壳展开和单次绘制的球底接触阴影；根据实际显示球位跟随对局/规划，落袋隐藏，不引入摩擦参数或动画时钟。

`table-details.ts`: Blender 六袋针脚与包边装配器；异步失败保留基础袋口，卸载后到达的资源自行释放。

`glb-loader.ts` / `glb-loader.test.ts`: 自包含 GLB 的统一加载边界；普通相对 URL 保留既有加载，打包为 data URL 时直接解码并交给 GLTFLoader.parse，避免小工具容器触发 fetch。

`assets/table-craft-v2.glb`: 沿当前六袋皮壳站点制作的 520 段双道针脚和两道细包边，合并为两个网格；制作源与纹理位于 `assets/blender/table-craft-v2/`，由 `scripts/table-craft-asset.test.ts` 校验真实字节与承托。

`world-shell.ts`: 最小壳体合同与资源所有权；程序化壳体独占几何、材质、显式纹理并幂等释放，室内借用 GLB 由总场景释放。云海静区为暗冷灰石质，围桌平坦、外围圆角缓坡并渐隐到薄雾，室内保留原石材地面。

`cloud-sea.ts`: 固定种子的连续体积云与暮色天空，单个不透明绘制批次、最多 64 步和密度提前退出；近台云顶下降并压暗、外围自遮光与远距散射。无外部资源、全局照明变更或动画时钟。

`cloud-density.ts`: 开局一次生成 64³ / 256 KiB 周期性细胞噪声与分形密度；圆润云团的程序化三维建模数据。

`world-registry.ts`: 世界外围与专属地面配对注册表；公开入口为室内、云海和湖面，宇宙、竹林、极光仍保留注册与资产，但不再出现在局前选项。

`galaxy.ts` / `galaxy.test.ts`: 星系的静态银河/细星大气基础，以及仅在 GLB 就绪前使用的暗地面；最终行星、岩岛与静区来自 Blender，不使用程序化行星作为最终模型。

`blender-world.ts` / `blender-world.test.ts`: 从自包含 GLB 提取外围和静区命名根，替换临时地面，共享材质/贴图由单一所有者回收；失败回退和卸载后晚到资源均有测试。

`world-atmospheres.ts`: 仅远景天空/星云大气，不产生竹林、冰岸或地板；现有比赛灯光不变。

`assets/world-galaxy.glb` / `assets/world-bamboo.glb` / `assets/world-aurora-lake.glb`: Blender 5.2.1 生成的真实实体、PBR 微纹理及两个命名根。作者源、预览和哈希记录位于 `assets/blender/world-*/`。构建脚本在把 ESM 移入 HTML 前内联三份模型，防止相对路径基准变化。

`studio-environment.test.ts` / `world-shell.test.ts`: 世界隔离、体积数据预算/周期接缝、缓坡拓扑、基线桌体变换、异步失败和纹理/几何/材质幂等释放测试。


`public-worlds.ts`: 室内/云海/湖面公开场景的唯一注册表；小工具构建只消费它，历史 world-registry 仍保留完整可恢复场景。
`table-details.ts` / `table-details.test.ts`: 针脚使用带迟滞的距离 LOD，远景隐藏 16,640 三角形，近景恢复原网格，包边和基础袋口始终保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-10-02：湖面页面隐藏时显式清除 10Hz 定时器，恢复后重新开始，卸载时移除 visibility 监听。小工具通过 Scene3D 的预算门禁按需减少装饰，原 Blender 资产保留。

R5候选：蓝丝绒[28,88,150]；球径84.582mm、角袋168mm/中袋171.36mm，针脚资产按同合同重生成。围桌8盏定向射灯取代面光，降低环境补光；内部切面薄膜虹彩是有界艺术化火彩，不等于物理光谱焦散。
R5第二轮：按独立像素审查修复悬空灯头（圆角矩形轨道+连接颈）、4盏中性台面射灯与4盏窄角彩色边框射灯；蓝呢[38,104,167]及小幅主光提升改善中心/红球识别。彩色效果为真实彩灯反射加薄膜反光，不宣称真实光谱色散焦散；高低质量切换恢复薄膜测试。

R6候选：数字象牙白不透明家具、可见金色镶嵌波纹/花饰、深蓝丝绒；红/黄宝石各一批内置发光球芯，共两批实例、零新增点光源，无独立动画。发光为材质自发光及艺术化内部散射，不宣称逐球真实灯光/焦散。球径90.297mm（较R5增加6.76%）、角袋177mm/中袋180.54mm同合同；针脚6.7mm保持原资产预算。1.62球尺度导致固定开球扩散回归，未采用，保留试验记录。

R6第二轮：独立审查指出深蓝呢上黑8轮廓及象牙白腿过暗，提升现有中性环境/半球补光，不加灯；8号炭黑底色、浅金号码及小幅非宝石自发光下限，保持珍珠白球区别。宝石芯不再加亮。

R7: 台呢与包库采用既有 soft-green [48,105,79]，下托布和中袋补缝同步绿色；象牙金饰/内部宝石芯/灯光/球径/物理保持R6第二轮。开场完整家具包围盒独立拟合，不沿用只覆盖台面的俯视解。

2026-10-12 日光 V5：球径 85.725mm，四角袋 140mm、两中袋 120mm；可视 GLB 球按共享物理半径缩放，袋口装饰按各袋口宽分别变形。保留 V4 彩色宝石和珠光白腰带。本地候选，未发布。

2026-10-12 V5 XHS：原GLB仍只读，专用构建无损外置贴图；glb-loader.parse使用相对包内图片URI，不执行联网请求。Scene3D小工具预算等daylight模型就绪再核，不将临时旧家具视作最终场景；预算超限仍暂停，未放宽上限。原V5普通预览不重新构建。

2026-10-13 CASTLE-GEMS: castle-platform is an original procedural mountain citadel with merged stone/roof/terrain, tiled patina, sheer curtains and waterfall. Its render-only update callback advances wind during existing frames; idle still sleeps. gem-prisms uses single-pass facet/environment refraction illusion, masks numbers/belts, and uses one sample in hot tier. No imported movie assets, extra lighting rig or full-screen bloom.

2026-10-13 GEM-LIGHT RC3 supersedes CASTLE-GEMS: removed gem-prisms; smooth physical transmission with masked opaque numbers/pearl belts. One instanced, sun-directed caustic approximation follows real ball rotation; no independent flash timer. castle-platform models only the detailed terrace. Normal transmission retained within budget; hot tier uses the existing opaque fallback.

2026-10-15 宝石工艺v4：用户要求稍增通透、细化袋口、哑光象牙桌边。正常档透射66%、吸收距离0.50m；象牙粗糙度0.56/清漆0.035。table-refined.glb只从完整原始GLB恢复六袋内沿圆边与皮衬，其余基于balanced；同一物理派生变形后用45度折角法线平滑，保留硬边。脚本scripts/refine-pocket-crowns.py与artifacts/gem-craft-20261015/model-provenance.json记录来源/派生哈希，原始文件不改。正常场景实测64 calls、94732 triangles、gemTransmission=0.66；hot沿用原低模/不透射保护。

2026-10-23 本地候选：castle-platform采用暖灰石板、错缝/磨边和高粗糙度，daylight-jewelry结构桌边降白并取消清漆，金线反光收柔；球光学、整体光照和物理不变。

## 2026-10-24 公主材质
castle-platform 按用户最终选择恢复已核哈希的暖灰石板候选，保留错缝、下凹砖缝和磨边；daylight-jewelry/textures 增加细微丝绒起伏与柔和 sheen。保留象牙桌体、原开场、宝石球光学与球体物理。

2026-10-25：castle-platform 在既有错缝布局上优化为大块暖灰大理石、细灰石纹及独立细缝凹凸/粗糙度贴图，低清漆柔光；几何/绘制批次不变，三张512²贴图由world shell独占释放。标识 marble-nature-polish-20261025。

2026-10-30 独立 fairy-gems 实验（不替换冻结 R3）：daylight-jewelry 调用 fairy-table-finish 从实际 GLB 分离上缘完整组件，浅青透射88%/厚32mm，仅一个 FrontSide 材质且复用宝石球折射目标；象牙下架、金线与球光学保留。hot 上缘不透射。六袋原圆弧护口另分离，纵向厚度收至82%、60度折角法线、缎面香槟金；不切掉原轮廓、不增三角面。台呢使用更干净的青绿细呢，减少乘色灰雾、sheen 和法线起伏。共享口宽由140/120mm温和增至143.5/123mm（+2.5%），球径83.15325mm、jaw半径、台阶、捕获深度、摩擦与规则不变；可见开口/碰撞/瞄准继续同源。当前实现待主PM测试与真实入口截图，未声称视觉验收。

`fairy-table-finish.ts`：隔离实验实际GLB上缘/六护口的完整组件分离、单材质和hot回退；对应宿主文件测试在 `../../scripts/fairy-table-finish.test.ts`，读取实际两档GLB，验证三角总数守恒、上下结构隔离及有界材质批次。

2026-11-01 用户授权D2球桌合入主线：cloth-fibres.ts提供周期随机细绒；pocket-collars.ts生成同源六袋金属盖与薄皮裙；table-deck.ts替换y>-0.10m旧上部碎件，保留下体，以同轮廓象牙/1.5mm垫片/透明层接合。fairy-table-finish.ts补充旧袋口组件退休；不再使用D1独立table-refinements玻璃条。daylight视觉标识为princess-table-detail-d2-integrated-20261101。主线现有impact-feedback、控制、开场等保留，验证与范围见../../TABLE_DETAIL_INTEGRATION_20261101.md；实验D2记录不代替集成后运行验收。
