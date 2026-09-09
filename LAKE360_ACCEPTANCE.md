# 湖面 360° 本地实验

状态：首版原型实现、构建与本地功能验收通过；美术方向待用户评价。未提交、未发布，未进行手机真机或 GPU 耗时实测。

## 范围与基线

- 工作树：`bj8-lake360-experiment`；分支 `experiment/lake360`；HEAD `7aec178050af4860fc8182ca6b391156b9c0cda1`。
- 业务基线 v1.7.0 / `fd7d412`。物理、规则、对手、出杆与输入源码未修改；只扩展场景装配、实验镜头和本地入口。
- 已验收独立入口（服务现已关闭）：`http://127.0.0.1:5216/?lake360=1`。旧 5201 未操作。
- `?lake360=1` 用湖面替换当前世界外围；未带参数时保留正式世界。

## Blender 实际执行

GPT-6 通过 Blender MCP `execute_blender_code` 实连 Blender 5.2.1 LTS。现场为未保存、dirty=false 的默认 Scene，包含 Cube/Light/Camera。新建 `BJ8_Lake360_Experiment`，保留原 Scene，不删除原对象。可用 Blender 场景下拉切回 Scene；本任务文件为 `assets/blender/lake360/lake360.blend`。

- 作者操作脚本：`assets/blender/lake360/build_lake360.py`，MCP 执行，无离线渲染或生成服务。
- 网页资产：`src/scene/assets/lake360.glb`，192,088 bytes，2 meshes / 2 materials，Blender 记录三角上界 9,888，实际运行时精确 9,792 三角形。
- 来源与 SHA-256：`assets/blender/lake360/provenance.json`。
- 湖面网格半径 900m，天空球半径 960m；地平线同向天空函数连续衔接；不放地面舞台/外圈布景/列车。
- 网页天空与水反射共用方向函数，细波由两组正弦斜率产生，近处保留涟漪、远处收敛。水下桌体暗倒影为低成本解析轮廓，不是精确场景倒影；无 SSR、CubeCamera 或额外反射渲染。
- 水波只每 100ms 请求既有 renderer（10Hz 目标），暂停、后台页、prefers-reduced-motion 时停止请求；继承比赛移动帧上限。既有比赛照明仍保留。
- 底部“环顾湖面”支持拖动、方位与仰俯滑杆；“回到球桌”退出，不改对局状态。

## 验证记录

- 首次 `npm ls --depth=0`：所有依赖缺失。
- 首次同锁 `npm ci --ignore-scripts --cache .npm-cache`：沙箱 DNS ENOTFOUND 导致失败；无依赖/锁变更。
- PM 允许改变网络执行条件后，require_escalated 同命令恢复一次成功（128 packages, 17s）。未运行 audit fix，未修改依赖。
- `npm run typecheck`：通过。
- 定向 Vitest：`studio-environment.test.ts`、`world-shell.test.ts`、`world-registry.test.ts`，3 文件 / 19 项通过。
- `git diff --check`：通过。
- `npm run check`：54 文件 / 392 项通过，构建成功，见 `shots/lake360/check.log`。
- 首轮截图后仅微调天空/湖水色彩，`npm run typecheck` 与真实双视口复验通过；最终单独构建成功，见 `shots/lake360/final-build.log`。
- 最终 `dist/index.html`：9,250,457 bytes，SHA-256 `da51da338a81eec066a6d70238fd9fbd1a7adf10585c403f057653629b0b2d4b`。含原五世界，整体包体不是新增湖面大小；生产格式已构建，浏览器验证的是下述 Vite 源码入口，不冒充生产入口验收。
- 双视口均：真实入口开始对局→加载GLB→四向/上下环顾→回到球桌→暂停水波1秒无新增帧→真实鼠标点击放球与蓄力松手出杆；两者均 `phase=rolling / moving=true`。
- `shots/lake360/browser-evidence.json`：最终无 JS 错误及非图标 HTTP 错误。独立采集所有 HTTP>=400 的短诊断精确捕获 `http://127.0.0.1:5216/favicon.ico` 404，见 `resource-diagnostic.json`。首轮三条泛化404日志未直接当作资源可用证据，最终按具体URL分类。
- 截图：`shots/lake360/{desktop,mobile}-{game,north,east,south,west,up,down}.png`，14张，实际已目检。`up/down` 为±85°。水平看向天空/湖水连续；俯视近水与游戏俯视周边纹理较淡、接近纯色，正弦水纹偏整齐，属于首版美术限制，未宣称审美定稿。

## 负载与证据口径

使用 `scripts/verify-lake360.mjs` 在同一个本地服务串行检查 1280×800@1 和 390×844@3 的 Chrome 视口，已记录真实绘制 DPR、GPU renderer 字符串、drawcalls、三角形、CPU render 提交耗时平均/p95、展示帧间隔平均/p95。移动视口模拟不等于手机真机；CPU提交耗时不等于GPU帧时间，水波10Hz展示率不等于设备最大性能。

## 进程与边界

本任务安装进程已结束，测试Chrome由各脚本 finally 关闭；独立Vite原 PID 61594、端口5216，验收结束 Ctrl-C 返回130，lsof确认端口无监听。本任务无保留服务或浏览器。Blender 是预先打开的用户进程，保留。旧 5201 和其它银河/世界外壳实验未修改或停止。


## 最终性能采样（12秒/视口）

设备：Apple M5 / macOS 26.6.2 (25G83)，Chrome 152.0.7977.84，ANGLE Metal。未登录本地入口，无真实手机连接。

| 指标 | 桌面 | 手机视口模拟 |
|---|---:|---:|
| CSS视口 / 设备DPR / 实绘DPR | 1280×800 / 1 / 1 | 390×844 / 3 / 2 |
| 湖面网格 / 三角形 | 2 / 9,792 | 2 / 9,792 |
| 整场drawcalls / 三角形 | 455 / 211,475 | 455 / 211,475 |
| CPU render提交均值 / p95 | 4.00 / 4.60 ms | 3.02 / 3.30 ms |
| 实际展示帧间隔均值 / p95 | 99.99 / 101.50 ms | 100.00 / 101.70 ms |
| 实际水波展示率 | 10.00 Hz | 10.00 Hz |
| 暂停水波后1秒新增帧 | 0 | 0 |

展示率由本实验主动限制；不能据此推断硬件最高FPS。GPU timer未采样到，`thermal.source=none` 的0值不作为GPU占用为0的证据。未做长期温升、电池或真机测试。

## 本地复现

在本工作树运行 `npm run dev -- --host 127.0.0.1 --port 5216 --strictPort`，打开 `http://127.0.0.1:5216/?lake360=1`。该命令需按PM串行时段启动；现在没有运行中的预览。进入对局后底部可环顾、转向、仰俯、暂停水波，并返回原比赛控制。
