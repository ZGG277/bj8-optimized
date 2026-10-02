# layout/

> L3 | 父级: `../CLAUDE.md`

## 成员清单

`control-layout.ts`: 五控件布局纯领域模型；定义自由/右侧/底部 placement、沿边归一化落点、desktop/portrait/landscape 三套档案、8px 安全钳制、48px 吸附、同边位置交换、最近空位避让与停靠容量，并把旧 order/v2 偏移迁移到 `guagua-billiards:control-layout:v3` 而不删除旧键。

`control-layout.test.ts`: 布局确定性回归，覆盖三类档案、自由坐标钳制、双边吸附、横竖轴换算、沿边落点、同边交换、最近空位、容量拒绝、损坏回退与旧偏移迁移。

[PROTOCOL]: 变更成员时更新本文件，然后检查 `../CLAUDE.md`

2026-10-02：新默认瞄准器停靠底部，视角入口缩成 50px；仅完整匹配旧默认的档案换用新默认，任一自定义位置使整份档案保留；v2 和缺失 position 的 v3 继续使用历史锚点。
