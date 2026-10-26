/*
[INPUT]: 依赖 Vite、React 插件与源码依赖图
[OUTPUT]: 对外提供单 HTML 静态托管构建，内联 React / Three.js / CSS 以兼容会重定向模块资源的托管平台
[POS]: 构建边界配置；生产产物不依赖外部 chunk，不改变本地开发与运行时业务语义
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const projectDir = path.dirname(fileURLToPath(import.meta.url))
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/*.test.ts'] },
  plugins: [react(), {
    name: 'princess-public-world-assets', apply: 'build', enforce: 'pre',
    resolveId(source, importer) {
      if (source === './world-registry' && importer?.endsWith('/src/scene/studio-environment.ts')) {
        return path.join(projectDir, 'src/scene/public-worlds.ts')
      }
      return null
    },
  }],
  base: './',
  build: {
    // Blender 视觉包内联到既有单 HTML，避免妙搭包装丢失独立 GLB。
    assetsInlineLimit: file => (file.includes('/daylight/') || /\/(billiards-room-v1|table-craft-v2|lake360)\.glb$/.test(file) || file.endsWith('/prince-white-horse.webp')) ? true : undefined,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
