/*
[INPUT]: 依赖已启动游戏页、远程调试浏览器与 puppeteer-core
[OUTPUT]: 桌面产品顶栏删除、长行程视角推杆、右侧四控件同宽与球桌避让的布局断言及截图
[POS]: 1280×800 桌面零浪费 HUD 的浏览器出口验收门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const SHOT_DIR = process.env.SHOT_DIR || 'shots';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('bj8-control-y:')) localStorage.removeItem(key);
  }
});
await page.reload({ waitUntil: 'networkidle0' });

const start = await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')]
    .find(node => node.textContent?.trim() === '开始对局');
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
});
if (!start) throw new Error('开始对局按钮不存在');
await page.mouse.click(start.x, start.y);
await new Promise(resolve => setTimeout(resolve, 700));

const layout = await page.evaluate(() => {
  const readRect = selector => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      right: rect.right, bottom: rect.bottom,
    };
  };
  const text = document.body.innerText;
  return {
    topbarCount: document.querySelectorAll('.topbar').length,
    scoreboard: readRect('.scoreboard'),
    viewport: readRect('.viewport'),
    rail: readRect('.control-rail'),
    view: readRect('.view-switcher'),
    viewTrack: readRect('.view-slider-track'),
    viewThumb: readRect('.view-slider-thumb'),
    viewValue: document.querySelector('.view-slider-track')?.getAttribute('aria-valuetext'),
    shoot: readRect('.shoot-pad'),
    slots: [...document.querySelectorAll('.control-slot')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-control-slot'),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        right: rect.right,
        bottom: rect.bottom,
      };
    }),
    bulb: readRect('.plan-button'),
    gripCount: document.querySelectorAll('.control-slot-grip').length,
    powerNumberCount: document.querySelectorAll('.power-num').length,
    removedTextPresent: ['PLAYER', 'SPARRING', 'PHYSICS WORLD', '合法目标', '拖拽调整方向', '你的回合', '第 1 杆']
      .filter(label => text.includes(label)),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

ok('桌面产品/回合/杆数顶栏从 DOM 完全删除', layout.topbarCount === 0, `count=${layout.topbarCount}`);
ok('桌面比分栏成为第一行且保持 48px', layout.scoreboard?.y === 0 && layout.scoreboard?.height === 48,
  JSON.stringify(layout.scoreboard));
ok('桌面装饰性说明文案已移除', layout.removedTextPresent.length === 0, layout.removedTextPresent.join(','));
ok('右侧恰好四个独立控件槽位', layout.slots.length === 4, JSON.stringify(layout.slots));
ok('视角切换改为与出杆区等长的竖向推杆',
  layout.viewTrack?.height >= 150 && Math.abs(layout.view?.height - layout.shoot?.height) <= 1,
  JSON.stringify({ view: layout.view, track: layout.viewTrack, shoot: layout.shoot }));
ok('开局俯视时推杆吸附在顶端',
  layout.viewValue === '俯视' && layout.viewThumb?.y <= layout.viewTrack?.y + 2,
  JSON.stringify({ value: layout.viewValue, track: layout.viewTrack, thumb: layout.viewThumb }));
ok('灯泡在非瞄准阶段仍保持可见', layout.bulb?.width === 54 && layout.bulb?.height === 48,
  JSON.stringify(layout.bulb));
ok('四个控件不再各自具有拖动把手', layout.gripCount === 0, `grips=${layout.gripCount}`);
ok('四个控件宽度统一为 54px', layout.slots.every(slot => slot.width === 54), JSON.stringify(layout.slots));
ok('四个控件全部位于黑色控制轨内部', layout.slots.every(slot =>
  slot.x >= layout.rail.x && slot.y >= layout.rail.y
    && slot.right <= layout.rail.right && slot.bottom <= layout.rail.bottom),
  JSON.stringify({ rail: layout.rail, slots: layout.slots }));
ok('开球控件不显示力度数字', layout.powerNumberCount === 0, `numbers=${layout.powerNumberCount}`);
ok('球桌为右侧控件预留空间', layout.viewport?.right <= layout.rail?.x - 4,
  `${layout.viewport?.right}/${layout.rail?.x}`);
ok('桌面 HUD 不产生横向溢出', !layout.horizontalOverflow);
ok('桌面页面无 JS 错误', errors.length === 0, errors[0] ?? '');

await page.screenshot({ path: `${SHOT_DIR}/desktop-compact-current.png` });
await page.close();
await browser.disconnect();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length > 0) process.exitCode = 1;
