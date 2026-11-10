import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import offlineConfig from './vite.minitool.config';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

function landscapeOpening(): Plugin {
  const target = path.join(projectDir, 'src/opening-landscape.toy.ts');
  return {
    name: 'landscape-opening',
    enforce: 'pre',
    resolveId(source) {
      if (source === './opening-landscape' || source.endsWith('/opening-landscape')) return target;
      return null;
    },
  };
}

export default defineConfig(mergeConfig(offlineConfig, {
  plugins: [landscapeOpening()],
  define: { 'import.meta.env.VITE_BILIBILI_TOY': JSON.stringify('1') },
  build: { outDir: 'dist-toy-pc' },
}));
