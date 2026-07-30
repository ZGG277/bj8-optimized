/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 调色盘折叠入口、三主题白名单、URL/本地持久化及桌面/竖屏边界断言
[POS]: 视觉主题集成的浏览器回归门禁，不修改游戏数据与服务端状态
[PROTOCOL]: 变更时更新此头部，然后检查 README.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
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

const collapsed = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  palette: Boolean(document.querySelector('.theme-palette-button')),
  expanded: document.querySelector('.theme-palette-button')?.getAttribute('aria-expanded'),
  optionCount: document.querySelectorAll('[data-theme-option]').length,
}));
ok('主题选择默认藏在单个小调色盘中',
  collapsed.palette && collapsed.expanded === 'false' && collapsed.optionCount === 0,
  JSON.stringify(collapsed));

await page.click('.theme-palette-button');
const initial = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  labels: [...document.querySelectorAll('[data-theme-option]')]
    .map(node => node.textContent?.trim()),
  pressed: document.querySelector('[data-theme-option][aria-pressed="true"]')
    ?.getAttribute('data-theme-option'),
}));
ok('展开调色盘只显示三套方案', JSON.stringify(initial.labels) === JSON.stringify(expectedLabels),
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
  await page.click('.theme-palette-button');
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
  await page.click('.theme-palette-button');
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

const visualProfiles = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'portrait', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } },
  { name: 'landscape', viewport: { width: 844, height: 390, isMobile: true, hasTouch: true } },
];
for (const profile of visualProfiles) {
  await page.setViewport(profile.viewport);
  for (const theme of themes) {
    await page.goto(`${GAME_URL}?theme=${theme}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.evaluate(() => localStorage.removeItem('guagua-billiards:control-layout:v3'));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.click('.mode-choice.practice .mode-start');
    await new Promise(resolve => setTimeout(resolve, 650));
    if (await page.evaluate(() => window.__bj8?.match?.current?.phase === 'placing')) {
      const point = await page.evaluate(() => {
        const scene = window.__bj8.scene.current;
        const rect = document.querySelector('.viewport').getBoundingClientRect();
        for (let py = rect.top + 30; py < rect.bottom - 20; py += 16) {
          for (let px = rect.left + 24; px < rect.right - 70; px += 16) {
            const hit = scene.screenToTable(px, py);
            if (hit && Math.abs(hit.x) < 0.32 && hit.z > 0.78 && hit.z < 1.12) {
              return { x: px, y: py };
            }
          }
        }
        return null;
      });
      if (point) {
        await page.mouse.click(point.x, point.y);
        await new Promise(resolve => setTimeout(resolve, 320));
      }
    }
    const visual = await page.evaluate(() => {
      const scoreboard = document.querySelector('.scoreboard')?.getBoundingClientRect();
      const slotElements = [...document.querySelectorAll('[data-control-slot]')];
      const slotRects = slotElements.map(element => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute('data-control-slot'),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      const slots = slotElements.map(element => element.getBoundingClientRect());
      const overlaps = slots.some((rect, index) =>
        slots.slice(index + 1).some(other =>
          rect.left < other.right && rect.right > other.left &&
          rect.top < other.bottom && rect.bottom > other.top));
      const childOverflow = slotElements.some(element => {
        const slot = element.getBoundingClientRect();
        const bodyElement = element.querySelector('.control-slot-body');
        const contentElement = bodyElement?.firstElementChild;
        const body = bodyElement?.getBoundingClientRect();
        const content = contentElement?.getBoundingClientRect();
        if (!body || !content) return true;
        return [body, content].some(rect =>
          rect.left < slot.left - 1 || rect.right > slot.right + 1 ||
          rect.top < slot.top - 1 || rect.bottom > slot.bottom + 1);
      });
      return {
        phase: window.__bj8?.match?.current?.phase,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        overflowY: document.documentElement.scrollHeight > innerHeight,
        slotCount: slots.length,
        slotRects,
        overlaps,
        childOverflow,
        safe: slots.every(rect =>
          rect.left >= 8 && rect.right <= innerWidth - 8 &&
          rect.top >= (scoreboard?.bottom ?? 0) && rect.bottom <= innerHeight - 8),
      };
    });
    ok(`${profile.name} ${theme} 对局控件完整落位`,
      visual.phase === 'aiming' && visual.slotCount === 5 &&
      visual.safe && !visual.overlaps && !visual.childOverflow &&
      !visual.overflowX && !visual.overflowY,
      JSON.stringify(visual));
    await page.screenshot({
      path: `${SHOT_DIR}/theme-${theme}-${profile.name}.png`,
    });
  }
}
ok('主题流程无页面脚本错误', errors.length === 0, errors[0] ?? '');

await page.close();
await browser.disconnect();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
