# scene/

> L2 | 父级: `../CLAUDE.md`

`studio-environment.ts`: Blender 视觉资产与摄影灯光适配器；开始对局后才解析 GLB，加载失败保留基础台底/地面，卸载后到达的资产自行释放。保留单个 renderer 和 rAF，灯具显隐使用实际相机高度；主光继续消费现有温控阴影预算。

`assets/billiards-room-v1.glb`: Blender 生成的自包含桌体外壳、球房和吊灯，保留米制 Y-up 锚点；不含台呢、库边、袋口、球或碰撞体。生产构建显式内联，制作源位于 `../../assets/blender/billiards-room-v1/`。

`table-surfaces.ts`: 台面米制 UV、皮壳展开和单次绘制的球底接触阴影；根据实际显示球位跟随对局/规划，落袋隐藏，不引入摩擦参数或动画时钟。

`table-details.ts`: Blender 六袋针脚与包边装配器；异步失败保留基础袋口，卸载后到达的资源自行释放。

`assets/table-craft-v2.glb`: 沿当前六袋皮壳站点制作的 520 段双道针脚和两道细包边，合并为两个网格；制作源与纹理位于 `assets/blender/table-craft-v2/`，由 `scripts/table-craft-asset.test.ts` 校验真实字节与承托。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
