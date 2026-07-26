# scripts/

> L2 | 父级: `../CLAUDE.md`

浏览器端验证脚本层：经 puppeteer-core 连接无头 ego lite（远程调试 :9333）驱动真实页面（:5199），启动前置与环境变量（BROWSER_URL/GAME_URL）见各文件头注释。

## 成员清单

`verify-interaction.mjs`: 真实指针回归门禁（41 断言）：桌面鼠标/竖屏触摸/横屏触摸三矩阵 + 瞄准映射（点哪打哪、拖拽死区、幽灵球靶点）+ 出杆动画同步；启动、视角、蓄力、放置全部走真实事件，DOM 只读不做执行。

`verify-break-group.mjs`: 开球→连续进球→分组端到端复测（16 断言）：经 `__bj8` 调试句柄摆球造几何，瞄准与出杆仍走真实鼠标输入。

`verify-screens.mjs`: 视觉回归截图（shots/01–06）：介绍页、第一人称、蓄力、滚动、开球后、俯视六帧，附页面 JS 错误采集。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
