# v1.7.5 四项体验整合发布

状态：产品整合与发布前门禁通过；GitHub、妙搭 release 与正式入口结果在发布完成后写入 `PROJECT_BASELINE.md`。

## 范围与来源

- 基线：GitHub `main` 的 `8280ad4`，其产品内容标签为正式 `v1.7.4` / `ed47657`。
- 手机目标圈：来自 `bj8-mobile-seam-candidate`，紧贴合法球不叠画相交高亮环，分开单球提示保持。
- 四角袋外围：来自 `bj8-pocket-outer-gap-candidate`，新增纯视觉 `BJ8_CornerPocketOuterAprons`；物理袋口、库边与碰撞几何不变。
- 手感：来自 `bj8-feel-tuning-candidate`。力度 65 以下保持，65–100 压缩至满力 8.4m/s；侧旋映射为 0.65；幽灵球确认后的默认镜头为 30°。
- 湖面开场：来自 `bj8-opening-demo-candidate`。正式无参数入口首次载入自动进入湖面陪练并播放约 5 秒连续开场；末帧交回同一活相机；“再来一局”不重播，显式室内与云海入口保持原局前选择。
- 匿名统计模块没有接入产品、包装、生产数据或后台。

正式主工作树原有小红书工具、GLB loader 与其他未提交内容未进入本整合树。整合在独立工作树 `bj8-consolidated-release` 和分支 `release/consolidated-v1.7.5` 完成。

## 发布前验证

- `npm ls --depth=0`：通过；独立工作树初始缺依赖后只执行一次 `npm ci --ignore-scripts`，锁文件仅随版本号更新。
- `npm run check`：59 个测试文件、410 项测试通过；类型检查和单 HTML 构建通过。
- 单 HTML：9,568,874 bytes，SHA-256 `433d87a08c94fb15988918eaf40d60d33745fbbe36daf70fe2437b7d6b5d96af`。
- Blender 运行时 GLB：789,956 bytes、20 个网格、24,796 个三角形；SHA-256 `d9721995f6c9695f93f1aa797fbcfef49862493a1191c2a3e8cc5b77ac71e598`。新角袋外壳为纯视觉且不参与碰撞。
- 本地正式无参数入口实际播放“向湖心靠近”，约 5 秒后开球控件启用，完成一次真实轻杆出杆并进入顾燃回合；无页面错误。
- 显式 `?world=studio` 与 `?world=cloud-sea` 均保留局前世界选择，实际进入球局且无页面错误。
- Chrome 152 组合浏览器门禁 40/40 通过，覆盖桌面 1280×800、手机 390×844、三个世界、开场精确交接、四角外壳、目标圈、单画布、无溢出与实际轻杆；证据在 `shots/release-v1.7.5/prepublish/`。
- 纯函数与组合回归锁定：无参数/湖面入口开场、其他世界不自动开场；开场末帧逐项等于交接相机；30° 构图；力度与侧旋参数；目标圈相交筛选。

## 恢复点

- 产品恢复：`v1.7.4` / `ed47657c10dbaaaf5bebec448fbbdadc4a2899e5`；发布记录提交 `8280ad4f94558f6aa2a1d7d373d35238018dd895`。
- 妙搭恢复：包装提交 `07b2c2422c937b1ce4a97bfafabe952eb7eb16de`；release `7683734115342830815`。
- 回退代码不删除生产留言、不迁移数据库，也不改变妙搭权限。

本批 Trae 调用 0 次；无 Trae CLI、Session、模型 usage、输出、返工或采用结果。
