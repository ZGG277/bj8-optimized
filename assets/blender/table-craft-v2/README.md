# 台内精修 V2 制作源

本地原创建模，使用用户已配置的 Blender 5.2.1 / Blender MCP；不含付费或第三方下载素材。

- `table-craft-v2.blend`：独立 `BJ8_Table_Craft_V2` 场景。`BJ8_PocketCraft` 为运行时资产；`Craft_Reference_NotExported` 保留游戏的实际台面、库边、球及球房参照。纹理打包在 blend 中。
- `surface-contract.json`：直接从当前 `POCKETS`、`pocketRenderProfile`、`pocketSeamContract` 导出的米制合同。袋口形状变化必须重新生成此文件与 GLB；资产测试会阻止旧模型继续混用。
- `runtime-surface-reference.json`、`cloth-albedo.png`、`ball-0.png` … `ball-15.png`：从实际游戏页读取的网格/法线/UV 与原创 Canvas 纹理，仅供 Blender 制作参照。
- `provenance.json`：用户原始指令、来源和文件哈希。

运行时资产是 `src/scene/assets/table-craft-v2.glb`，只包含双道针脚和两道圆包边；所有顶点在现有皮壳顶面内，球桌实际碰撞轮廓由 TypeScript 统一几何维护。球体和库边在游戏中继续按实时物理快照生成/更新。

重新制作时先在 Blender 打开第一版球房工程，使 `BJ8_Quiet_Room_V1` 可作为只读参照；将本合同作为 `SURFACE_CONTRACT`、文件 SHA-256 作为 `CONTRACT_SHA256` 注入 `scripts/build-blender-table-craft.py`，通过 MCP 执行。该脚本仅复建自身的 V2 场景。再将最新运行时参考作为 `RUNTIME_SURFACES` 注入 `scripts/update-blender-table-preview.py`；保存新的 blend。

针脚长度 2.7mm、节距 4.9mm、半径 0.25mm；圆包边半径 0.44mm，两端退入承托面 1mm。最终 520 段针脚合并绘制；不按每根缝线创建运行时对象。验收使用 `npm run test:unit -- scripts/table-craft-asset.test.ts`，不能用 Blender 导出成功回执代替几何检查。
