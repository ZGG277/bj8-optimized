# 静谧球房 · Blender 第一版

2026-09-09 球桌接缝修复：当前运行时 GLB 由 `quiet-room-v1-repaired.blend` 导出；原始 `quiet-room-v1.blend` 保持不变。通过已连接的 Blender MCP 执行 `repair-table.py`，在原有 17 个网格之外增加台呢下承托和左右中袋台裙两个网格，合计 19 网格、24,684 三角形。原 17 个网格的位置、法线、UV、索引和世界变换逐项保持相同。前后同视角网页实图、GLB 网络哈希、结构射线检查与迁入说明见 `REPAIR_ACCEPTANCE.md` 和 `repair-evidence/`。以下第一版说明保留为原始制作记录。

来源：用户授权的本地原创建模，由 GPT-6 Astra 编写脚本，经用户已配置的 Blender MCP 在 Blender 5.2.1 LTS 执行。无第三方下载、付费模型或外部纹理。

- `quiet-room-v1.blend`：可编辑制作文件；默认展示本轮独立场景，保留原始默认场景。
- `table-reference.json`：`main@741cae4 / v1.5.1` 的 188 个台呢/木框/库边/袋口网格快照，仅作为制作参照。
- `provenance.json`：输入提交、制作脚本、参考快照、GLB 与 blend 的 SHA-256。

运行时导出位于 `src/scene/assets/billiards-room-v1.glb`，包含 17 个网格、22,860 个三角形、三个视觉组以及桌心/宽/长锚点。台呢、袋口、库边、球和球杆仍由现有游戏实现；制作文件中的 `BJ8_Reference_NotExported` 不包含在 GLB 中。

尺度契约：米制、游戏 Y 向上，台面位于 XZ 平面，桌面 1.27×2.54m，球半径 0.028575m。作者脚本将游戏坐标 `(x,y,z)` 转为 Blender `(x,-z,y)`，glTF Y-up 导出后恢复原坐标。台帮镶点不参与碰撞或瞄准算法。

重建：在项目工作树准备输出目录，用 Blender MCP 的 `execute_blender_code` 执行 `scripts/build-blender-room.py`，随后将参考快照作为 `REFERENCE_MESHES` 字面量注入 `scripts/preview-blender-room.py` 并执行。首脚本导出 GLB，第二脚本添加不导出的参考与预览相机并保存 blend。脚本中的 `OUTPUT_ROOT` 和保存位置绑定当前主工作树；迁移目录时先更新这两个目标。

实时适配：`src/scene/studio-environment.ts` 复用现有木纹、压低地面亮度，并负责真实相机高度下的灯具显隐、加载失败回退及异步卸载。GLB 没有外部纹理或解码器依赖。Vite 对本 GLB 显式内联，最终仍受 10 MiB 单 HTML 限制。

验证：`node scripts/verify-scene-asset.mjs` 检查实际字节和变换后的网格；`node scripts/verify-blender-scene.mjs` 在主项目 5199 入口执行串行浏览器验收。完整记录见 `SCENE_BLENDER_V1_ACCEPTANCE.md`。
