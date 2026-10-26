/*
[INPUT]: 当前工作树 Git 跟踪/未跟踪文件、源码与构建配置的实际字节
[OUTPUT]: stdout JSON：HEAD、源码指纹、保护文件哈希、构建哈希；不修改工作区
[POS]: 优化验收的源码冻结工具，供主 Session 与 Spark 对比输入，拒绝使用陈旧测试结果
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const sha = value => createHash('sha256').update(value).digest('hex');
const paths = [...new Set(execFileSync('git', [
  'ls-files', '-c', '-o', '--exclude-standard', '-z',
  'src', 'scripts', 'index.html', 'package.json', 'package-lock.json',
  'tsconfig.json', 'vite.config.ts',
], { encoding: 'utf8' }).split('\0').filter(path => path && !path.endsWith('.md')))].sort();
const hash = createHash('sha256');
for (const path of paths) {
  hash.update(path).update('\0').update(readFileSync(path)).update('\0');
}
const protectedPaths = ['src/components/IntroScreen.tsx', 'src/styles/layout.css'];
console.log(JSON.stringify({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: hash.digest('hex'),
  sourceFileCount: paths.length,
  protectedFiles: Object.fromEntries(protectedPaths.map(path => [path, sha(readFileSync(path))])),
  artifact: existsSync('dist/index.html') ? {
    path: 'dist/index.html', sha256: sha(readFileSync('dist/index.html')),
    bytes: readFileSync('dist/index.html').byteLength,
  } : null,
}, null, 2));
