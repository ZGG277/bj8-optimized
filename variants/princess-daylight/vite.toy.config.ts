import { defineConfig, mergeConfig } from 'vite';
import offlineConfig from './vite.minitool.config';

export default defineConfig(mergeConfig(offlineConfig, {
  define: { 'import.meta.env.VITE_BILIBILI_TOY': JSON.stringify('1') },
  build: { outDir: 'dist-toy-pc' },
}));
