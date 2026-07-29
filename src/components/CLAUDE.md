# components/

> L2 | 父级: `../CLAUDE.md`

HUD 控制组件层：只渲染控件并把事件转发给 Game/input 层，不持有对局或物理状态。

## 成员清单

`ViewToolbar.tsx`: 视角/粗瞄工具条；桌面保留第一人称/俯视、45° 杆向与俯身微调，竖屏右上只显示双视角切换，pointerdown 拦截冒泡。

`GameHeader.tsx`: 顶部状态栏，渲染品牌、陪练/挑战模式、本局锁定对手档位与回合状态/杆数，纯展示性组件。

`Scoreboard.tsx`: 桌面渲染完整比分板；竖屏压成 34px 首行，只显示开球/开放球局/玩家球组及本组 7 球+8号，已进球灰化。

`TableStage.tsx`: 球桌区域，组合 ViewToolbar、TableAimNudges 与 3D 视口，包含精瞄滑窗、回合遮罩与结束覆层；不再渲染左下教练/解说卡。

`ControlDeck.tsx`: 桌面右侧控制组与竖屏右侧单手轨，组合灯泡总开关、AimControls、SpinControl、ShootControl；灯泡统一收起规划/复盘，有复盘时跨回合保持可用；消息/解说区已删除。

`PlanOverlay.tsx`: 半透明紧凑走位浮层（路线、打法 chip、概率、播放、关闭），带独立拖拽手柄；场景渲染委托 Scene3D。

`ReviewOverlay.tsx`: 半透明可拖动击球复盘浮层；折叠态一句话诊断，展开态展示 verdict、诊断与计划/实际图例，场景对比委托 Scene3D。

`IntroScreen.tsx`: 开始界面，展示当前玩家水平/置信度以及陪练、挑战的目标差异和本局预计对手档位。

`AimControls.tsx`: 瞄准微调按钮组，禁用同时以透明度与删除线表达，不只依赖颜色；基础步进触屏 0.004rad、桌面 0.01rad，Game 靠近袋口窗口时自适应缩到窗口宽度 1/6。

`TableAimNudges.tsx`: 竖屏球桌内部的两个 52px 外向三角，转发左右方向微调，确保方向触控不离开 viewport。

`SpinControl.tsx`: 桌面直接显示击球点盘；竖屏显示小母球预览，点击展开 124px 大盘；拖拽经 clampSpin 映射单位圆。

`ShootControl.tsx`: 力度表与出杆按钮合一；竖屏为 196–240px 长行程下拉面，松开提交、Enter 轻杆。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
