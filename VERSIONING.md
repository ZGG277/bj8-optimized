# 当前源码与发布对应 · 2026-11-01

## 公主请开球 · D2正式整合版

- 产品代码基线：`e85346d9b7958100bd95296bab7b9068a49117b3`；[固定源码](https://github.com/ZGG277/bj8-optimized/tree/e85346d9b7958100bd95296bab7b9068a49117b3/variants/princess-daylight)。
- 分支：`release/princess-xhs-v1.0.8-d2-20261101`；唯一维护源：`bj8-main-integration/variants/princess-daylight`。本地维护分支/旧HEAD和17项无关WIP保留；发布在隔离副本完成，未合并默认main。
- 本次包含D2球桌精修、主维护源现有碰撞反馈，以及手机默认控件遮袋的必要修正；C2短开场/头像选择未合入，开场保留当前正式源12551ms。
- 内部package1.1.0；平台新表单1.0.8，原卡实核1.0.7已发布。1.0.8同包上传一次、部署成功；本次协议待用户确认，尚未提审/发布，不写已上线。
- 466项构建源指纹：`7e917947a084f0103c26fdaec511b5876ca8c302d3907d773870137dcc7893bd`。逐项公开清单见产品PUBLIC_SOURCE_MANIFEST.json，与产品提交和部署ZIP匹配。
- ZIP：`princess-billiards-xhs-minitool-v1.1.0-integrated-d2-r4-20261101.zip`，10,261,413字节，SHA256 `05349d546e26136410d78d26e56e7bd60e3f01ed6f5eb2baee7b8b4d8220f68b`；66运行文件与实际本机5274/ZIP逐项一致。
- 类型/构建/静态审计、相关82项、390×844和320×640及桌面真实入口通过；35秒持续第一视角和43秒真实触摸出杆记录未复现30秒停顿。全量首次824项中821通过，3项旧断言修正后相关9项通过；未把聚焦结果虚记为再次全量通过。
- 合法22cm六袋近景使用同源独立诊断包；正式包没有测试句柄。旧存档用隔离合成夹具核3键字节保持并还原，不访问真实玩家存档。
- Android/iOS扫码、Chrome61运行/性能、真实宿主分享仍未验；平台模拟器结果另见最终回执，普通浏览器通过不替代原生宿主与手机验收。
- Git源与平台状态独立记录。正式发布前不创建已发布tag。前次透明R4源码c3f8fca和ZIP保留。

## 历史基线记录

# 当前源码与发布对应 · 2026-10-30

## 公主请开球 · 透明工作版R4

- 产品代码基线：`c3f8fcac92a8d4aa89e0ef94dad5e5e2e6888d4a`；[固定源码](https://github.com/ZGG277/bj8-optimized/tree/c3f8fcac92a8d4aa89e0ef94dad5e5e2e6888d4a/variants/princess-daylight)。
- 分支：`release/princess-xhs-v1.0.7-r4-20261030`；产品目录：`variants/princess-daylight`。
- 内部package版本1.1.0；小红书原卡目标版本1.0.7，二者分别记录。
- 455项构建源指纹：`da0aa7f1502c42f58ad42ba7fb5d12611eac79d7c1127f9cb71122d7e6d88892`。逐文件SHA见产品PUBLIC_SOURCE_MANIFEST.json；提交对象逐项与已部署冻结源核对一致。文档提交不改变产品代码基线。
- 用户已接受透明上缘和圆弧袋口，并要求更高第一视角、统一不超过10字的卡片、提前黑八安慰、逐胜局同图卡册、顶部帮助及两视角选色、真实台球模拟声和轻音乐；原五项Flomo改动保留。
- 离线ZIP：`princess-billiards-xhs-minitool-v1.1.0-transparent-r4-20261030.zip`；10,255,044字节；SHA256 `eab53360ad8f5928e83151c39a8836584dc5ca5235b93ddc9f568cb0c7faa413`。
- 小红书：同包上传一次、部署成功；11项平台原生控件及出杆检查通过。用户随后明确“我自己提交”，平台提交由用户操作；尚未取得本版提交、审核或正式上线回执。GitHub同步不代表小红书上线。
- 复用同一冻结源的63项受影响测试、类型/构建、13源旅程、10最终包检查；本次Git提交再次核对455项暂存文件的SHA，并核对远端对象。
- Android/iOS真机、Chrome61运行/性能、实际App分享SDK未验；本机卡片/分享取消使用残局夹具和SDK替身，未冒充真实宿主完整旅程。旧存档仅保留可知总数，不编造缺失的逐局原句。
- 原Main未批准的HUD、光效和输入WIP未混入本分支；没有修改其他产品运行源、默认分支、仓库公开性或小红书表单。

## 前次公主基线

1.0.6产品代码`4e36813d4e4e5e5ba8cb40b357601bd90ec09c94`，文档`5e111fe8a09f67b15f1db07285d8d9b9043ebcfe`，分支`release/princess-xhs-v1.0.6-20261027`保留。10/30后台实核1.0.6未通过，不能沿用10/27用户提交反馈推断已上线。

## 中八与仓库历史

中八247项源指纹保持`f1136f01190f7fd83faa4c3f44196ec307c064b65806c0d9d3b8d5418adbeced`；本次未改其运行源。10/26基线`10ef15aee95f732a6ae84692fc243caf00a10e5b`和原main `125b59adcec028a00e0aa795ef8f00c13fed417a`保留，未合并main。

## 本机维护与恢复

唯一维护根为bj8-main-integration/variants/princess-daylight；维护Git分支candidate/board-integration-20261011、HEAD f9318dc9fbd45f59e82afb88ddc198bd9a958624和无关WIP继续保留，不能将该旧HEAD冒作公主基线。精确公开R4在pm/baselines/PRINCESS-TRANSPARENT-R4-20261030/publication，已推送到上述R4分支；其他候选和旧R3保留。GitHub远端1428个blob及mode与本地一致，455构建源与部署ZIP映射不变。文档commit为68331c6f939405a5255610f6e8b8505ef465c772；平台最终提交由用户负责，尚无本次提交/审核/上线回执。

## 本地源码整合 · 2026-11-01 D2球桌

用户直接授权将球桌D2合入唯一维护根 `variants/princess-daylight`。本地源码合并完成，保留主线碰撞反馈等已有改动；类型与108项定向测试通过。夜间未完整构建/运行验收，现有预览和发布包未更新；R4远端/平台基线不变，无提交推送发布。详情见 [合并记录](variants/princess-daylight/TABLE_DETAIL_INTEGRATION_20261101.md)。C2短开场/头像仍为独立候选，本次不代为晋升。
