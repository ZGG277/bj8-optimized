/*
[INPUT]: dist-minitool 静态包、Chrome 与 390×844 触控视口
[OUTPUT]: 真实生产包首屏、开始对局、触控控件、无外部请求/报错/横向溢出的验收回执与截图
[POS]: 小红书小工具包的本地真实浏览器出口验收；自启并回收独立 Vite preview/Chrome
[PROTOCOL]: 小工具入口、触控控件或构建目录变化时同步更新本文件与 scripts/CLAUDE.md
*/
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MINITOOL_PREVIEW_PORT || 5211);
const origin = `http://127.0.0.1:${port}`;
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const screenshotDir = path.join(projectDir, 'artifacts');
const screenshotPath = path.join(screenshotDir, 'xhs-minitool-390x844.png');
const viteBin = path.join(projectDir, 'node_modules/vite/bin/vite.js');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const server = spawn(process.execPath, [viteBin, 'preview', '--config', 'vite.minitool.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: projectDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mini Tool preview did not start')), 10_000);
    const onData = chunk => {
      const output = String(chunk);
      if (output.includes(`127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('exit', code => reject(new Error(`Mini Tool preview exited early (${code})`)));
  });

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) externalRequests.push(url);
  });

  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForSelector('.start-btn', { timeout: 10_000 });
  const intro = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    title: document.title,
  }));
  const startBox = await page.$eval('.start-btn', element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.touchscreen.tap(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForSelector('[data-control-slot="aimDial"] .aim-dial', { timeout: 20_000 });
  await wait(1800);

  const aimBefore = await page.$eval('.aim-dial', element => ({
    fine: element.classList.contains('fine'),
    rect: (() => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })(),
  }));
  await page.touchscreen.tap(aimBefore.rect.x + aimBefore.rect.width / 2, aimBefore.rect.y + aimBefore.rect.height / 2);
  await wait(250);
  const runtime = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const dial = document.querySelector('.aim-dial');
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
      dialFine: dial?.classList.contains('fine') ?? false,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      controls: document.querySelectorAll('[data-control-slot]').length,
      webgl: Boolean(canvas?.getContext('webgl2') || canvas?.getContext('webgl')),
    };
  });
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  const metrics = await page.metrics();

  const checks = {
    title: intro.title === '瓜瓜台球',
    viewportFitCover: intro.viewport.includes('viewport-fit=cover'),
    introNoHorizontalOverflow: intro.overflow <= 0,
    gameNoHorizontalOverflow: runtime.overflow <= 0,
    touchChangedAimMode: aimBefore.fine !== runtime.dialFine,
    controlsPresent: runtime.controls >= 5,
    webglAvailable: runtime.webgl,
    noExternalRequests: externalRequests.length === 0,
    noPageErrors: errors.length === 0,
  };
  if (Object.values(checks).some(value => !value)) throw new Error(JSON.stringify({ checks, errors, externalRequests, runtime }, null, 2));
  console.log(JSON.stringify({ checks, runtime, metrics: {
    JSHeapUsedSize: metrics.JSHeapUsedSize,
    TaskDuration: metrics.TaskDuration,
  }, screenshotPath }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), wait(2000)]);
}
