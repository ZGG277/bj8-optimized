/*
[INPUT]: 当前主线产品源码、本地 GLB 与小红书离线 H5/CSP 约束
[OUTPUT]: dist-minitool 下外置脚本、无 Worker、无 fetch 路径的纯本地静态包
[POS]: 小红书小工具专用构建入口；不改变 vite.config.ts 的本地单 HTML 预览
[PROTOCOL]: 变更时同步运行 npm run build:minitool 与包内静态扫描
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import miniToolCssCompatibility from './scripts/minitool-css-compat.mjs';
import miniToolGlbAssets from './scripts/minitool-glb-assets.mjs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

function miniToolCompatibility(): Plugin {
  const planAdapter = path.join(projectDir, 'src/minitool/plan-worker-adapter.ts');
  const tacticalAdapter = path.join(projectDir, 'src/minitool/tactical-worker-adapter.ts');
  return {
    name: 'bj8-minitool-compatibility',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './world-registry' && importer?.endsWith('/src/scene/studio-environment.ts')) {
        return path.join(projectDir, 'src/scene/public-worlds.ts');
      }
      if (source === './plan-worker?worker&inline' && importer?.endsWith('/src/planner/async.ts')) {
        return planAdapter;
      }
      if (source === './tactical-worker?worker&inline' && importer?.endsWith('/src/opponent/tactical-async.ts')) {
        return tacticalAdapter;
      }
      return null;
    },
    transform(code, id) {
      if (id.endsWith('/three/examples/jsm/loaders/GLTFLoader.js')) {
        return code.replace(
          "if ( typeof createImageBitmap === 'undefined' || ( isSafari && safariVersion < 17 ) || ( isFirefox && firefoxVersion < 98 ) )",
          'if ( true )',
        );
      }
      if (/\bfetch\s*\(\s*(?:req|url\s*,\s*fetchOptions)\s*\)/.test(code)) {
        return code
          .replace(/\bfetch\s*\(\s*req\s*\)/g, "Promise.reject( new Error( 'Network access disabled in Mini Tool' ) )")
          .replace(/\bfetch\s*\(\s*url\s*,\s*fetchOptions\s*\)/g, "Promise.reject( new Error( 'Network access disabled in Mini Tool' ) )");
      }
      return null;
    },
    transformIndexHtml: { order: 'post', handler(html) {
      return html.replace(/<link rel="icon"[^>]*>/g, '').replace(/ type="module"/g, '').replace(/ crossorigin/g, '').replace(/<script src=/g, '<script defer src=').replace(
        'width=device-width, initial-scale=1.0',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
      ).replace('</head>', '    <link rel="icon" href="./assets/favicon.svg" />\n  </head>');
    } },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/favicon.svg',
        source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#163659"/><circle cx="32" cy="32" r="20" fill="#bc294b"/><circle cx="32" cy="32" r="9" fill="#edcc85"/></svg>',
      });
    },
  };
}

export default defineConfig({
  plugins: [miniToolGlbAssets(), miniToolCompatibility(), react()],
  base: './',
  css: { postcss: { plugins: [miniToolCssCompatibility()] } },
  define: { 'import.meta.env.VITE_MINITOOL': JSON.stringify('1') },
  build: {
    target: ['es2017', 'chrome61'],
    cssTarget: 'chrome61',
    outDir: process.env.MINITOOL_DIST || 'dist-minitool',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: file => file.endsWith('.glb') ? true : false,
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
    chunkSizeWarningLimit: 1200,
  },
});
