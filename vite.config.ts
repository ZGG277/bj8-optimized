/*
[INPUT]: 依赖 Vite、React 插件与源码依赖图
[OUTPUT]: 对外提供相对路径静态托管构建，并把 React / Three.js 稳定依赖拆成独立缓存 chunk
[POS]: 构建边界配置；不改变运行时业务语义
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Three.js 本身是单一大型 ESM 模块，无法继续按源码模块拆分；独立成稳定缓存块，
    // React 另成小块，业务迭代不再让用户重复下载整个渲染引擎。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/examples/')) return 'three-addons'
          if (id.includes('/node_modules/three/')) return 'three-core'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'react-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
