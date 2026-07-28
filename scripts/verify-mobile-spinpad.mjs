/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 竖屏击球点小预览/大弹层布局、桌面球杆造型断言及截图
[POS]: 移动端控件与球杆表现的浏览器视觉门禁
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 移动端击球点盘布局与球杆造型截图验证
 * 场景 A: 竖屏手机 390×844 (touch)，断言右侧小预览可展开为 ≥120px 大母球且不压出杆区
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
  if (await page.evaluate(() => window.__bj8?.match?.current?.phase === 'placing')) {
    const spots = await page.evaluate(() => {
      const r = document.querySelector('.viewport').getBoundingClientRect();
      return [0.74, 0.8, 0.86].map(f => ({ x: r.left + r.width / 2, y: r.top + r.height * f }));
    });
    for (const spot of spots) {
      await page.touchscreen.tap(spot.x, spot.y);
      await new Promise(r => setTimeout(r, 250));
      if (await page.evaluate(() => window.__bj8?.match?.current?.phase !== 'placing')) break;
    }
  }

  const rect = await page.evaluate(() => {
    const el = document.querySelector('.spin-preview');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, bottom: innerHeight - r.bottom, width: r.width, height: r.height };
  });
  ok('竖屏: 击球点小预览存在', !!rect);
  if (rect) {
    ok('竖屏: 小预览位于右侧控制轨', rect.left >= 320 && rect.right <= 390, `left=${rect.left.toFixed(0)} right=${rect.right.toFixed(0)}`);
    ok('竖屏: 小预览紧凑且可命中', rect.width >= 44 && rect.width <= 58 && rect.height >= 44, `w=${rect.width.toFixed(0)} h=${rect.height.toFixed(0)}`);
  }
  await page.tap('.spin-preview');
  await new Promise(r => setTimeout(r, 120));
  const expanded = await page.evaluate(() => {
    const ball = document.querySelector('.mobile-spin-pad .spin-ball')?.getBoundingClientRect();
    const popover = document.querySelector('.spin-popover')?.getBoundingClientRect();
    const shoot = document.querySelector('.shoot-pad')?.getBoundingClientRect();
    return ball && popover && shoot
      ? { size: ball.width, popoverRight: popover.right, shootLeft: shoot.left }
      : null;
  });
  ok('竖屏: 点击展开大母球(≥120px)', !!expanded && expanded.size >= 120, JSON.stringify(expanded));
  ok('竖屏: 大母球不覆盖出杆区', !!expanded && expanded.popoverRight <= expanded.shootLeft, JSON.stringify(expanded));
  ok('竖屏: 解说浮层已删除', !await page.$('.coach-card'));
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
