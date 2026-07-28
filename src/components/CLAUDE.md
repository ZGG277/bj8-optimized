# components/

> L2 | 父级: `../CLAUDE.md`

HUD 控制组件层：只渲染控件并把事件转发给 Game/input 层，不持有对局或物理状态。

## 成员清单

`ViewToolbar.tsx`: 视角/粗瞄工具条（第一人称/俯视、左右 45° 世界杆向、俯身角度▲▼微调），aria-pressed 与唯一 aria-label，pointerdown 拦截冒泡；切视角不改杆向。

`GameHeader.tsx`: 顶部状态栏，渲染品牌标识与回合状态/杆数，纯展示性组件。

`Scoreboard.tsx`: 比分板，消费世界快照计算进球数，渲染玩家/对手卡片与比分；球型图标（mini-rack）跟随实际分组渲染，玩家分到花色时玩家侧为 9-15、对手侧为 1-7。

`TableStage.tsx`: 球桌区域，组合 ViewToolbar 与 3D 视口，包含目标球→袋口精瞄滑窗/操作提示、回合遮罩、结束覆层（按 winner 显示胜负文案，玩家获胜时播放彩带庆祝）、教练卡片。

`ControlDeck.tsx`: 控制区，组合 💡 走位按钮（三态常驻：is-lit=ready 微光可点 / is-open=showing 描边表示展开中、点击=关引导 / is-dim=computing 呼吸、failed/idle 灰静态 disabled；非玩家回合 visibility 隐藏保网格稳定）、AimControls/SpinControl/ShootControl 与消息提示。

`PlanOverlay.tsx`: 走位规划顶部紧凑提示条（路线分段「①75%」、每杆压缩 chip「1·低杆中力」=杆法+塞+力档、连贯/本杆概率、▶ 播放、✕ 关闭），不遮台面主体；场景渲染经 onShowPlan/onPlayPlan 回调委托 Scene3D 整链直绘。

`ReviewOverlay.tsx`: 击球复盘条（讲上一杆，与规划的下一杆引导共存；planOpen 时让位不渲染）——折叠态 .review-chip「复盘：{诊断} · ▶ 对比」，展开态 .review-bar（verdict 色签 + 诊断 + 虚线=计划/实线=实际图例 + ✕ 收起）；场景对比渲染经父组件回调委托 Scene3D.showReviewOverlay。

`IntroScreen.tsx`: 开始界面，品牌标识与开始按钮。

`AimControls.tsx`: 瞄准微调按钮组，禁用同时以透明度与删除线表达，不只依赖颜色；基础步进触屏 0.004rad、桌面 0.01rad，Game 靠近袋口窗口时自适应缩到窗口宽度 1/6。

`SpinControl.tsx`: 击球点盘，拖拽经 clampSpin 映射到单位圆；可 Tab 聚焦，方向键微调、0/Backspace 复位中杆。

`ShootControl.tsx`: 出杆交互区（力度表 role=meter + 出杆钮 role=button)；下拉蓄力、松开提交、Enter 轻杆；可用行程由按下点到安全底边计算。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
