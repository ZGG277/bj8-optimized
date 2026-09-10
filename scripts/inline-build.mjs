/*
[INPUT]: Vite 生成的 dist/index.html（或显式 BJ8_BUILD_OUT_DIR）与本地 CSS / ESM 入口
[OUTPUT]: 将构建资源内联回目标 index.html，并拒绝残留 assets 外链或超过妙搭 10 MB HTML 上限的产物
[POS]: 妙搭单文件适配层；默认仍产出正式 dist，独立 DEV 候选显式指定目录，不混用发布产物
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = process.env.BJ8_BUILD_OUT_DIR
  ? path.resolve(projectDir, process.env.BJ8_BUILD_OUT_DIR)
  : path.join(projectDir, 'dist')
const htmlPath = path.join(distDir, 'index.html')
const maxHtmlBytes = 10 * 1024 * 1024

function localAssetPath(assetUrl) {
  const relativePath = assetUrl.replace(/^\.\//, '')
  const resolved = path.resolve(distDir, relativePath)
  if (!resolved.startsWith(`${distDir}${path.sep}`)) {
    throw new Error(`inline-build: unsafe asset path ${assetUrl}`)
  }
  return resolved
}

let html = await readFile(htmlPath, 'utf8')
let inlinedStyles = 0
let inlinedScripts = 0

const styleTags = html.match(/<link\b[^>]*>/gi) ?? []
for (const tag of styleTags) {
  if (!/\brel=["']stylesheet["']/i.test(tag)) continue
  const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
  if (!href || !/^(?:\.\/)?assets\//.test(href)) continue
  const css = await readFile(localAssetPath(href), 'utf8')
  html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
  inlinedStyles += 1
}

html = html.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi, '')

const scriptTags = html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi) ?? []
for (const tag of scriptTags) {
  const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
  if (!src || !/^(?:\.\/)?assets\//.test(src)) continue
  let js = await readFile(localAssetPath(src), 'utf8')
  // Moving the ESM entry into HTML changes import.meta.url. Embed its authored world
  // models before that move, so a model URL cannot silently resolve to the SPA fallback.
  const modelReferences = [...js.matchAll(/new URL\(["'](world-(?:galaxy|bamboo|aurora-lake)-[^"']+\.glb)["'],\s*import\.meta\.url\)\.href/g)]
  for (const reference of modelReferences) {
    const modelPath = path.posix.join(path.posix.dirname(src), reference[1])
    const model = await readFile(localAssetPath(modelPath))
    js = js.replace(reference[0], JSON.stringify(`data:model/gltf-binary;base64,${model.toString('base64')}`))
  }
  if (/new URL\(["']world-[^"']+\.glb["']/.test(js)) {
    throw new Error('inline-build: unresolved world model URL remains after moving ESM into HTML')
  }
  html = html.replace(
    tag,
    () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  )
  inlinedScripts += 1
}

const remainingAsset = html.match(
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:\.\/)?assets\/[^>]+>/i,
)
if (remainingAsset) {
  throw new Error(`inline-build: external build asset remains: ${remainingAsset[0]}`)
}
if (inlinedScripts !== 1 || inlinedStyles !== 1) {
  throw new Error(
    `inline-build: expected one script and one stylesheet, got ${inlinedScripts} script(s) and ${inlinedStyles} stylesheet(s)`,
  )
}

await writeFile(htmlPath, html)
const { size } = await stat(htmlPath)
if (size > maxHtmlBytes) {
  throw new Error(`inline-build: index.html is ${size} bytes, exceeding the 10 MB Miaoda limit`)
}

console.log(`inline-build: wrote ${size} byte single-file ${path.relative(projectDir, htmlPath)}`)
