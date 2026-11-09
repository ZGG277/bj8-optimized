# minitool/

2026-11-06分享首图修订：按用户反馈去掉生成底图中的手、手套和袖口，保留近景球杆、白球、宝石彩球和宫殿；share-cover仅改底图引用。原有手版和测试证据保留，合并新包尚未上传。

2026-11-05分享首图：share-cover.ts以包内生成的近景宝石球桌底图叠加本局头像/同一句赞美，字体就绪后输出1080×1440整图。RoyalFinish在普通浏览器展示与平台完全同图同文案的预览；原赞美卡作为胜局第二张，卡册与败局原卡不改。share-note固定胜局标题并只列真实已赢的去重姓名，仍只由用户点击唤起笔记编辑页。

2026-11-04：render-guard将背景天空纹理纳入去重显存预算；render-guard.test.ts校验背景与环境复用纹理不重复计量。

> L2 | 父级：../CLAUDE.md

小红书离线容器边界；普通浏览器没有原生 SDK，局后界面负责同图预览，不伪造分享成功。

2026-11-03：match-card显式等待typography字体加载后绘图并缓存；victory-art的兼容卡面也用同一Canvas字体。分享仍原样使用卡面首图，不改内容/顺序/记录。

- persistent-storage.ts：统一存档、迁移、串行落盘；白名单包括首次视角提示标记。
- persistent-storage.test.ts / storage-compatibility.test.ts：存档失败与兼容回归。
- runtime-compat.ts：旧运行时回退。
- render-guard.ts：资源、像素、帧率预算与降级。
- share-note.ts / share-note.test.ts：胜局首图为整图封面、第二张为原卡，固定标题/真实战绩正文；临时文件、取消与失败回归，不自动发布。
- share-cover.ts / share-cover.test.ts：生成底图与本局头像/原句的确定性Canvas合成，同图缓存、字体门禁、失败可重试，不读WebGL或修改记录。
- match-card.ts：局后、卡册、分享共用卡面缓存。
- victory-art.ts / victory-motion.ts：离线庆祝图和有界 Canvas 庆祝。
- assets/victory-studio-v3.jpg：保留的庆祝底图。
- follow-author.ts / follow-author.test.ts：主动关注的容器适配。
- cooperative-search.ts / cooperative-search.test.ts：主线程分片搜索、预算与取消。
- plan-worker-adapter.ts / tactical-worker-adapter.ts：无 Worker 的规划适配。

[PROTOCOL]: 变更时更新此文件，然后检查父级 CLAUDE.md。

2026-11-08 share-note.ts 的胜局、陪练或挑战及安慰分享正文统一使用全角井号＃，通过同一草稿路径交给小红书。
