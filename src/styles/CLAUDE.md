# styles/

> L2 | 父级: `../CLAUDE.md`

样式体系：按 base → layout → controls 顺序加载，后者可覆盖前者；横屏尺寸令牌统一在 base 重定义。

## 成员清单

`base.css`: 设计令牌（色彩/字体/--topbar-h/--scoreboard-h/--control-deck-h/--hud-safe-top)、全局重置、焦点环与动画；横屏 media query 重定义壳层尺寸变量。

`layout.css`: 壳层网格、顶栏、计分板、球桌舞台、遮罩、陪练卡、开始界面与响应式布局；遮罩层级 z 15/20 高于一切 HUD 控件。

`controls.css`: 视角工具条与底部控制区控件样式；桌面/竖屏为"信息居左、方向微调/击球点盘/出杆区靠右"网格，横屏整体悬浮右下收拢，控件 z 9-10 高于球桌、低于遮罩；视角工具条顶边不低于 hud-safe-top + 8px。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
