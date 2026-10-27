2026-10-06 candidate: ceiling meshes stay hidden with unchanged lights; stage gesture owns a pointer from live-camera table hit test, outside vertical swipe shares existing continuous view-level handler. Physics/A-B unchanged.

R2候选：柔和绿色细呢、可辨冷青水晶；共享球径75.438mm、角袋150mm/中袋153mm，扩大容错；未部署，须离线图验收。

公主请开球独立产品：Game固定lake，useGameState直接beginMatch，不挂载IntroScreen。保存keys统一princess-billiards，保留物理与规则。开球前顶部可选陪练/挑战，局后只保留再来一局，不继承旧产品留言接收方。

# src/

2026-10-15 画质候选：小工具正常档恢复最高2×（仍限200万像素），保留warm/hot降档与30Hz；Scene3D开启MSAA并用0.05m近裁面改善薄饰边深度精度。仅本地视觉候选，已上线RC5包保留；不改物理/输入/存档/开场视频。

湖面作为公开世界由 `?world=lake&lake360=1` 选择，并兼容旧 `?lake360=1`；切换室内或云海会删除湖面覆盖，比赛相机与输入在退出环顾后继续使用。

> L2 | 父级: `../CLAUDE.md`

## 成员清单

`post-match-feedback.ts` / `post-match-feedback.test.ts`: 局后留言与妙搭包装间的有限 postMessage 协议；父 origin 必须与嵌入页 referrer 精确一致，回执须匹配 source/origin/请求和提交 ID，12 秒未确认即失败，原正文/提交键可用于幂等重试；不读取身份和凭证，不将留言保存到 localStorage。

`Game.tsx`: 对局编排器，统一以世界角提交/渲染杆向；幽灵球确认后冻结首碰球/袋口构图身份，视口/HUD变化只刷新安全区，真实击球后先跟随已锁定目标球，结果可见后再用独立慢缓动回到按视口横/竖排列的全台；提供开局与击球成功学习事实。复盘默认收起且由灯泡独立开关；瞄准默认拨轮并可切方向键；开始对局后才创建 WebGL；运动帧直接消费 worldRef，React 世界只在语义边界更新；走位 Worker 仅由灯泡启动。

`shot-camera-follow.ts` / `shot-camera-follow.test.ts`: 击球后目标近景纯时序；目标球未被撞前不把静止误判为失败，落袋、运动后停止或整杆停止时才允许回全台。

`control-onboarding.ts`: 每个控件的稳定提示表、俯视/手动视角/出杆常驻简短说明策略、已学会外部状态库与成功事实入口；触屏由展示层在所触控件旁随时呼出，本机逐控件持久化只约束鼠标/键盘首用提示，存储受限降级页内记忆，不从原始点击推断成功。

`control-onboarding.test.ts`: 独立学习、幂等通知、存储恢复/损坏/不可用、多标签页合并与未知 ID 回归。

`first-match-guide.ts`: 首局引导纯产品状态机；只有零出杆记录且无完成标记的新用户启用，以放球、拖动结束角度变化、拨轮有效角度变化和成功出杆约束核心节奏，视角/杆法/布局是可跳过的非阻塞发现，容错读写 `guagua-billiards:first-match-guide:v1`，不依赖 React/DOM 或规则实现。

`first-match-guide.test.ts`: 首次/完成存储、受限存储降级、误触与环绕角阈值、真实事件推进、越级防护、可选发现及快速出杆收敛回归。

`match/`: 中式八球纯规则状态机（开球、分组、犯规、8 号胜负、自由球 effect），不依赖 React/DOM/物理实现；普通回合只有打进本组球才续杆，只带进对方花色则保留进球并交换回合。

`opponent/`: 玩家长期能力画像与陪练/挑战模式领域层；出杆在整局结束时一次评估，技术分只由准度 72% 与走位 28% 组成；生成 +3/+10 目标，并按等级同时调节瞄准/力度误差、选杆仿真预算与下一杆权重。

`layout/`: 五控件布局纯领域层；维护 desktop/portrait/landscape 三套自由或右/底停靠位置，负责 8px 钳制、48px 吸附、沿边落点、碰撞避让、容量与 v2→v3 迁移。

`input/`: 出杆与拨轮输入层，纯换算（行程归一、按住满力、击球点单位圆、用户显式粗/精双档、可靠 Pointer 压力→拨轮紧度）+ React 协调器；rAF 只做预览，取消会话立即清零预览，最终力度由有效走廊内松开时刻的真实事实决定。

`aim/`: 纯袋口瞄准几何层——世界角首碰检测、统一物理袋口、2R 走廊遮挡、含 throw 的袋口左右角尖反解；供规划、调试与可选辅助消费，不参与玩家拨轮的粗/精切档。

`components/`: HUD 控制组件（双方动态水平、首局控件邻近提示、灯泡图形面板、无文字视角/击球点/蓄力/横竖拨轮、内容操作与静止长按布局互斥、蓄力移出走廊取消、五控件自由拖放与双边停靠、规划/复盘浮层、保留但当前不挂载的主题切换器、球桌视口与开始界面），只转发事件，不持有对局规则。

`styles/`: 样式体系 base → layout → controls → themes → onboarding；新手提示以独立穿透层叠加。主题入口统一让控件静置 56% 内容透明、按住/聚焦/拖动恢复实色并去掉卡片式外框，不改触控几何；首屏不对全屏 WebGL 画布做实时模糊，warm/hot 档关闭 HUD 毛玻璃合成；控件层级高于球桌、低于遮罩。

`simulation/`: 固定步调度器与 React 物理循环桥；蓄水池累积帧时长、单帧步数封顶、backlog 保留不丢弃，标签页恢复时重置时钟不补算，静止迁移恰好结算一次。

`camera-view.ts`: 连续视角纯几何，提供 `SHOT_AIM_VIEW=0.16` 稍高出杆位、`viewLevel` 钳制、观战/瞄准/手动环绕路由、双方共用横竖全台方向、端点文案与环绕手势换算；俯视按视口比例适配全台，任意非俯视高度跟随杆向。

`camera-view.test.ts`: 连续高度不吸附、稍高出杆位、锁定路由、390×844 纵台/1280×800 横台、玩家非俯视杆向跟随、各高度 180° 位姿与全台安全边界回归。

`camera-framing.ts`: 46° FOV 纯构图器；完整球体保守包围盒、袋口轮廓和贴边 HUD 安全区约束，沿当前方位二分最近可行机位；全台精确拟合木帮边界，移除固定 3.7m 与额外 23% 留白。Scene3D 的显示与拾取相机消费同一路径。

`camera-framing.test.ts`: Three.js 独立投影比较、非对称安全区、球面高密度验算、近袋/长台薄切及三视口全台边界回归。

`camera-aim-intent.ts` / `camera-aim-intent.test.ts`: 从实际首碰法线与共享碰撞预测选择向前、无遮挡且夹角最小的目标袋；与拨轮原有排序解耦，不修改用户杆向。覆盖薄切时反向袋误选回归。

`pocket-render/cushion-join.ts`: 渲染库边剖面的共端点斜接；避免短角衬各自法向挤出造成中袋附近顶面重叠闪烁，不改变物理鼻尖。

`scene/`: Blender 桌体/球房/灯具/六袋针脚包边的独立视觉适配层，以及米制台面 UV 和单批球底接触阴影；只在开始对局后加载，保留失败回退、异步卸载和相机高度显隐。

`Scene3D.ts`: Three.js 场景适配器；通过 scene/ 装配 Blender 外壳和灯光，移动端基线 `2×/1024/45Hz/low-power`，桌面 `1.75×/1536/30Hz/low-power`，WebGL2 GPU timer/CPU 退化监控驱动 balanced/warm/hot；静止停止 rAF，resize 重新计算 DPR/阴影/展示帧率；目标球跟随期按物理快照更新已锁定球坐标，不重选袋口；dispose 去重释放全部几何、材质、贴图和环境纹理；消费统一 PocketGeometry 构建真实球桌。六袋护口在实际 jaw 顶面承托，后 U 形边界同步生成木框内裁口；每袋皮板/皮裙为一个闭合实体，缝边复用同一组站点。袋网为每袋一个合并低面数实体绳网，落袋只消费 pocket event 并保持球尺寸。

`pocket-drop.ts` / `pocket-drop.test.ts`: 纯视觉落袋轨迹；入口逐字消费物理 event 的位置、线速度和角速度，保持 `t=0` 连续、`scale=1`，以显式 `9.81m/s²` 重力导入 `pocket-well` 真实椭圆剖面的中心安全线。它只提供有限视觉约束，不是球-壁/网袋刚体模拟；真实零角速度保持不转。

`pocket-render/`: 见 L3 `pocket-render/CLAUDE.md`。`profile.ts` 将实际可见孔洞与较窄的球心捕获线固定为同一 PocketGeometry 来源，并统一 `pocket-well` 顶/底椭圆及 `TABLE.ballRadius` 完整球体安全域；中袋下腔仅在深向扩至可容球，不放宽开口。`seam-contract`、`trim-geometry`、`frame-geometry` 共享最终袋口站点，`cushion-geometry` 提供原样提取的实际承托面。`rope-net.ts` 将菱形袋网绳段合并为单一四棱柱 BufferGeometry，每袋一个实体 Mesh；实际 draw call 还受材质通道影响。相关纯测试覆盖最终实体、接缝与物理输入不变。

`render-policy.ts`: 不依赖 Three.js 的纯渲染预算；以粗指针或视口短边识别手机，输出基线预算及 balanced/warm/hot 对应的像素比、阴影、帧率与合成策略。

`thermal-governor.ts`: 不依赖浏览器的负载窗口与滞回状态机；以估算 GPU duty 和掉帧比驱动 balanced/warm/hot，活动中降档快、恢复慢；按需渲染停帧后以 2.5 秒冷却间隔逐级恢复，避免低清档永久滞留。

`render-policy.test.ts` / `thermal-governor.test.ts`: 手机/桌面基线预算、三档降质参数、持续高压降档与多稳定窗口逐级恢复回归。

`physics.ts`: 以米为单位的 240 Hz 确定性二维台球内核，白球默认标准位；统一球球/库边/袋口最早 TOI 推进，按接触岛做有界 24 次 PGS 与能量护栏；滚动阻力0.28m/s²保留中低力碰后球堆展开，碰撞恢复系数不变；96 批事件预算耗尽安全冻结剩余位移并记录诊断，不无检查穿透。中心杆初始滑动，球球/库边以接触速度耦合侧旋和平动；pocket event 保存入袋速度/角速度。公开统一几何及兼容的瞬时球碰走向预测。

`physics/`: 可复用纯碰撞与袋口几何子模块；角袋 110mm/中袋 112.2mm 的六袋参数、8.8/7.7mm 台内捕获弧、恢复/throw 参数、直线/圆弧库边段、台阶及安全瞄准窗口由 physics、aim、planner 和 Scene3D 共享。

`physics.test.ts`: 物理内核单元测试与手感指标，覆盖共享碰撞预测、纯 z 逆序三球链、中杆滑动转滚动、台内圆弧捕获参数与落袋事件等回归；独立全区间 CCD/岛隔离/事件次序见 `physics/continuous-collision.test.ts`，六袋矩阵见 `physics/table-geometry.test.ts`。

`planner/`: 走位规划引擎（纯 TS，不碰 React/渲染）——几何候选 → erf 粗筛 → 蒙特卡洛精排 → 3 层精确终态前瞻，输出连续 1–3 杆方案；标定后重算概率、清组后转 8 号、仿真预算封顶、rng 注入可测。

`spin-settle.test.ts`: 加塞停球收敛回归：满塞后原地残余侧旋须在数秒内归零（防 world.moving 仅靠 wy 长期不结束）。

`break-variance.test.ts`: 开球方差回归：验证无 rng 时同力度开球结果确定，传 rng 时同力度连续开球的落袋组合与球堆分布出现差异。

`break-spread.test.ts`: 开球散开回归：瞄顶球满力开球后，固定位移/spread/峰值速度分布阈值断言（固定摆法位移 ≥12/15、spread ×5 以上；8 种子单种子位移 ≥8、均值 ≥10），锁定叉路联立修复成果，防索引序动量漏斗回潮；含能量守恒护栏（任何球峰值 <9.4 m/s）与永动检查。

`audio.ts`: Web Audio合成击球/碰撞音效与包内CC0公园真实鸟鸣/溪流录音；异步解码后重查静音、暂停和销毁状态，不联网。

`hooks/`: React 自定义 Hook 层，将从 Game.tsx 提取的职责按单一职责原则拆分：
  - `useGameState`：集中管理对局状态、局内锁定双方档案与整局一次评估；新局重置 shot 结算守卫
  - `useAimAssist`：默认开启且容错持久化的预测辅助线偏好
  - `useAimInteraction`：封装开球实体母球合法点按/按住拖放与区域约束、自由球虚影落位、世界角点哪打哪、抓影子球、360° 粗瞄，以及默认拨轮/可选方向键与拨轮显式粗精档
  - `useOpponentAI`：消费局前锁定档案，调度限预算战术 Worker、选杆扰动与袋口容错内的执行误差
  - `useAudioManager`：音效初始化和物理/胜局事件播放，暴露 audioRef/playStrike/playPhysicsEvents/playVictory/resetEvents
  - `usePositionPlan`：走位规划预算状态机（idle→computing→ready→showing/failed），只在灯泡显式点亮后经可抢占 Worker 执行 320 次、两层、2.5 秒截止搜索
  - `useDraggableOverlay`：规划/复盘共用的 Pointer 拖拽位移与视口边界约束

`utils/`: 纯工具函数层，不依赖 React 或 DOM：
  - `renderMatchMessage`：将规则层消息键+参数映射为中文文案，纯函数可测试

`textures.ts`: 为 160mm 无缝台呢、细皮革、木纹、球号与六点母球生成 CanvasTexture；全部视觉噪声使用固定种子，刷新、设备与截图门禁可复现，供 Scene3D 延迟初始化使用。

`main.tsx`: React 应用挂载入口，首帧前应用三主题，启用 StrictMode，挂载 Game/ControlOnboarding，并按 base → layout → controls → themes → onboarding 顺序加载样式；当前隐藏调色盘入口，主题 URL、本地偏好与底层主题能力保留。

`vite-env.d.ts`: Vite 客户端类型声明。

`world-selection.ts` / `world-selection.test.ts`: 室内、云海、湖面三种公开局前世界的互斥 URL 合同；湖面兼容旧参数，未知或已隐藏世界保持普通室内，不写长期偏好。宇宙、竹林、极光资产仍由注册表保留供恢复。

多世界正式入口：`Game.tsx` 只在开局时把公开 worldId 传给 `Scene3D`；物理、规则与相机公式不变。`scene/` 拆分共用桌体、静区及外围壳体。选择样式独立位于 `styles/world-shell.css`。


`minitool/`: 小工具专属原生分享与合作式主线程调度边界；share-note / cooperative-search 分别有协议与取消/结果一致性回归。Game 使用 8px 视口留白、4px 控件间隔，横屏浮动比分栏也参与避让；俯视与拾取仍共享 camera-view 的几何解和唯一 FOV。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

2026-10-02 浮动构图：Game 的相机安全区只测比分栏与视口，透明控件不再压缩球桌。ResizeObserver 观察画布和比分栏，移除全页面 MutationObserver。

2026-10-02 UI3：controlLearning 新增独立的 completed-match:v1 完局标记；Game 在实际 finished 或历史 matchesEvaluated > 0 时记录，瞄准/出杆/母球提示对触屏、鼠标、键盘一并停止；不覆盖旧画像、布局或学习列表。

### 小红书 Skill 1.7.0 兼容候选 · 2026-10-02

`minitool/persistent-storage.ts`：启动前读取原生 Storage（9.46+）；原键复制旧浏览器存档、保留原值，兼容 JSON 包装值与合法未包装的主题名/完局标记，结构化存档解析失败仍阻止默认值启动；写入串行并报告失败，保留未成功项供下一次操作重试。Game、主题、布局、引导和瞄准统一使用同一存储接口。
`minitool/runtime-compat.ts`：在游戏依赖初始化前提供实际使用的 flatMap 回退；旧端 Flex gap 以实测分支使用子项 margin。ResizeObserver 缺失时沿用窗口/变更监听。
`minitool/render-guard.ts`：小工具专用静态台体合批与可见资源预算；DPR ≤1.5、200 万像素、30 FPS 初始目标；超预算隐藏装饰，最低档仍超限或渲染失败进入 DOM 提示。暂停渲染时停止物理/对手推进。普通网页构建保留原档位。
`main.tsx`：先兼容初始化，再异步存档准备，最后挂载；读档失败提供重试。真机/平台验收仍待执行，详见根目录 `XHS_SKILL170_AUDIT_20261002.md`。

2026-10-02 胜局庆祝：`minitool/victory-motion.ts` 提供一次性金色弹道烟花与翻转彩屑绘制；`minitool/victory-art.ts` 提供庆祝卡版式与离线兜底场景；`share-note.ts` 在胜局后异步解码包内 `minitool/assets/victory-studio-v3.jpg` 写实底图，单次导出 JPEG，并封装官方临时文件/笔记接口。底图失败回退 Canvas 场景；不新增 WebGL。主题图不是实局截图，图中出杆数仅来自真实 MatchTrainingSummary，无数据时不展示数字；不新增持久化字段。

`scene/crystal-style.ts`: 水晶R3纯视觉层；提亮蓝细绒、圆润四腿罗马柱灵感桌体与波浪金丝、B整红宝石/香槟金白腰带/黑曜石8/珍珠母球，已取消独立钻芯；无物理/存档写操作，不使用网络、Worker或WASM。

`scene/crystal-lighting.ts`: 固定顶部双椭圆柔光灯具与两侧反射条，两个共享灯具网格，无动画或额外阴影贴图。

`scene/gem-optics.ts`: B组整颗宝石的有界透射和体积微面、强化珠光母球、柔化黑8；热/预算降级保留回退。

2026-10-05 R7: opening-camera.ts 为纯相机呈现层，2.8秒远→完整桌腿/桌框→俯视；opening-input.ts 吞掉完整跳过手势，隐藏/失焦清理。Game 开场锁定瞄准并隐藏HUD绘制；模式切换不重播，明确再来一局重播。减少动态偏好直接就位，不修改物理/音效/球径。

私人 A/B：世界 followFeel 默认 current，strikeCueBall 共用中心击点轻抬校准，cloneWorld/规划/对手共用；选择器仅玩家静止未蓄力时可切换，刷新默认当前，重开局保留页内选择。不改变碰撞、摩擦、对手策略与材质。

2026-10-12 开场教学候选：默认城堡/保留场景偏好；5.2s真实柱廊推进、跳过/减少动态/热档与快速重开；场景双卡在安全回合切换；真实出杆结算驱动蓄力→等待或连杆→幽灵球瞄准→拨轮→出杆，完成键兼容并增量保存进度。胜负统一暖白香槟金结算，失败无虚构原因；沿用现有分享能力。正式包与隔离验收夹具分离，原V5包保留。

2026-10-13 release polish: media-query.ts adapts legacy MediaQueryList; shot-lifecycle.ts binds delayed contact to one world/shot/actor. Game owns explicit pause, cancellation on reset and visibility, and retains the existing restart-on-reload contract. PauseMenu offers mute/continue/confirmed restart; match/presentation explains turn, placement and end reasons. Assets, ball/pocket dimensions and physics are unchanged.

2026-10-13 UI RC2：main不再挂载旧文字ControlOnboarding；Game以guide-learning独立累计每种有效操作，满两次后自动停止该操作引导，受限存储保留页内进度。pointerup后的完成事实在事件处理结束后记数。开场3.6秒，保持原镜头路径与物理。

2026-10-13 CASTLE-GEMS: presentation-only castle camera now frames the complete mountain citadel with a 4.8 second skip-capable opening. Scene3D passes render time to world visual updates and keeps the far plane/fog suitable for mountain depth. Physics, rule ownership and RC2 controls are unchanged.

2026-10-13 GEM-LIGHT RC3: Game selects an offline OpeningFilm for castle; Scene3D holds gameplay pose and sleeps behind it. All exit paths release the input gate. No physics or match rule changes.

2026-10-15 H3 opening delivered as one-play animated WebP (540x960@16fps, 6.0s) because the Xiaohongshu uploader whitelist rejects MP4; Game imports arrival.webp and the raw H3 MP4 plus provenance stay preserved. No physics or match rule changes.

2026-10-15 材质工艺v4：Scene3D将最终绘制预算及实际宝石透射写入canvas诊断属性，验证性能保护是否关闭透射；无用户界面新增信息。audio球碰减轻低频、增强1.44–1.8kHz非谐波短尾，保持总音量、六声上限、静音/暂停、落袋及胜局路径。音频回归覆盖能量分布、尾音、幅度和不同采样率。

2026-10-23 本地材质/双指候选：Game将捏合接入既有viewLevel路径并清confirmed framing；先回滚首指球路、再只移动相机。ViewToolbar提供单指回全台替代，无新相机控制器/物理改动。

## 2026-10-24 本轮更新
十位统一年轻插画风格陪练与同局祝贺；局末准度/走位评估、连败缓和、领先让球；按用户最终选择采用暖灰拼缝石板、轻丝绒台泥及低频厚重碰撞音。本轮发布证据见 artifacts/princess-companions-20261023 与项目 pm/COMPANIONS-RELEASE-20261024.md。

2026-10-25：nature-ambience.ts 一次生成32秒24kHz单声道流水/稀疏鸟鸣循环，无网络/定时器。BilliardsAudio 管理单源淡入与静音/暂停/卸载释放；碰撞声低频主体145–190Hz，保留六声限制与原响度。

`nature-ambience.ts`: 解码包内MP3的真实公园鸟鸣/小河录音，来源Thimras/OpenGameArt CC0，30.5秒衔接循环；来源和处理见assets/ambience/provenance.json。
