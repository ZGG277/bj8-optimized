# scripts/

> L2 | 父级: `../CLAUDE.md`

浏览器端验证脚本层：经 puppeteer-core 连接无头 ego lite（远程调试 :9333）驱动真实页面（:5199），启动前置与环境变量（BROWSER_URL/GAME_URL）见各文件头注释。

## 成员清单

`verify-interaction.mjs`: 真实指针回归门禁（41 断言）：桌面鼠标/竖屏触摸/横屏触摸三矩阵 + 瞄准映射（点哪打哪、拖拽死区、幽灵球靶点）+ 出杆动画同步；启动、视角、蓄力、放置全部走真实事件，DOM 只读不做执行。

`verify-precision-aim.mjs`: 360° 粗瞄 + 近袋局部精瞄出口门禁（5 断言）：真实鼠标验证慢速进入、袋口横向滑窗、竖向退出、快速横扫不吸附与页面无错误。

`verify-break-group.mjs`: 开球→连续进球→分组端到端复测（17 断言）：经 `__bj8` 调试句柄摆球造几何，瞄准与出杆仍走真实鼠标输入；开局先完成 placing 放白球（网格扫描开球区屏幕点真实点击），摆球把白球放到 z>0 半台以兼容开球杆 clampAimToForwardHalf 前方半台钳制。

`verify-aim-accuracy.mjs`: 预测辅助线与真实球路回归（19 断言）：每个 15°/30°/45° 用例独立固定为玩家瞄准回合，瞄准/蓄力/出杆走真实鼠标；虚拟目标相机正反投影定位台面点，断言含 throw 的目标球预测线、白球分离线、实际初始出射方向和落袋一致。

`verify-scoreboard-group.mjs`: 比分板分组图标回归：开球进 1 号再进 9 号，断言玩家分花色后玩家侧 mini-rack 渲染 9-15、对手侧 1-7，截图 shots/34。

`verify-win8.mjs`: 8 号球胜负回归门禁（5 断言）：开球进 1 号→进 2 号分全色→摆清台局面干净打进 8 号（无碰库），断言玩家获胜、win-8 文案与庆祝彩带渲染，截图 shots/35。

`verify-mobile-spinpad.mjs`: 移动端击球点盘布局与球杆造型验证（8 断言）：竖屏触摸断言击球点盘固定左下、加大(≥80px)、与陪练卡不重叠、pointer:coarse 生效，截图 shots/36（竖屏）与 shots/37（桌面球杆）。

`verify-position-plan.mjs`: 💡 走位规划 + 击球复盘集成回归（32 断言）：开球放置白球（placing→aiming，网格扫描 screenToTable 找开球区屏幕点）后经 `__bj8` 摆三球固定局面，断言按钮三态流转（is-dim 呼吸→is-lit 微光→is-open 展开、再点 toggle 关/开与 ✕ 等价）、顶部提示条出现且无旧面板、压缩 chip 1–3 个且文案匹配「N·杆法塞力档」、连贯/本杆概率文案、场景整链规划对象上屏（planObjectCount）、打开期间瞄准禁用、整链播放起止、关闭后场景清除/视角恢复/瞄准恢复（截图 shots/38）；后半段摆 1 号短直球局面，等 💡 重新就绪后真实点击瞄准（aim 必须经 React 状态不能写 __bj8.aim——蓄力预览的同步会把 aimRef 覆盖回状态值）+ .shoot-pad 真实拖拽出杆，断言 .review-chip 出现且文案非空、▶ 对比展开 .review-bar 且 reviewObjectCount ≥2（截图 shots/43-shot-review.png）、✕ 收起后场景清除。

`shots-plan-chain.mjs`: 桌上整链直绘目检截图：同一三球局面打开提示条，桌面输出 shots/40-plan-on-table.png，`PORTRAIT=1` 输出 shots/41-plan-on-table-portrait.png；placing 点击前校验 elementFromPoint 命中 CANVAS（竖屏复盘卡片会遮挡下半台吃掉点击），用于人工核对三杆分色轨迹/袋口序号与提示条排版不破版。

`shots-break-spread.mjs`: 开球散开目检截图：真实输入完成 placing → 网格反查瞄顶球 → 满力开球 → 停球后页内统计 spread/落袋并切俯视截图（shots/42-break-spread.png），用于人工核对叉路联立修复后的球堆散开程度。

`verify-screens.mjs`: 视觉回归截图（shots/01–06）：介绍页、第一人称、蓄力、滚动、开球后、俯视六帧，附页面 JS 错误采集。

`debug-break-physics.mjs`: 多种随机种子开球的离线速度/spread/落袋诊断。

`debug-break-place.mjs`: 开球放置与瞄准阶段的真实页面状态诊断。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
