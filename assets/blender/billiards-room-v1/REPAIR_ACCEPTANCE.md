# 球桌接缝及中袋台裙修复

修复制作基线 `91331ffacb07163b9b46d11d24ffcebf6c20f461`，最初在隔离分支 `repair/table-blender-seams` 完成，随后纳入 v1.7.2 发布候选。

## 直接 Blender 操作

已连接的 Blender MCP `get_addon_status` 确认 Blender 5.2.1 LTS、协议 5、插件 1.6、telemetry off。`execute_blender_code` 打开本树原始 `quiet-room-v1.blend`，在 Blender 进程内执行 `repair-table.py`，新增两个可编辑网格并原生导出 GLB，另存 `quiet-room-v1-repaired.blend`。`before-blender-ui.png` / `after-blender-ui.png` 是 `bpy.ops.screen.screenshot` 的真实 Blender 界面截图。没有以离线脚本伪装 Blender 操作，没有外部素材或付费生成。

原始 blend SHA-256 保持 `48f168d82800b1d75c722ffc32ad1818acf4a70f83559deeb62205364eaf41f5`。修复源和导出物完整指纹见 `repair-evidence/structure-and-hashes.json`。`repair-evidence/blender-edit.json` 记录对象、范围与执行版本。

## 修复及边界

- `BJ8_ClothUnderlap`：沿现有实际 150 段库边参考剖面形成封闭承托带，上表面 Y=-0.0004 m，下沿 Y=-0.038 m；内侧向台呢底下搭接 1 mm，外侧止于既有库边后沿。台面和球路上方无新增顶点。
- `BJ8_MiddlePocketAprons`：左右中袋外侧各一个实体挡板，内沿 |X|=0.715 m，与袋口最后缘 |X|=0.713 m 留 2 mm，Y 范围 -0.253 至 -0.003 m；封闭分段台裙原有空口。
- 全部原有 17 个网格的属性数组、索引和世界变换逐项完全一致。`table-craft-v2`、台呢、库边、球杆、球和物理代码均未修改。

## 真实入口验证

URL `http://127.0.0.1:5218/?lake360=1`，服务目录为此隔离树。进入首页点击“开始对局”。Chrome 实际渲染、未登录的本地应用；桌面 1280×800，手机模拟视口 390×844。`capture-repair.mjs` 同一份脚本按固定相机/目标拍摄 desktop-low、side-right、side-left、seam-close、mobile-low 共五组 before/after PNG。对局的随机球序不作为差异验收对象。

实图确认：原 seam-close 的浅蓝水面通条消失；左右中袋外壳缺口均被实体木色台裙封闭；手机低视角台面连续。两次浏览器运行均无 pageerror。after 的两次实际二进制 GLB 响应 SHA-256 均为 `bde8a27207fad0f13dde82e828b7b46a78a5b088a76b0b8eb166932c6c44ac7d`，与磁盘修复 GLB 一致，五个视角均找到两个新增运行时节点。原始 response 日志还保留 Vite 模块包装响应，其 URL 带 `import&url`，不是 GLB 二进制。

## 验证命令

在此工作树执行，均通过：

```sh
npm ls --depth=0
node assets/blender/billiards-room-v1/verify-repair.mjs
node scripts/verify-scene-asset.mjs
npm run typecheck
npm run test:unit -- scripts/table-craft-asset.test.ts src/scene/blender-world.test.ts
PHASE=before node assets/blender/billiards-room-v1/capture-repair.mjs
PHASE=after node assets/blender/billiards-room-v1/capture-repair.mjs
```

结构验证覆盖 150 段底部射线承托、2 个台裙封闭、2 个中袋腔体未被封堵、原始 blend 未改、原 17 网格字节级属性保留。GLB 为 781,964 bytes、19 网格、24,684 三角形，无退化面、有限法线，通过既有 2 MiB / 30,000 三角形预算。定向 Vitest 2 文件 / 11 测试通过。完整 `npm run check` 留给父任务将最小修复迁入主题候选后的单次交付门禁；不重复构建。

依赖为空的新树按合同执行 npm ci；首次因沙箱 DNS ENOTFOUND 失败，诊断后同一命令在联网审批通过的环境安装成功。没有复制或链接其他工作树的依赖。`game-dev` CLI 不在当前 PATH，本次以已有 Blender MCP 与项目 GLB 验证器提供上述具体证据，不宣称已创建 game-dev canonical package。

## 最小迁入

父任务将 `src/scene/assets/billiards-room-v1.glb`、本资产目录新增/修改文件及 `scripts/verify-scene-asset.mjs` 的单处承托区域检查迁入 `bj8-theme-entry-candidate`。原始 blend 无需覆盖。运行时原有 `studio-environment.ts` 已消费该 GLB，新增节点属于 `BJ8_TableShell`，不需要修改应用装配。迁入后核对 GLB 哈希，并在候选的实际用户入口补验新增节点和相同受影响视角。

验证器的变更仅允许具名 `BJ8_ClothUnderlap` 在台呢下 -0.03801 至 -0.00039 m 的区间；其实际承托和袋腔避让由 `verify-repair.mjs` 独立检查。
