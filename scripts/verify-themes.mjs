/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 三主题白名单、按钮切换、URL/本地持久化及桌面/竖屏边界断言
[POS]: 视觉主题集成的浏览器回归门禁，不修改游戏数据与服务端状态
[PROTOCOL]: 变更时更新此头部，然后检查 README.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const themes = ['celadon', 'noir', 'neon'];
const expectedLabels = ['青瓷', '决赛之夜', '霓虹球房'];
const results = [];

const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${GAME_URL}?theme=celadon`, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => localStorage.removeItem('bj8-ui-theme'));
await page.reload({ waitUntil: 'networkidle0' });

const initial = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  labels: [...document.querySelectorAll('[data-theme-option]')]
    .map(node => node.textContent?.trim()),
  pressed: document.querySelector('[data-theme-option][aria-pressed="true"]')
    ?.getAttribute('data-theme-option'),
}));
ok('主题入口只显示三套方案', JSON.stringify(initial.labels) === JSON.stringify(expectedLabels),
  JSON.stringify(initial.labels));
ok('青瓷是默认且按钮状态同步', initial.theme === 'celadon' && initial.pressed === 'celadon',
  JSON.stringify(initial));

await page.click('[data-theme-option="noir"]');
const selected = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  stored: localStorage.getItem('bj8-ui-theme'),
  query: new URL(location.href).searchParams.get('theme'),
}));
ok('按钮即时应用并同时写入 URL 与本地存储',
  selected.theme === 'noir' && selected.stored === 'noir' && selected.query === 'noir',
  JSON.stringify(selected));

await page.reload({ waitUntil: 'networkidle0' });
const restored = await page.evaluate(() => document.documentElement.dataset.theme);
ok('刷新后保留用户选择', restored === 'noir', String(restored));

await page.goto(`${GAME_URL}?theme=neon`, { waitUntil: 'networkidle0', timeout: 20000 });
const urlOverride = await page.evaluate(() => document.documentElement.dataset.theme);
ok('有效 URL 参数覆盖旧本地选择', urlOverride === 'neon', String(urlOverride));

await page.goto(`${GAME_URL}?theme=frost`, { waitUntil: 'networkidle0', timeout: 20000 });
const rejected = await page.evaluate(() => document.documentElement.dataset.theme);
ok('已淘汰主题无法由 URL 重新启用', rejected === 'noir', String(rejected));

for (const theme of themes) {
  await page.goto(`${GAME_URL}?theme=${theme}`, { waitUntil: 'networkidle0', timeout: 20000 });
  const desktop = await page.evaluate(expected => {
    const switcher = document.querySelector('.theme-switcher')?.getBoundingClientRect();
    return {
      applied: document.documentElement.dataset.theme,
      inViewport: Boolean(switcher)
        && switcher.left >= 0 && switcher.top >= 0
        && switcher.right <= innerWidth && switcher.bottom <= innerHeight,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pressed: document.querySelector('[data-theme-option][aria-pressed="true"]')
        ?.getAttribute('data-theme-option') === expected,
    };
  }, theme);
  ok(`桌面 ${theme} 主题完整落位`, desktop.applied === theme && desktop.inViewport
    && !desktop.overflow && desktop.pressed, JSON.stringify(desktop));
}

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
for (const theme of themes) {
  await page.goto(`${GAME_URL}?theme=${theme}`, { waitUntil: 'networkidle0', timeout: 20000 });
  const mobile = await page.evaluate(expected => {
    const switcher = document.querySelector('.theme-switcher')?.getBoundingClientRect();
    return {
      applied: document.documentElement.dataset.theme,
      inViewport: Boolean(switcher)
        && switcher.left >= 0 && switcher.top >= 0
        && switcher.right <= innerWidth && switcher.bottom <= innerHeight,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      buttonCount: document.querySelectorAll('[data-theme-option]').length,
      pressed: document.querySelector('[data-theme-option][aria-pressed="true"]')
        ?.getAttribute('data-theme-option') === expected,
    };
  }, theme);
  ok(`竖屏 ${theme} 主题入口无越界`, mobile.applied === theme && mobile.inViewport
    && !mobile.overflow && mobile.buttonCount === 3 && mobile.pressed, JSON.stringify(mobile));
}

await page.goto(`${GAME_URL}?theme=celadon`, { waitUntil: 'networkidle0', timeout: 20000 });
const startButton = await page.$('.mode-choice.practice .mode-start');
if (startButton) {
  await startButton.click();
  await new Promise(resolve => setTimeout(resolve, 800));
}
const afterStart = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  switcherVisible: Boolean(document.querySelector('.theme-switcher')),
  gameVisible: Boolean(document.querySelector('.game-shell')),
}));
ok('进入对局后主题与入口继续保留',
  afterStart.theme === 'celadon' && afterStart.switcherVisible && afterStart.gameVisible,
  JSON.stringify(afterStart));
ok('主题流程无页面脚本错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
