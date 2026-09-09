# World Shell V3 · 三个新场景

> 本文保留 2026-09-08 独立实验树合入前的验收事实；这些场景随后作为 `v1.7.0` 候选合入正式主线，最终发布状态以 `PROJECT_BASELINE.md` 为准。

2026-09-08。用户认可云海 V2，要求另派 3 个子 agent 制作宇宙星系等不同场景，随后明确要求使用 Blender 并追求真实感。另两个方向为雨后竹林、极光冰湖。

状态：三套 Blender 实体场景首版已制作并接入本地试玩，功能与基础画面检查已完成；不将“使用 Blender”或测试通过等同于照片级真实感，也不代替用户审美验收。未提交、合并、推送或发布。

## 范围与分工

- 仅 `bj8-world-shell-experiment/`，基线 `8fc242a35b05a9fc3238e5767502a216e562b52e`、分支 `experiment/world-shell-cloud-sea`；保留既有未提交实验修改，不提交、推送、合并或发布。
- 中央 Session `01a07fba-f6be-7601-9dd0-76a6019a80f9`。三名实现 agent 为 `galaxy_scene`、`bamboo_scene`、`aurora_scene`，分别拥有各自场景作者脚本；中央负责公共导出器、注册装配、局前选择、文档与验收。先前程序化草案不作为新场景实体建模的交付物。竹林经过原 agent 的叶片俯仰/扭转返工，中央修正导出、表面和真实入口中发现的问题。
- 首次派发检测到 `gpu-monitor/throttle.on`：子任务错峰串行，构建与浏览器验收集中串行；不安装依赖、不启动额外服务。
- 云海已认可源文件冻结：`cloud-sea.ts` SHA-256 `69df6975edd668e38551890146d6c6fee251fda84a164e568dd9d6f8ea12da32`；`cloud-density.ts` `58d838b987b17f5f3d962bed1dc1bd501ddf76f24890b6b78615ea6125adc562`；`world-shell.ts` `5ef5e0ad2788ca2d1439453d3ce2e1776ccb8b7d129d394252d0e4bad6b3695c`。
- 新场景目标：围桌暗静区仍为相同空间尺寸，材质随环境变化，外围自然过渡；不修改球桌、灯光、相机、输入或对局物理，不增加动画循环或外部资源。

## Blender 产物与来源

使用本机 Blender 5.2.1 LTS，在隔离后台进程中通过 bpy 制作、导出；未安装依赖、调用付费模型服务或下载外部素材。房间资产模板强制付费 Meshy 流程不适用于此任务，因此使用本地作者脚本；没有声称通过该模板的外部资产/人工审批门禁。

| 场景 | 实体与地面 | GLB 字节 | 三角形 / 网格 |
| --- | --- | ---: | ---: |
| 宇宙星系 | 起伏行星、带厚度的星环、玄武岩浮岛、6×8m 黑曜石暗静区 | 484292 | 9080 / 4 |
| 雨后竹林 | 带竹节弯曲竹竿、枝与扭转叶簇、连贯苔地、圆角湿石板 | 2549792 | 54628 / 8 |
| 极光冰湖 | 连续厚冰面、细裂纹、贴地岩石与积雪、低山脊、透明极光曲面 | 1515172 | 15142 / 8 |

- 作者脚本：`scripts/build-world-galaxy.py`、`scripts/build-world-bamboo.py`、`scripts/build-world-aurora.py`，共用 `scripts/world_blender_common.py`。
- 可编辑源文件：`assets/blender/world-galaxy/world-galaxy.blend`、`assets/blender/world-bamboo/world-bamboo.blend`、`assets/blender/world-aurora-lake/world-aurora-lake.blend`。各目录另有 `preview.png` 与 `provenance.json`。
- 每套源文件中的桌体/预览灯与相机仅供作者查看，不导出到环境 GLB。离线 Cycles 预览不是运行时证据。
- 模型包含本地制作并打包的 PBR 微表面贴图。星空背景、星点和距离雾仍为实时大气效果，不宣称每个像素均来自 Blender。
- GLB 无动画、相机、导出灯或外链纹理。暗静区尺寸与高度沿用合同，材质随环境变化；世界模型不参加拾取或物理碰撞。加载失败保留基础地面，晚到资源与共享贴图有释放测试。

GLB SHA-256：

```text
galaxy      c13122666b25ce0096ef86fcf7b9f0df36b95466b81b45a02ed6b6bcd40d6a7d
bamboo      9c264d41c85e6b9fcb6b2d8cef2e26c14ae743b0d08fcc3665ddf00924328835
aurora-lake a7f0215b7ccc4e06f395301674ffdc65c3174e257d1d208453c8f6447ab86f26
```

## 验证与真实入口

- 本轮先完成一次全量单测；最后的材质/装配增补又通过 typecheck 和 6 个定向测试文件（31 项）。最后纯 Blender 资产修订后重新构建并通过真实资产校验。
- `verify-world-boundary.mjs`：153 个受保护源文件/原始资产/构建配置与 `v1.6.0` 基线一致；上述三份云海冻结文件哈希也一致。`git diff --check` 无输出。
- `verify-world-assets.mjs`：真实 GLB 结构、有限顶点、命名根、预算、来源哈希、打包纹理及 HTML 中逐字节相同模型均通过。新增极光 PNG RGBA 检查，防止 Blender 默认 RGB 导致透明光幕变成硬色带。
- 修复 Vite 相对模型 URL 在单 HTML 内联后解析错误的问题：三个新模型现随 HTML 内嵌，不需要另行加载世界 GLB。
- 最终 HTML：8987439 字节，SHA-256 `f8a2a3dc632bf295295b084f8b3ebebd7b4fae0c5c22637ff5dcb2378cf0d84c`。从实际 `http://127.0.0.1:5201/?world=galaxy` 读取并计算得到相同哈希。
- 5201 监听进程 PID 59362，cwd 实测为本实验目录；由本机用户任务 `com.zgg.bj8-world-shell-preview` 托管，未新增第二个 Vite 服务。
- 三套最终 GLB 均检查桌面 1280×800 与竖屏 390×844 的俯视/15% 低机位。星系完成真实手动转动及 Enter 轻杆，状态由“开球”变为“出杆”并返回俯视；这两张交互截图来自最终位置微调前的同一装配实现，不冒充最终模型构图。
- 最终页面竖屏局前五项选择完整可见，无横向溢出；局前 canvas 数 0，三套新场景开局后 canvas 数均 1，页面宽度/scrollWidth 均 390。室内与云海入口重新开局正常，URL 对应的单选项正确。
- 最后生产入口检查的浏览器日志无错误、无模型失败或 shader 编译错误；仍有基线 `THREE.Clock`、`PCFSoftShadowMap` 弃用提示。构建保留原有大单包警告，不称其为零警告。

截图位于 `shots/world-scenes-v3/`：

- `{galaxy,bamboo,aurora-lake}-desktop-{overhead,low}.jpg`
- `{galaxy,bamboo,aurora-lake}-mobile-{overhead,low}.jpg`
- `mobile-world-selection.jpg`、`studio-mobile-smoke.jpg`、`cloud-sea-mobile-smoke.jpg`
- `galaxy-desktop-orbit.jpg`、`galaxy-desktop-shot.jpg`（交互实现证据，非最终构图）

## 交付边界

这是可试玩的 Blender 首版，仍有有意简化的远景地形与植被，不能称为照片级仿真或用户已认可。星环在竖屏低机位会部分出框；极光目前静态，不做连续动画，不扩展核心灯光预算。未做真实手机硬件、Safari、长时间温控/性能或完整一局胜负回归。

所有本轮 Blender 进程已正常退出，临时测试标签已关闭，视口覆盖已复原；用户原云海标签和本地预览服务保留。服务仅保证当前登录会话可用，不承诺电脑重启后自动恢复。所有产物停留在独立本地实验树。
