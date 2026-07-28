# styles/

> L2 | 父级: `../CLAUDE.md`

样式体系：按 base → layout → controls 顺序加载，后者可覆盖前者；横屏尺寸令牌统一在 base 重定义。

## 成员清单

`base.css`: 设计令牌（色彩/字体/--topbar-h/--scoreboard-h/--control-deck-h/--hud-safe-top)、全局重置、焦点环与动画；横屏 media query 重定义壳层尺寸变量。

`layout.css`: 壳层网格、顶栏、计分板、球桌舞台、目标袋口精瞄滑窗、遮罩、陪练卡、开始界面与响应式布局；精瞄条 pointer-events:none 不抢输入，遮罩层级 z 15/20 高于 HUD；竖屏陪练卡上移避开击球点盘；含胜利庆祝动画。

`controls.css`: 视角工具条与底部控制区控件样式；桌面为"信息居左、💡 走位/方向微调/击球点盘/出杆区靠右"网格，竖屏(≤640px)与横屏手机下击球点盘固定左下并加大(球盘 68-76px)防误触、其余控件右下收拢，控件 z 9-10 高于球桌、低于遮罩；视角工具条顶边不低于 hud-safe-top + 8px；走位规划提示条（plan-bar/plan-chip/plan-bar-prob）z 12，顶边贴比分行之下（topbar-h + scoreboard-h + 4px）、半透明backdrop不遮台面主体，竖屏自动折两行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
