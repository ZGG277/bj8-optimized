# minitool/

2026-11-04：render-guard将背景天空纹理纳入去重显存预算；render-guard.test.ts校验背景与环境复用纹理不重复计量。

> L2 | 父级：../CLAUDE.md

小红书离线容器边界；普通浏览器没有原生 SDK，局后界面负责同图预览，不伪造分享成功。

2026-11-03：match-card显式等待typography字体加载后绘图并缓存；victory-art的兼容卡面也用同一Canvas字体。分享仍原样使用卡面首图，不改内容/顺序/记录。

- persistent-storage.ts：统一存档、迁移、串行落盘；白名单包括首次视角提示标记。
- persistent-storage.test.ts / storage-compatibility.test.ts：存档失败与兼容回归。
- runtime-compat.ts：旧运行时回退。
- render-guard.ts：资源、像素、帧率预算与降级。
- share-note.ts / share-note.test.ts：用户主动触发两图 postNote、临时文件、取消与失败回归，不自动发布。
- match-card.ts：局后、卡册、分享共用卡面缓存。
- victory-art.ts / victory-motion.ts：离线庆祝图和有界 Canvas 庆祝。
- assets/victory-studio-v3.jpg：保留的庆祝底图。
- follow-author.ts / follow-author.test.ts：主动关注的容器适配。
- cooperative-search.ts / cooperative-search.test.ts：主线程分片搜索、预算与取消。
- plan-worker-adapter.ts / tactical-worker-adapter.ts：无 Worker 的规划适配。

[PROTOCOL]: 变更时更新此文件，然后检查父级 CLAUDE.md。
