# 清水湖面独立候选

原制作基线：v1.7.2，`85ef7c28c8a26b81537d23ba96629246c22552bb`。清水资产在 `bj8-clear-water-candidate` 独立制作，用户审美验收通过后，已仅将湖面资产、运行时和证据定向合入 v1.7.3，形成 v1.7.4 发布候选；没有整体合并旧候选，也没有改动赛后反馈、28° 镜头、物理、规则或数据库。

## 设计与真实消费路径

- 原水面是完全不透明的青灰色，本候选在现有水面下增加真实浅沙床与 24 颗小石块，合并为一个新增网格。浅床距水面约 0.4–0.7m，向外逐渐加深；湖面范围与天空范围保留。
- `src/scene/assets/lake360.glb` 是网页实际加载的资产。`Lake360_Lakebed` 使用顶点颜色区分浅沙与石块，运行时叠加打散的沙纹、少量沉积色差与缓慢光焦散。
- `src/scene/lake360.ts` 用真实透明水层覆盖沙床：近景透射、随水深和观察角度增加的吸收、中远景 Fresnel 天空反射。光线漂移提供低成本折射感；没有屏幕空间真实几何折射、SSR、反射相机或额外渲染通道。
- 多方向、不等波长并以低频噪声扰动的细波，避免首版整齐平行纹。保留原 100ms/10Hz 请求节奏与 `ripples=true`；隐藏页面、减少动态偏好与销毁仍停止请求。未加入环顾/暂停按钮，未碰物理、规则、反馈或数据库。
- 色调/空间参考用户指定的[吉卜力官方《千与千寻》作品页](https://www.ghibli.jp/works/chihiro/)及其对水上段落的描述。官方页面已读取；没有可靠定位该段落的具体画廊编号，因此不宣称对具体剧照作了颜色采样。未引入作品图片、列车、人物或轨道。

## Blender 执行与源保护

本机 Blender **5.2.1 LTS / 9e2066aef7ef** 实际执行了 `assets/blender/lake360/build_lake360.py`。使用独立后台进程打开候选目录内的原 `lake360.blend`，复制原水面/天空到 `BJ8_Lake360_ClearWater`，新增沙床/石块，设置可编辑材质，导出 GLB 并另存为 `lake360-clear-water.blend`。

原 `lake360.blend` 保持字节不变，SHA-256 `0c5fd4227c0ecb19d34844954109e443319e4bb19a5331d57544fa4d28e5c479`。源文件内保留原 Scene；本机交互 Blender 的文件、活动场景和 dirty=false 经 MCP 前后只读核对相同，没有打开或覆盖用户当前场景。

最初沙箱内 Blender 启动崩溃，在已有候选制作授权下经自动审批后独立后台重试成功。没有安装依赖、外部素材或生成服务，没有离线渲染。

执行日志：`assets/blender/lake360/clear-water-blender.log`。最终 `.blend`、脚本、运行时与 GLB 指纹：`assets/blender/lake360/provenance.json`（导出后对运行时代码做了 `color.rgb` 兼容修正，最终 provenance 已更新运行时指纹）。

## 资产与轻量验证

| 项目 | 结果 |
|---|---:|
| 网页 GLB | 283,708 bytes |
| 网格 / 材质 | 3 / 3 |
| 三角形 | 13,440，较原版增加 3,648 |
| 新增图片 / 纹理文件 | 0 |
| GLB 增量 | 91,620 bytes |
| GLB SHA-256 | `0cf99ecf8269f88a140ba2301759eaebca56caffbdda43b3b9b7ba00098bac79` |

候选工作树初次检查显示依赖缺失，按项目规则只执行一次 `npm ci --ignore-scripts`，锁文件未变化；此后 `npm ls --depth=0` 成功。`npm run typecheck`、3 个现有场景定向测试文件通过。Three.js `GLTFLoader` 实际解析 GLB，确认 3 个命名网格、13,440 三角、湖床最高点低于水面；见 `clear-water-asset-check.json`。`git diff --check` 通过。

PM 已在独立候选和 v1.7.4 合入版的真实 `world=lake` 游戏入口完成桌面 1280×800 与手机 390×844 浏览器验收：GLB 与三个 shader 材质加载成功，动态水波保持开启，页面无错误或横向溢出，界面不再出现“环顾湖面”与“暂停水波”。合入版证据位于 `shots/release-v1.7.4/prepublish/`。完整检查 57 个测试文件、402 项测试通过，单 HTML 9,551,919 bytes，SHA-256 `66e69a898e8c82180d266c9b2d0c15a8924ed945d451496ca3ef97ec1ce846ce`，低于 10MB 门槛。

采样反映整局画面的总绘制规模，不把全场 460 draw calls / 218,771 triangles 冒充湖面自身成本；湖面资产自身仍为 3 个网格、13,440 三角。Apple M5 / ANGLE Metal 下渲染调用 CPU 侧 p95 为桌面 3.3ms、手机 3.2ms。该数据不是 GPU timer，也不等同真实手机整机性能。
