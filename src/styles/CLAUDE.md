# styles/

> L2 | 父级: `../CLAUDE.md`

样式体系：按 base → layout → controls 顺序加载，后者可覆盖前者；横屏尺寸令牌统一在 base 重定义。

## 成员清单

`base.css`: 设计令牌（色彩/字体/--topbar-h/--scoreboard-h/--control-deck-h/--hud-safe-top)、全局重置、焦点环与动画；横屏 media query 重定义壳层尺寸变量。

`layout.css`: 桌面壳层、完整比分板、球桌舞台、精瞄滑窗、遮罩与陪练/挑战双入口开始界面；竖屏隐藏产品顶栏并把球组/进球状态压入 34px 单行，球桌占满剩余高度；含胜利庆祝动画。

`controls.css`: 桌面控制组与竖屏右侧单手轨；竖屏右上双视角、48px 灯泡、可展开 124px 击球点、196–240px 力度出杆合一控件，桌内 52px 方向三角；规划/复盘浮层半透明、紧凑、可拖动并给右轨留空。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
