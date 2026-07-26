# input/

> L2 | 父级: `../CLAUDE.md`

出杆输入层：把指针拖拽、按压时长与击球点偏移换算成确定性的 ShotIntent，与 React 和物理层解耦。

## 成员清单

`shot-input.ts`: 纯输入换算（行程归一 72-180px、按住 1667ms 满力、保底力度 6、击球点单位圆约束）,不依赖 React/DOM；最终力度只由松开时刻的真实事实决定。

`shot-input.test.ts`: 输入换算单元测试，覆盖行程窗口、保底力度、1350ms≈81、单位圆收回与单会话单意图。

`use-shot-input.ts`: React 协调器，维护 aim/spin/charge 会话，统一 pointer 与键盘出口；rAF 只做力度预览，canShoot 拒绝时绝不提交 ShotIntent；卸载时清理全部 rAF 与键盘监听。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
