# physics/

> L2 | 父级: `../CLAUDE.md`

物理内核的可复用纯模型子模块；不得依赖 React、DOM、规则或渲染。

## 成员清单

`collision-model.ts`: 球球恢复系数、切向 throw 系数与单位速度碰撞后母球/目标球方向预测；physics 步进、aim 反解和 Scene3D 辅助线经 `physics.ts` 统一重导出消费。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
