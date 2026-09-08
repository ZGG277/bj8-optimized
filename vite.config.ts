/*
[INPUT]: 依赖 Vite、React 插件与源码依赖图
[OUTPUT]: 对外提供单 HTML 静态托管构建，内联 React / Three.js / CSS 以兼容会重定向模块资源的托管平台
[POS]: 构建边界配置；生产产物不依赖外部 chunk，不改变本地开发与运行时业务语义
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Blender 视觉包内联到既有单 HTML，避免妙搭包装丢失独立 GLB。
    assetsInlineLimit: file => /\/(billiards-room-v1|table-craft-v2)\.glb$/.test(file) ? true : undefined,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
