# components/

> L2 | 父级: `../CLAUDE.md`

HUD 控制组件层：只渲染控件并把事件转发给 Game/input 层，不持有对局或物理状态。

## 成员清单

`ViewToolbar.tsx`: 无文字显式相机控件；一键在全台 tactical 与跟杆 shot 之间恢复各自构图记忆，中键只切换 tactical 自由环绕，推杆只连续调整当前模式高度而不暗中切模式；支持右/底停靠和键盘 Home/End 模式快切。

`Scoreboard.tsx`: 桌面与手机都在“你/顾燃”名字下展示整数水平并在跳变时短促过渡；同时渲染实际球组/进球状态。

`TableStage.tsx`: 精简球桌区域；以 data 属性显式暴露 camera mode/phase/interaction 供触控门禁和光标反馈，只在真实 spectator 回合显示顾燃提示，tactical 玩家规划不再被误标成对手击球；非 shot 模式均提供全台回正，结束覆层仍独占交互。

`FirstMatchGuide.tsx`: 首局非模态一行微提示；按步骤寻找球桌、拨轮、视角、击球点或蓄力控件真实 DOM 锚点，以标签自身实测宽高随控件出现/移动/视口变化立即避让定位；默认精瞄阶段提示轻拨拨轮精细瞄准，提示本体穿透交互，只保留 44px 弱化 ×，具备跳过新手引导的 aria 名称与 live 语义，不提供手动“下一步”。

`FirstMatchGuide.test.tsx`: 服务端静态结构回归，锁定短文案、具名跳过入口，并拒绝“下一步/完成”按钮回潮。

`BulbAssistControl.tsx`: 灯泡辅助入口；装配默认开启的瞄准辅助线与按需走位/复盘双开关，只向无完成引导且无出杆证据的真新用户展示一次性提示；拖动布局时隐藏提示，落位后按完整 placement 版本重测锚点并翻转避让视口，不监听普通瞄准 pointermove。

`BulbAssistControl.test.tsx`: 真新用户/老用户门禁、关闭持久化、可移动锚点与视口翻转、ARIA 及触控文案回归。

`ControlDeck.tsx`: 五控件统一编排层；组合显式 shot/tactical/orbit `ViewToolbar`、`BulbAssistControl`、SpinControl、ShootControl 与默认精瞄但可显式粗/精切换的 AimDial，只转发相机意图，不由高度推断模式；布局仍按 desktop/portrait/landscape 独立持久化并支持长按拖放。

`PlanOverlay.tsx`: 半透明紧凑走位浮层；只取最高概率方案，默认第 1 杆，用户点击第 2/3 杆标签后才切换对应单杆路线；带独立拖拽手柄，场景渲染委托 Scene3D。

`ReviewOverlay.tsx`: 半透明可拖动击球复盘浮层；折叠态一句话诊断，展开态展示 verdict、诊断与计划/实际图例，场景对比委托 Scene3D。

`IntroScreen.tsx`: 开始界面，展示持久化玩家水平/置信度，并提供陪练与挑战两种局前对手关系入口。

`AimDial.tsx`: 无文字无限拨轮；右侧停靠改用上下拨动，底部/自由位置左右拨动，轻点或 Enter/Space 显式切换粗/精档，方向键拨动，以中心圆环、刻度密度、主题强调色及压感紧度环表达当前手感，不展示或推断目标袋口。

`AimDial.test.tsx`: 外部传入粗/精双档状态、无自动“接近”语义与无障碍数值的静态结构回归。

`SpinControl.tsx`: 纯母球+撞击点视觉；点击/拖动经 clampSpin 映射单位圆，稳定长按不会先改杆法，竖屏小预览仍可展开大盘。

`ShootControl.tsx`: 纯球杆回缩/前冲与压缩能量带视觉；右侧向下、底部向右蓄力，85% 后转暖色，不显示标题、提示或数字，保留 meter/键盘语义。

`ThemeSwitcher.tsx`: 常驻左下角的小调色盘入口；点按后才展开“青瓷 / 决赛之夜 / 霓虹球房”，选择后自动收起，仍校验 URL 参数、持久化本地选择并提供 `[` / `]` 键盘轮换。

`ThemeSwitcher.test.ts`: 主题参数、默认值、本地持久化与循环切换的纯语义回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
