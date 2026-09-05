# physics/

> L2 | 父级: `../CLAUDE.md`

物理内核的可复用纯模型子模块；不得依赖 React、DOM、规则或渲染。

## 成员清单

`collision-model.ts`: 球球接触点相对速度、等质量实心球法/切向冲量及瞬时碰后方向；physics 步进与 aim 无旋预测经 `physics.ts` 统一重导出消费。

`continuous-collision.test.ts`: 56mm/10m/s 薄擦 CCD、球序/对称多接触、球碰→袋口与库边→球碰时序、中杆滑动、残旋恢复、旋转传递、能量和求解预算护栏。

`table-geometry.ts`: 中式台球参数化袋口与库边的单一几何事实源；输出角袋 100mm/中袋 102mm 的六袋口、角袋 8mm/中袋 7mm 台内半椭圆捕获弧、直线/圆弧离散角衬段、袋口局部坐标及安全瞄准窗口，供 physics、aim、planner 与 Scene3D 共享。

`table-geometry.test.ts`: 六袋镜像、100/102mm 口宽、8/7mm 台内圆弧捕获、慢/中/高速安全窗口、擦角、挂袋、侧旋和高速防穿透的统一几何验收矩阵。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
