# scene/

`lake360.ts` / `lake360-explorer.ts` / `assets/lake360.glb`：Blender 作者网格、方向连续天空、解析反射及 10Hz 水波；暂停/隐藏页/卸载停止请求。仅 `?lake360=1` 替换地面和外围，不修改正式世界资产。

> L2 | 父级: `../CLAUDE.md`

`studio-environment.ts`: 共用 Blender 桌体与比赛照明、Quiet Zone 和 World Shell 装配器；开始对局后才解析 GLB，加载失败保留基础台底/地面，卸载后到达的资产自行释放。保留单个 renderer 和 rAF，灯具显隐使用实际相机高度；主光继续消费现有温控阴影预算。

`assets/billiards-room-v1.glb`: Blender 生成的自包含桌体外壳、球房和吊灯，保留米制 Y-up 锚点；不含台呢、库边、袋口、球或碰撞体。生产构建显式内联，制作源位于 `../../assets/blender/billiards-room-v1/`。

`table-surfaces.ts`: 台面米制 UV、皮壳展开和单次绘制的球底接触阴影；根据实际显示球位跟随对局/规划，落袋隐藏，不引入摩擦参数或动画时钟。

`table-details.ts`: Blender 六袋针脚与包边装配器；异步失败保留基础袋口，卸载后到达的资源自行释放。

`assets/table-craft-v2.glb`: 沿当前六袋皮壳站点制作的 520 段双道针脚和两道细包边，合并为两个网格；制作源与纹理位于 `assets/blender/table-craft-v2/`，由 `scripts/table-craft-asset.test.ts` 校验真实字节与承托。

`world-shell.ts`: 最小壳体合同与资源所有权；程序化壳体独占几何、材质、显式纹理并幂等释放，室内借用 GLB 由总场景释放。云海静区为暗冷灰石质，围桌平坦、外围圆角缓坡并渐隐到薄雾，室内保留原石材地面。

`cloud-sea.ts`: 固定种子的连续体积云与暮色天空，单个不透明绘制批次、最多 64 步和密度提前退出；近台云顶下降并压暗、外围自遮光与远距散射。无外部资源、全局照明变更或动画时钟。

`cloud-density.ts`: 开局一次生成 64³ / 256 KiB 周期性细胞噪声与分形密度；圆润云团的程序化三维建模数据。

`world-registry.ts`: 五种正式世界的外围与专属地面配对注册表；默认保留室内，云海维持已认可 V2，另外三种在局前与其并列可选。

`galaxy.ts` / `galaxy.test.ts`: 星系的静态银河/细星大气基础，以及仅在 GLB 就绪前使用的暗地面；最终行星、岩岛与静区来自 Blender，不使用程序化行星作为最终模型。

`blender-world.ts` / `blender-world.test.ts`: 从自包含 GLB 提取外围和静区命名根，替换临时地面，共享材质/贴图由单一所有者回收；失败回退和卸载后晚到资源均有测试。

`world-atmospheres.ts`: 仅远景天空/星云大气，不产生竹林、冰岸或地板；现有比赛灯光不变。

`assets/world-galaxy.glb` / `assets/world-bamboo.glb` / `assets/world-aurora-lake.glb`: Blender 5.2.1 生成的真实实体、PBR 微纹理及两个命名根。作者源、预览和哈希记录位于 `assets/blender/world-*/`。构建脚本在把 ESM 移入 HTML 前内联三份模型，防止相对路径基准变化。

`studio-environment.test.ts` / `world-shell.test.ts`: 世界隔离、体积数据预算/周期接缝、缓坡拓扑、基线桌体变换、异步失败和纹理/几何/材质幂等释放测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
