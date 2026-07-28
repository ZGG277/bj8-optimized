/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 竖屏击球点盘布局、桌面球杆造型断言及截图
[POS]: 移动端控件与球杆表现的浏览器视觉门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 移动端击球点盘布局与球杆造型截图验证
 * 场景 A: 竖屏手机 390×844 (touch)，断言击球点盘固定在左下且加大(≥80px宽)，截图
 * 场景 B: 桌面 1280×800 瞄准时截图，目检球杆锥形与皮头
 * 前置: npx vite --port 5199 & ego lite headless :9333
 */
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await puppeteer.connect({ browserURL: BROWSER_URL });

// 场景 A: 竖屏手机
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.tap('button.start-btn');
  await new Promise(r => setTimeout(r, 1800));

  const rect = await page.evaluate(() => {
    const el = document.querySelector('.spin-pad');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left, bottom: innerHeight - r.bottom, width: r.width, height: r.height, position: cs.position };
  });
  ok('竖屏: 击球点盘存在', !!rect);
  if (rect) {
    ok('竖屏: 击球点盘固定定位', rect.position === 'fixed', rect.position);
    ok('竖屏: 击球点盘贴左下', rect.left <= 20 && rect.bottom <= 20, `left=${rect.left.toFixed(0)} bottom=${rect.bottom.toFixed(0)}`);
    ok('竖屏: 击球点盘加大(≥80px)', rect.width >= 80, `w=${rect.width.toFixed(0)} h=${rect.height.toFixed(0)}`);
  }
  // 陪练卡不与击球点盘重叠(若存在)
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.spin-pad')?.getBoundingClientRect();
    const b = document.querySelector('.coach-card')?.getBoundingClientRect();
    if (!a || !b) return null;
    return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
  });
  if (overlap !== null) ok('竖屏: 陪练卡与击球点盘不重叠', !overlap);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  ok('竖屏: pointer:coarse 生效(微调步进 0.004)', coarse);
  await page.screenshot({ path: 'shots/36-mobile-spinpad.png' });
  ok('竖屏: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');
  await page.close();
}

// 场景 B: 桌面瞄准截图(球杆目检)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: 'shots/37-cue-tip.png' });
  ok('桌面: 页面无 JS 错误', errors.length === 0, errors[0] ?? '');
  await page.close();
}

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
