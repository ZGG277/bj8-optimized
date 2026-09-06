# scripts/

> L2 | 父级: `../CLAUDE.md`

浏览器端验证脚本层：默认驱动 `:5199` 的真实页面。多数脚本经 puppeteer-core 连接无头 ego lite（远程调试 `:9333`），支持 `BROWSER_URL` / `GAME_URL` 覆盖；`verify-render-thermal.mjs` 与 `verify-control-intent.mjs` 则自行启动 Chrome，使用 `PUPPETEER_EXECUTABLE_PATH` / `GAME_URL`。

## 成员清单

`verify-shot-camera-help.mjs`: 390×844 触屏专项；实际按住瞄准控件验证说明就地出现、松手自动收起且原手势不被阻断，检查 Pointer/contextmenu 默认行为取消，并构造共线直球验证击球后目标近景先于全台。

`optimization-snapshot.mjs`: 只读生成当前 HEAD、源码/脚本/构建配置指纹、用户保护文件哈希及现有构建哈希，供 Spark 与主 Session 冻结/复核验收输入。

`optimization-browser.html`: 仅 Vite 开发服务器可用的可复现验收夹具；全尺寸 iframe 加载真实游戏入口，显式准备薄切/对手/六袋近景和落袋事件；F2 隐藏面板，瞄准/出杆/取消仍操作真实游戏控件，状态以 DOM 输出便于只读浏览器观察。不属于产品构建入口。

`verify-render-thermal.mjs`: 启动真实 Chrome 验收桌面/手机介绍页零 WebGL，开始对局后的静止停帧、Retina DPR 上限、运动渲染帧上限、GPU 温控快照、warm/hot 毛玻璃关闭，以及 390×844@3x 手机采用真实 2× 绘制缓冲区。

`verify-control-intent.mjs`: 启动 390×844 真实触摸 Chrome，验收慢速瞄准拨动跨过长按时限仍不触发布局拖位、蓄力横向移出取消/预览归零及正常出杆无回归。

`inline-build.mjs`: 妙搭发布适配——在 Vite 构建完成后把唯一的 ESM 入口和 CSS 内联进 `dist/index.html`，拒绝残留 assets 外链、意外分包和超过 10 MB 的 HTML，避免签名对象存储重定向破坏模块相对导入。

`verify-desktop-compact.mjs`: 1280×800 v1.4 桌面 HUD 门禁（15 断言）：双方名字下水平、无可见操作文字、四个开球控件右侧停靠、8px 安全边界、纯视觉蓄力与页面无溢出。

`verify-interaction.mjs`: 真实指针回归门禁（41 断言）：桌面鼠标/竖屏触摸/横屏触摸三矩阵 + 瞄准映射 + 出杆动画同步；点击真值以当时 `cameraViewAzimuth` 目标位姿反算，兼容开球独立俯视方位；启动、纯视觉视角端点、蓄力、虚母球/自由球放置全部走真实事件，并通过隐藏 aria 数值验收无文字控件。

`verify-precision-aim.mjs`: 默认瞄准线与拨轮/可选方向键出口门禁：开球白球在开球线中点标准位自动实体就位、点击或按住拖到合法开球区、越线保留最后合法位，灯泡四入口、方向键单击/长按、切回拨轮、非袋口与近袋保持粗档、轻点显式精瞄、固定低速横拨改世界杆向与页面无错误。

`verify-break-group.mjs`: 开球→连续进球→分组端到端复测（17 断言）：经 `__bj8` 调试句柄摆球造几何，瞄准与出杆仍走真实鼠标输入；开局先完成 placing 放白球（网格扫描开球区屏幕点真实点击），摆球把白球放到 z>0 半台以兼容开球杆 clampAimToForwardHalf 前方半台钳制。

`verify-aim-accuracy.mjs`: 预测辅助线与真实球路回归（19 断言）：清除偏好后先经灯泡图形面板显式开启辅助线，再对 15°/30°/45° 用例用真实鼠标验证预测线、碰撞方向和落袋一致。

`verify-scoreboard-group.mjs`: 比分板分组图标回归：开球进 1 号再进 9 号，断言玩家分花色后玩家侧 mini-rack 渲染 9-15、对手侧 1-7，截图 shots/34。

`verify-win8.mjs`: 8 号球胜负与训练结算回归：开球进 1 号→进 2 号分全色→清台进 8 号，断言玩家获胜、win-8、庆祝彩带，以及结算页恰有一个训练重点和下一局目标；截图目录可由 `SHOT_DIR` 覆盖。

`verify-mobile-spinpad.mjs`: 移动端击球点与球杆兼容回归：竖屏断言右侧小预览可展开 ≥120px 大母球且不压出杆区、解说卡不存在，截图 shots/36/37。

`verify-mobile-portrait-v12.mjs`: 390×844 v1.4 真实触控门禁（23 断言，保留旧文件名）：开球触摸落位、双方水平、辅助线首次开启/灯泡关闭/刷新持久化、10px 手抖下的长按接管与同边换位、五控件合成层逐帧拖动、拖动期存储节流、布局无数值偷跑、低/高压力同位移的紧度视觉与精细度、固定 0.5 普通触摸回退、拨轮沿边落点的右/底吸附与横竖原操作、三布局存储及无错误。

`verify-spectator-camera.mjs`: 顾燃观战/玩家手动与杆向跟随门禁：真实验证 390×844 固定纵台俯视、观战横滑不旋转、1280×800 固定横台俯视、交棒恢复控件、玩家任意非俯视高度按瞄准方向调节视角、手动相机独立性、触屏瞄准短暂锁镜、玩家俯视端点冻结，以及全流程无错误。

`verify-position-plan.mjs`: 💡 走位规划 + 复盘闭环集成回归：陪练/挑战均可主动点亮走位并显示可靠路线，无结果状态另由 UI 明示；真实出杆结算后复盘默认收起，从灯泡独立打开才以中性“复盘”文案显示，显式查看计划后可展开计划/实际场景对比；截图目录可由 `SHOT_DIR` 覆盖。

`verify-themes.mjs`: 三主题集成回归（26 断言）：验证默认只显示小调色盘、展开三选项、URL/持久化，四个主要控件静置透明/按住实色/无框，并逐一在 1280×800、390×844、844×390 对局中验证五控件安全、无重叠/内容溢出，输出九张主题截图。

`verify-pockets.mjs`: DEV 场景结构及四机位回归：同源木框裁口、六个一体护口/皮裙壳体、同站点缝边及既有网袋；检查装配后实际三角形有限、非退化和几何边成对，不再以独立皮裙数量或旧延伸常量冒充接合证明。承托与面域由最终几何单测约束；截图仍须目视验收。成功/失败均关闭本脚本标签，不关闭共享浏览器；生产 preview 无 DEV 句柄时不能用它替代真实入口验收。

`shots-plan-chain.mjs`: 桌上整链直绘目检截图：同一三球局面打开提示条，桌面输出 shots/40-plan-on-table.png，`PORTRAIT=1` 输出 shots/41-plan-on-table-portrait.png；placing 点击前校验 elementFromPoint 命中 CANVAS（竖屏复盘卡片会遮挡下半台吃掉点击），用于人工核对三杆分色轨迹/袋口序号与提示条排版不破版。

`shots-break-spread.mjs`: 开球散开目检截图：真实输入完成 placing → 网格反查瞄顶球 → 满力开球 → 停球后页内统计 spread/落袋并切俯视截图（shots/42-break-spread.png），用于人工核对叉路联立修复后的球堆散开程度。

`verify-screens.mjs`: 视觉回归截图（shots/01–06）：介绍页、第一人称、蓄力、滚动、开球后、俯视六帧，附页面 JS 错误采集。

`debug-break-physics.mjs`: 多种随机种子开球的离线速度/spread/落袋诊断。

`debug-break-place.mjs`: 开球放置与瞄准阶段的真实页面状态诊断。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
