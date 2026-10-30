# 公主请开球

本目录保存用户接受的2026-10-30透明R4源码。内部package版本1.1.0，小红书目标1.0.7；[固定代码与源包映射](../../VERSIONING.md)和PUBLIC_SOURCE_MANIFEST.json记录准确基线。GitHub同步与小红书提交、审核、上线分别记录。

当前版本包含透明宝石桌边、细圆弧袋口和稍高的第一视角；结算卡共用镶边卡体，中间只留不超过10字的一句话，提前黑八落袋显示“没关系，我陪你”。新获胜卡按实际先后保存同一姓名、原句和卡面版本；旧存档保留总数而不编造缺失的逐局内容。顶部有卡册和操作说明，视角仅保留“全局视角”“第一视角”及对应选中颜色。碰撞、库边和落袋采用真实台球风格的程序模拟，保留鸟鸣水流并加入轻音乐。

保留10位陪练、友好AI、原声开场及既有玩法。已有关注作者功能只在宿主能力支持且非作者本人时显示。Android/iOS真机、实际App分享SDK和本版公开上线未验证。

## 运行与构建

使用Node24、npm11。在本目录运行`npm ls --depth=0`；仅首次缺依赖时`npm ci --ignore-scripts`。`npm run typecheck`、`npm test`、`npm run build`分别进行类型、单元测试和普通构建；`npm run dev -- --host 127.0.0.1`后以`?world=castle`进入城堡。`npm run build:minitool`构建离线包，上传前须核对平台当日规范。

运行模型、字体和图像在src内。常规构建无需重新运行Blender或作者资产脚本。素材来源见仓库根ASSET_SOURCES.md及本目录ASSET_PROVENANCE.json。
