/*
[INPUT]: 依赖 Vite 客户端类型包
[OUTPUT]: 对外提供 Vite 环境变量与资源导入的类型声明（无运行时导出）
[POS]: 类型声明层，仅让 tsc 识别 import.meta.env 与静态资源模块
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
/// <reference types="vite/client" />
