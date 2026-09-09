# 瓜瓜台球项目基线

2026-09-10：**v1.7.2 已发布到妙搭；GitHub 主线、妙搭 release、正式租户入口和实际 CDN 构建已对齐，桌面与 390×844 关键旅程通过。**

## 固定版本与发布回执

| 项目 | 已核对的值 |
| --- | --- |
| 产品仓库 / 分支 | https://github.com/ZGG277/bj8-optimized / `main` |
| 不可变源码标签 | `v1.7.2`，带注释标签 |
| 产品源码提交 | `ea6784f139a6b743eb386263b9721212b8317774` |
| 妙搭包装提交 | `515ee4b6b64dc95848c67c922bf617dd3e5bab86`，`sprint/default` |
| 妙搭应用 | `app_17b18dh5axj`，瓜瓜台球 |
| 本次唯一 release | `7683666047719328977`，`finished`；返回的 `commit_id` 与包装提交一致 |
| 单 HTML 产物 | 9,422,242 bytes |
| HTML SHA-256 | `3fc50d5cac0a9480550a13388f0eb4b1b335acf0be7429951801d40eedc8f4b2` |

主树构建与包装内产物逐字节相同；正式入口 iframe 精确指向妙搭包装提交 `515ee4b`。`BUILD_PROVENANCE.json` 固定上述源码提交、标签和哈希。

当前正式入口：[打开瓜瓜台球](https://lg22l37ytz.feishuapp.com/app/app_17b18dh5axj)。正式父页面标题为“瓜瓜台球”，实际 iframe 指向 `lf-miaoda-static.feishucdn.com/app_17b18dh5axj/515ee4b.../client/game/index.html`。

## 本版范围

- 局前公开静谧球房、云海浮台、安静湖面三种世界；银河、竹林、极光资源和注册能力继续保留但不显示在公共入口。
- `lake360=1` 继续兼容湖面旧链接；选择室内或云海会清除该覆盖参数，不再误入湖面。
- Blender 球桌新增布边下承托和两侧中袋外裙板，关闭湖面低视角可见缝隙；修复 GLB 为 781,964 bytes、19 网格、24,684 三角。
- 顾燃 25/60/90 级在瞄准误差、力量扰动、战术搜索深度与后续走位权重上形成连续梯度；固定采样失准率分别为 47.16%、2.26%、0%。
- 玩家界面隐藏调色盘入口；三套主题源码、URL 参数、键盘切换和本机偏好继续生效。

## 验收证据

- 主线完整 `npm run check`：类型检查、55 个测试文件 / 394 项测试、生产构建全部通过。
- Blender 修复自动验证：17 个原网格保持、150 段库边承托、两个中袋裙板与两项袋腔间隙检查通过；同视角前后图和源 blend 位于 `assets/blender/billiards-room-v1/`。
- 妙搭包装 server/client typecheck、生产构建、ESLint 与 precommit 通过；裁剪器的两个顶层复制缺口均由现存嵌套依赖满足，嵌套模块和打包 AppModule 实际加载成功。
- 正式入口桌面验证静谧球房、云海浮台均能进入对局，canvas 正常且无湖面控件；390×844 湖面局前只有三个公开世界、无横向溢出，开始后 canvas、环顾湖面和暂停水波均存在；三种入口调色盘计数均为 0。
- 候选数值、模型哈希和本地交叉路径见 `shots/local-candidate/LOCAL_CANDIDATE_ACCEPTANCE.md`；妙搭发布前证据在包装树 `shots/release-v1.7.2/prepublish.json`。

## 发布约定

妙搭只从已提交、已加精确版本标签且干净的主树执行 `npm run sync:game`。`bj8-miaoda-app` 的 `sprint/default` 消费产物，`BUILD_PROVENANCE.json` 记录源码提交、标签和 HTML SHA-256。每次发布仍需从 release 回执入口覆盖桌面 1280×800、手机 390×844 的首屏、开始对局、视角和出杆；历史 `aiforce.cloud` 别名恢复后可另做可达性复验。

前次正式基线为 `v1.7.1` / `91331ffacb07163b9b46d11d24ffcebf6c20f461`，妙搭 release `7683493429225295033`。后续开发继续从 `bj8-main-integration/main` 进行；不将妙搭包装树、归档或历史镜像作为产品源码。
