# components/

> L2 | 父级: `../CLAUDE.md`

HUD 控制组件层：只渲染控件并把事件转发给 Game/input 层，不持有对局或物理状态。

## 成员清单

`ViewToolbar.tsx`: 视角工具条（第一人称/俯视/左右转/俯身角度▲▼微调）,aria-pressed 与唯一 aria-label,pointerdown 拦截冒泡，点击不改变瞄准角。

`AimControls.tsx`: 瞄准微调按钮组，禁用同时以透明度与删除线表达，不只依赖颜色。

`SpinControl.tsx`: 击球点盘，拖拽经 clampSpin 映射到单位圆；可 Tab 聚焦，方向键微调、0/Backspace 复位中杆。

`ShootControl.tsx`: 出杆交互区（力度表 role=meter + 出杆钮 role=button)；下拉蓄力、松开提交、Enter 轻杆；可用行程由按下点到安全底边计算。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
