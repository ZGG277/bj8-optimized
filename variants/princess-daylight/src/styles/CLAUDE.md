# styles/

> L2 | 父级: `../CLAUDE.md`

样式体系：按 base → layout → controls → themes → onboarding 顺序加载；末层只定义独立提示外观，不覆盖控件几何。v1.4 在“静谧球房”底座上增加双方水平、纯视觉五控件、自由层/双停靠轨和吸附预览，主题入口统一控件静置半透明、按住实色及无卡片外框，仍不改变交互几何。

## 成员清单

`onboarding.css`: 全局左侧优先的逐控件就地说明；固定定位、视口限宽、无毛玻璃与动画、pointer-events:none，承载鼠标/键盘首用提示、视角/出杆常驻速查及触屏按下即显，保持原操作手势直接生效。

`base.css`: 设计令牌（色彩/两级表面/三级文字/圆角/阴影/动效/--scoreboard-h/--control-deck-h/--hud-safe-top）、全局重置、焦点环、减弱动态偏好与动画；桌面只保留 48px 比分栏，横屏只保留 34px 状态栏。

`layout.css`: 无产品顶栏的桌面壳层、带双方动态水平的烟熏比分板、全幅球桌、观战触控/轻提示/纯视觉回正、遮罩与带整局评估说明的开始界面；竖屏把双方姓名/水平与球组状态压入顶部单行。局后留言卡使用可滚动结束覆层、16px 输入字号和至少 46px 按钮，继续游戏动作不因网络请求而禁用。

`controls.css`: 五控件 v1.4 最终几何：透明事件穿透层、保留沿边落点的右/底停靠轨、自由坐标、吸附预览与合成层 transform 拖动态；含无文字横竖视角、与俯视端点共享空间的手动相机图形开关、灯泡四开关图形面板、击球点、可选球杆左右微调、球杆+能量带蓄力、默认以中心圆环/刻度/压感收紧反馈显式粗精档的无限拨轮，以及本体穿透、弱边界、44px × 热区的首局一行微提示；末尾高优先级覆盖隔离历史媒体规则。

`themes/index.css`: 三主题层入口与左下角小调色盘/展开面板样式；依次加载青瓷、决赛之夜、霓虹球房的作用域覆盖，默认使用青瓷，并在各主题之后统一执行控件静置 56% 内容透明、按住/聚焦/拖动实色及去卡片外框策略。

`themes/celadon.css`: 青瓷主题；墨绿底、天青主色、玉石内光和米金辅助。

`themes/noir.css`: 决赛之夜主题；深黑底、香槟金主色、克制发丝线。

`themes/neon.css`: 霓虹球房主题；近黑蓝紫底、电光青主色、品红蓄力态。

`world-shell.css`: 正式开始页的五项世界选择；桌面三列、窄屏两列，不改变既有 HUD 和触控几何。


小工具胜局分享样式位于 layout.css；base.css 的根容器消费四边 safe-area，controls.css 的右侧控制轨同步避开顶部安全区。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-10-02：浮动控件静置不透明度 22%，触碰/键盘焦点/展开时恢复；默认锚点用像素保持右下控件间距，窄屏瞄准条为出杆区留出独立热区。视角及辅助面板向左展开。

2026-10-02 UI3：出杆和母球静置不透明度 44%，竖向宽度 48px；其他控件保持 22%，按压/展开仍恢复实色。

R4：princess.css最后加载，统一珍珠/香槟金控件皮肤与简洁结算卡；黄宝石HUD为整黄玉无横带。布局手势/触控范围沿用，移动球组文案留足空间。

R7: 开场仅通过opacity隐藏HUD绘制，保留测量矩形与布局；3D桌面保留并展示轻触跳过提示。开场结束恢复原UI。

2026-10-12 开场教学候选：默认城堡/保留场景偏好；5.2s真实柱廊推进、跳过/减少动态/热档与快速重开；场景双卡在安全回合切换；真实出杆结算驱动蓄力→等待或连杆→幽灵球瞄准→拨轮→出杆，完成键兼容并增量保存进度。胜负统一暖白香槟金结算，失败无虚构原因；沿用现有分享能力。正式包与隔离验收夹具分离，原V5包保留。

2026-10-13 UI RC2：princess.css统一本地霞鹜文楷子集与13px字号；顶部入口36px；单行小球HUD；取消教学卡片/金边，以透明手势和波纹引导。暂停、结算与场景选择收简。

2026-10-13 GEM-LIGHT RC3: full-frame opening film, portrait cover / landscape contain, brief end dissolve. RC2 WenKai/13px, small entries, ball HUD and translucent graphical guidance retained.

2026-10-15: opening-film selectors target img instead of video (animated WebP delivery); portrait cover / landscape contain and the arriving dissolve are unchanged.

2026-10-15：默认右上灯泡，下方220px常驻视角；矮横屏改为230×64横向滑块，浅底深字标识视角/俯视。自定义布局仍保留。

2026-10-17: Seedance film uses contain in portrait too, preserving all six pockets on tall phones; poster backdrop fills letterboxing.

2026-10-23 controls.css移除视角标题/长滑轨的展示占位，用紧凑三图标；原拨轮/出杆/自由布局热区保留。

## 2026-10-24
princess.css 添加陪练头像、结算肖像、窄屏球组压缩和矮屏肖像尺寸；小工具构建通过既有兼容插件补充 clamp/gap 回退。

2026-10-25：princess.css 顶部额外预留48px宿主按钮区域（短横屏44px），比分与工具栏一起下移，相机按缩小后的真实视口重排。

2026-10-30 R3：进球文本在viewport顶部64px单独一行，允许窄屏换行。顶部工具栏显式消费host safe-area，避开比分；无HUD脉冲、落袋新圈/粒子。赢球卡图片与分享首图一致。
