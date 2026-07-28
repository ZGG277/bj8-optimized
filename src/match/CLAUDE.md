# src/match/

> L2 | 父级: `../CLAUDE.md`

中八规则的纯状态机层：不读 React、不写物理世界、不拼 UI 文案，只把一杆事实映射为一次原子状态迁移。

## 成员清单

`types.ts`: MatchState / ShotFacts / RoundResolution 协议类型；规则状态必须原子迁移的唯一契约。

`shot-facts.ts`: factsFromWorld，从物理世界快照推导一杆事实；不执行 respotCueBall。

`match-machine.ts`: 合法目标推导、初始对局与 resolveStoppedShot 纯结算函数；犯规、分组、开球退出、自由球效果与 8 号胜负的唯一实现；"碰球后须碰库或进球"的进球含 8 号——干净打进 8 号不算 no-cushion。

`match-machine.test.ts`: 规则测试矩阵（16+ 用例），含 R-01 连续进球分组回归、干净进 8 号无碰库胜负回归与确定性断言。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
