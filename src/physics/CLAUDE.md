# physics/

> L2 | 父级: `../CLAUDE.md`

物理内核的可复用纯模型子模块；不得依赖 React、DOM、规则或渲染。

## 成员清单

`collision-model.ts`: 球球恢复系数、切向 throw 系数与单位速度碰撞后母球/目标球方向预测；physics 步进、aim 反解和 Scene3D 辅助线经 `physics.ts` 统一重导出消费。

`table-geometry.ts`: 中式台球参数化袋口与库边的单一几何事实源；输出角袋 100mm/中袋 102mm 的六袋口、角袋 8mm/中袋 7mm 台内半椭圆捕获弧、直线/圆弧离散角衬段、袋口局部坐标及安全瞄准窗口，供 physics、aim、planner 与 Scene3D 共享。

`table-geometry.test.ts`: 六袋镜像、100/102mm 口宽、8/7mm 台内圆弧捕获、慢/中/高速安全窗口、擦角、挂袋、侧旋和高速防穿透的统一几何验收矩阵。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
