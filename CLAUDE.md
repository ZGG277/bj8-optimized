# bj8-optimized/

> L2 | 父级: `../CLAUDE.md`

独立 Vite + React + Three.js 中式八球实验场，验证 240 Hz 物理、双视角、杆法、规则轮转与真实交互。

## 成员清单

`src/`: 游戏业务源码（9 文件），包含物理世界、React 对局编排、Three.js 场景、音频、程序化贴图与样式。

`scripts/`: 浏览器交互、画面与场景对象验证脚本；Phase 1 将收敛为真实指针输入回归门禁。

`shots/`: 人工与自动化试玩截图，仅作为视觉回归证据，不作为运行时依赖。

`index.html`: Vite HTML 入口，挂载 React 根节点并声明页面元数据。

`package.json`: 本实验场的依赖与命令入口；Phase 0 将补充统一 `check` 门禁。

`package-lock.json`: npm 依赖锁文件，保证本地与验证环境依赖一致。

`tsconfig.json`: TypeScript 严格模式与未使用符号检查配置。

`vite.config.ts`: Vite React 构建配置，使用相对资源基址支持静态托管。

`PHASE_0_1_EXECUTION_PLAN.md`: 规则正确性、GEB 同构、输入确定性与固定步时钟的可执行优化方案。

`dist/`: Vite 生成产物，不作为源代码维护。

`node_modules/`: 本地依赖缓存，不进入版本控制。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
