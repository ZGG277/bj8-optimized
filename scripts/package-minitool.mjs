/*
[INPUT]: dist-minitool 静态构建、package.json 版本与当前 Git 基线
[OUTPUT]: artifacts/guagua-billiards-xhs-minitool-v<version>.zip 及严格离线/CSP 自检回执
[POS]: 小红书小工具产物打包边界；只读取构建目录，不修改产品源码
[PROTOCOL]: 与 ~/.codex/skills/minitool-zip-builder 1.2.0 的三份 reference 保持一致
*/
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.resolve(projectDir, process.env.MINITOOL_DIST || 'dist-minitool');
const artifactDir = path.join(projectDir, 'artifacts');
const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
const variant = process.env.MINITOOL_VARIANT || 'local';
if (!/^[a-z0-9.-]+$/i.test(variant)) throw new Error('Invalid Mini Tool variant');
const zipName = `guagua-billiards-xhs-minitool-v${packageJson.version}-${variant}.zip`;
const zipPath = path.join(artifactDir, zipName);
const allowedExtensions = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);

async function filesUnder(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path.join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).trim();
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--',
  'src', 'scripts', 'package.json', 'package-lock.json', 'vite.config.ts', 'vite.minitool.config.ts', 'index.html'],
  { cwd: projectDir, encoding: 'utf8' }).trim());
if (process.env.MINITOOL_REQUIRE_COMMITTED === '1' && sourceDirty) {
  throw new Error('Upload package requires committed source files');
}
let sourceTag = null;
try { sourceTag = execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* local candidates need not be tagged */ }
const sourcePaths = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: projectDir, encoding: 'utf8' }).split('\0'))]
  .filter(file => file.startsWith('src/') || file.startsWith('scripts/') || /^(?:package(?:-lock)?\.json|vite.*\.ts|index\.html)$/.test(file)).sort();
const sourceFileSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file,
  createHash('sha256').update(await readFile(path.join(projectDir, file))).digest('hex')])));
const sourceFingerprint = createHash('sha256').update(JSON.stringify(sourceFileSha256)).digest('hex');
const runtimePackages = ['react', 'react-dom', 'scheduler', 'three'];
const thirdPartyNotices = await Promise.all(runtimePackages.map(async name => {
  const packageRoot = path.join(projectDir, 'node_modules', name);
  const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  return {
    name,
    version: metadata.version,
    license: metadata.license,
    licenseText: await readFile(path.join(packageRoot, 'LICENSE'), 'utf8'),
  };
}));
await writeFile(path.join(distDir, 'THIRD_PARTY_NOTICES.json'), JSON.stringify(thirdPartyNotices, null, 2) + '\n');
const builtFiles = (await filesUnder(distDir)).filter(file => file !== 'BUILD_PROVENANCE.json');
const builtFileSha256 = Object.fromEntries(await Promise.all(builtFiles.map(async file => [
  file,
  createHash('sha256').update(await readFile(path.join(distDir, file))).digest('hex'),
])));
await writeFile(path.join(distDir, 'BUILD_PROVENANCE.json'), JSON.stringify({
  product: '瓜瓜台球',
  packageVersion: packageJson.version,
  variant,
  sourceFingerprint,
  sourceFileSha256,
  baselineCommit: sourceCommit,
  baselineTag: sourceTag,
  sourceState: sourceDirty ? 'working-tree' : 'committed',
  adaptation: sourceDirty ? 'local uncommitted Mini Tool optimization candidate' : 'committed Xiaohongshu Mini Tool build',
  miniToolSkillVersion: '1.2.0',
  builtFileSha256,
}, null, 2) + '\n');

const files = await filesUnder(distDir);
if (!files.includes('index.html')) throw new Error('Mini Tool package must contain index.html at the zip root');
if (files.filter(file => file.endsWith('.html')).length !== 1) throw new Error('Mini Tool package must contain exactly one HTML file');
for (const file of files) {
  if (!allowedExtensions.has(path.extname(file).toLowerCase())) throw new Error(`Unsupported package file: ${file}`);
  if (file.includes('.DS_Store') || file.endsWith('.map')) throw new Error(`Development artifact in package: ${file}`);
}

const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
const requiredHtml = [
  ['doctype', /<!doctype html>/i], ['language', /<html[^>]+lang=["']zh-CN["']/i],
  ['charset', /charset=["']?UTF-8/i], ['viewport-fit', /viewport-fit=cover/i],
];
for (const [label, pattern] of requiredHtml) if (!pattern.test(html)) throw new Error(`index.html missing ${label}`);
if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html)) throw new Error('Inline script is forbidden');
if (/\son[a-z]+\s*=|javascript:|<base\b|<iframe\b|<object\b|http:\/\/|https:\/\//i.test(html)) {
  throw new Error('index.html contains a forbidden inline handler, element, or external URL');
}

const assetRefs = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);
for (const ref of assetRefs) {
  if (!ref.startsWith('./')) throw new Error(`Resource path must be relative: ${ref}`);
  const target = path.resolve(distDir, ref);
  if (!target.startsWith(`${distDir}${path.sep}`) || !(await stat(target)).isFile()) throw new Error(`Missing resource: ${ref}`);
}

const text = (await Promise.all(files.filter(file => /\.(?:html|css|js|json)$/i.test(file))
  .map(file => readFile(path.join(distDir, file), 'utf8')))).join('\n');
const forbidden = [
  ['network request', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bEventSource\s*\(|\bRTCPeerConnection\s*\(/],
  ['worker', /\bnew\s+(?:Shared)?Worker\s*\(|navigator\.serviceWorker/],
  ['dynamic code', /\beval\s*\(|\bnew\s+Function\s*\(|\bWebAssembly\b/],
  ['restricted device API', /navigator\.(?:geolocation|clipboard|bluetooth|usb|hid|serial|getBattery|connection|credentials|locks)|DeviceMotionEvent|DeviceOrientationEvent/],
  ['navigation or embedding', /window\.open\s*\(|window\.prompt\s*\(|<iframe\b|<object\b|target=["']_blank|\sdownload(?:=|\s|>)/],
  ['remote resource', /(?:src|href)=["']https?:\/\/|url\(\s*["']?https?:\/\//],
];
for (const [label, pattern] of forbidden) if (pattern.test(text)) throw new Error(`Forbidden ${label} remains in package`);

await mkdir(artifactDir, { recursive: true });
await unlink(zipPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
execFileSync('zip', ['-q', '-r', zipPath, '.'], { cwd: distDir });
const zipEntries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
if (!zipEntries.includes('index.html')) throw new Error('ZIP root does not contain index.html');
if (zipEntries.some(entry => entry.startsWith('dist-minitool/'))) throw new Error('ZIP contains an extra outer directory');

const totalBytes = (await Promise.all(files.map(file => stat(path.join(distDir, file))))).reduce((sum, item) => sum + item.size, 0);
const zipBytes = (await stat(zipPath)).size;
console.log(JSON.stringify({ zipPath, sourceCommit, sourceTag, files, totalBytes, zipBytes, recommendedUnder2MiB: zipBytes < 2 * 1024 * 1024 }, null, 2));
