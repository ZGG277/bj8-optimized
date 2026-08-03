/*
[INPUT]: 依赖已启动的本地游戏页、Chrome/Chromium 与 puppeteer-core
[OUTPUT]: 桌面首屏空闲停帧、运动帧上限、GPU 监控快照、温控毛玻璃降级与手机 2× 清晰度断言
[POS]: 自适应 GPU/发热治理的真实浏览器出口验收
[PROTOCOL]: 温控档位、调试快照或首屏渲染契约变化时同步更新本文件与 scripts/CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let browser;
try {
browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });

// 允许首次相机平滑就位；验收的是“收敛后不空转”而非禁用开场过渡。
await wait(1500);
const introStart = await page.evaluate(() => window.__bj8.scene.current.renderedFrames());
await wait(1200);
const introState = await page.evaluate(() => ({
  frames: window.__bj8.scene.current.renderedFrames(),
  backdropFilter: getComputedStyle(document.querySelector('.intro-backdrop')).backdropFilter,
  pixelRatio: window.__bj8.scene.current.renderer.getPixelRatio(),
}));
ok('首屏静止后 WebGL 停止空转', introState.frames - introStart <= 1,
  `1.2s 新增 ${introState.frames - introStart} 帧`);
ok('首屏不再对整幅 WebGL 画布做实时模糊', introState.backdropFilter === 'none',
  `backdrop-filter=${introState.backdropFilter}`);
ok('桌面 Retina 基线 DPR 上限生效', introState.pixelRatio === 1.75,
  `pixelRatio=${introState.pixelRatio}`);

await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')]
    .find(node => node.textContent?.trim() === '开始对局');
  button?.click();
});
await wait(700);

const candidates = await page.evaluate(() => {
  const rect = document.querySelector('.viewport').getBoundingClientRect();
  return [0.72, 0.78, 0.84, 0.9].map(fraction => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height * fraction,
  }));
});
for (const candidate of candidates) {
  await page.mouse.click(candidate.x, candidate.y);
  await wait(250);
  const phase = await page.evaluate(() => window.__bj8.match.current.phase);
  if (phase !== 'placing') break;
}
await page.waitForFunction(() => window.__bj8.match.current.phase === 'aiming', { timeout: 5000 });
await wait(700);

const shootPad = await page.evaluate(() => {
  const rect = document.querySelector('.shoot-pad').getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
await page.mouse.move(shootPad.x, shootPad.y);
await page.mouse.down();
await page.mouse.move(shootPad.x, shootPad.y + 120, { steps: 8 });
await page.mouse.up();
await wait(350);
const movingStart = await page.evaluate(() => window.__bj8.scene.current.renderedFrames());
await wait(2200);
const movingState = await page.evaluate(() => ({
  frames: window.__bj8.scene.current.renderedFrames(),
  thermal: window.__bj8.scene.current.thermalSnapshot(),
}));
const movingFrames = movingState.frames - movingStart;
ok('桌面运动渲染不再跟随 120/144Hz 屏幕空跑', movingFrames <= 75,
  `2.2s 渲染 ${movingFrames} 帧`);
ok('GPU 发热代理指标可读',
  ['none', 'gpu-timer', 'cpu-fallback'].includes(movingState.thermal.source)
    && Number.isFinite(movingState.thermal.estimatedGpuDuty),
  JSON.stringify(movingState.thermal));

const thermalCss = await page.evaluate(() => {
  document.documentElement.dataset.renderQuality = 'warm';
  const value = getComputedStyle(document.querySelector('.scoreboard')).backdropFilter;
  delete document.documentElement.dataset.renderQuality;
  return value;
});
ok('温控降档会关闭 HUD 毛玻璃 GPU 合成', thermalCss === 'none',
  `backdrop-filter=${thermalCss}`);
ok('浏览器运行无 JS 错误', errors.length === 0, errors[0] ?? '');

const mobilePage = await browser.newPage();
await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
await mobilePage.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await mobilePage.waitForFunction(() => window.__bj8?.scene?.current, { timeout: 10000 });
await wait(1500);
const mobileSharpness = await mobilePage.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const rect = scene.renderer.domElement.getBoundingClientRect();
  const gl = scene.renderer.getContext();
  return {
    devicePixelRatio: window.devicePixelRatio,
    pixelRatio: scene.renderer.getPixelRatio(),
    cssWidth: rect.width,
    drawingBufferWidth: gl.drawingBufferWidth,
  };
});
ok('手机高 DPR 首屏使用 2× 绘制缓冲区',
  mobileSharpness.devicePixelRatio === 3 &&
    mobileSharpness.pixelRatio === 2 &&
    Math.abs(mobileSharpness.drawingBufferWidth - mobileSharpness.cssWidth * 2) <= 2,
  JSON.stringify(mobileSharpness));

await mobilePage.close();
await page.close();
} finally {
  await browser?.close().catch(() => {});
}

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
