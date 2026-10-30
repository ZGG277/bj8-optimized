公主R2：tableFrameEnvelope由真实袋后缘求33mm扩展；export-table-craft-contract.ts导出新尺寸合同，Blender按6.3mm针距重建560段针脚，26640三角面不超R1。

[PROTOCOL]: 变更时更新此头部，然后检查 ../CLAUDE.md
# src/pocket-render/

> L3 | 父级: `../CLAUDE.md`

## 成员清单

`profile.ts`: 共享袋口可见孔洞、捕获线与 `pocket-well` 顶/底椭圆剖面；所有剖面值由 Scene3D 直接消费。剖面深度及高度随R3球/袋1.10×一起放大，中袋下腔同时确保容纳 `TABLE.ballRadius`，不放宽孔洞或修改物理规则。`pocketWellCrossSectionAtY` 和 `pocketWellContainsBallCenter` 只用于有限视觉安全域，非刚体碰撞。

`rope-net.ts`: 将菱形袋网的绳段合并为单一低面数 BufferGeometry；每袋一个实体 Mesh，不退回普通细线。

`seam-contract.ts`: 输出实际 jaw 顶面端座、连续后 U 形护口及木框裁口共用的世界坐标站点。端座沿现有 jaw 斜接剖面搭接至少一层皮板厚度；后弧从 jaw 切线连接到原 profile 后缘，不使用负深度隐藏延长或端点法向混合。

`trim-geometry.ts`: 从共享站点生成一个闭合的皮板/薄皮裙 L 形截面实体，并生成同站点、封端的缝边实体。统一最终三角绕序，折角保留独立法线，退化截面不生成零面积面；每袋一个护口 Mesh 和一个缝边 Mesh。

`frame-geometry.ts`: 由六袋契约拼接木框内裁口；接口 XZ 不再独立倒角偏移。R3外缘采用六段8×6mm内切圆润剖面和平滑法线，最高/最低点及外包络保持原值，皮圈相接的内边界不偏移。

`cushion-geometry.ts`: 供渲染与端座验证共同消费的库边剖面；R3库鼻/库顶随球径同步抬高；`createTableUnderlapGeometry`用当前150条库边与斜接替代旧GLB承托，保持1800三角及-0.4mm顶面；`TABLE_RENDER` 集中具名渲染尺寸，新增米制包呢 UV 和跨角衬连续法线；物理段与可视开口仍共用统一几何。

`cushion-join.ts` / `cushion-join.test.ts`: 连续库边与短角衬端点共享斜接剖面，消除独立挤出造成的共面顶面重叠；法向厚度和物理鼻尖保持不变，测试实际六袋的端点一致性及有界延伸。

`profile.test.ts`: 验证六袋的真实开口、捕获线与 Scene3D 共享的顶/底椭圆参数；不把辅助安全函数当作唯一袋壁证据。

`rope-net.test.ts`: 验证合并绳网的索引、有限顶点和低面数结构。

`trim-geometry.test.ts`: 检查最终皮壳/缝边/木框几何的闭合边、绕序、正体积及三角预算；六袋顶面朝上、内外轮廓不交叉。对真实 jaw 顶面执行边界 1 微米容差距离与面内严格射线承托检查，并覆盖木框接缝、原角袋漏空坐标和开放进球通道；冻结物理与 profile 输入。

`size-assembly.test.ts`: 实际动态承托在六袋中心/捕获窗口不遮挡、每段库边都有承托、圆润木框保持原包络与同源袋口顶点。

2026-10-30 独立实验：既有可见孔洞/皮壳/袋腔继续逐字消费共享143.5/123mm新口宽；不另扩捕获区。真实 daylight 护口由 scene/fairy-table-finish 处理，原曲线保留，三角预算不增加。
