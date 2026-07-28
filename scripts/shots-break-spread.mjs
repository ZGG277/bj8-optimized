/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 生成 shots/42-break-spread.png 并输出开球 spread/落袋数据
[POS]: 开球散开视觉回归取证脚本，不参与运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 开球散开目检截图：真实输入完成 placing → 瞄球堆满力开球 → 停球后俯视截图。
 * 输出 shots/42-break-spread.png
 * 前置:
 *   npx vite --port 5199 --strictPort &
 *   "/Applications/ego lite.app/Contents/MacOS/ego lite" --headless=new \
 *     --remote-debugging-port=9333 --user-data-dir=/tmp/ego-verify &
 */
import puppeteer from 'puppeteer-core';

const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });

// 开始对局
const box = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!box) throw new Error('开始对局按钮未找到');
await page.mouse.click(box.x, box.y);
await new Promise(r => setTimeout(r, 800));

// placing：开球区放白球（elementFromPoint 必须命中 CANVAS，防遮罩吃点击）
const wasPlacing = await page.evaluate(() => !!document.querySelector('.viewport.placing'));
if (wasPlacing) {
  const spot = await page.evaluate(() => {
    const scene = window.__bj8.scene.current;
    const headString = 2.54 * 0.25;
    for (let py = 100; py < 780; py += 10) {
      for (let px = 200; px < 1100; px += 10) {
        const el = document.elementFromPoint(px, py);
        if (!el || (el.tagName !== 'CANVAS' && !el.classList?.contains('viewport'))) continue;
        const hit = scene.screenToTable(px, py);
        if (hit && Math.abs(hit.x) < 0.1 && hit.z > headString + 0.05 && hit.z < headString + 0.6) {
          return { px, py };
        }
      }
    }
    return null;
  });
  if (!spot) throw new Error('开球区屏幕点未找到');
  await page.mouse.move(spot.px, spot.py);
  await new Promise(r => setTimeout(r, 200));
  await page.mouse.click(spot.px, spot.py);
  await new Promise(r => setTimeout(r, 800));
}

// 瞄球堆顶球（screenToTable 网格反查）
const aimPt = await page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const world = window.__bj8.world.current;
  const cue = world.balls.find(b => b.number === 0);
  const apex = world.balls.filter(b => b.number !== 0 && b.active).reduce((m, b) => (b.z > m.z ? b : m));
  const vp = document.querySelector('.viewport');
  const rect = vp.getBoundingClientRect();
  let best = null;
  for (let ix = 0; ix <= 48; ix++) for (let iy = 0; iy <= 32; iy++) {
    const cx = rect.left + (rect.width * ix) / 48, cy = rect.top + (rect.height * iy) / 32;
    const hit = scene.screenToTable(cx, cy);
    if (!hit) continue;
    const d = Math.hypot(hit.x - apex.x, hit.z - apex.z);
    if (!best || d < best.d) best = { d, cx, cy };
  }
  return { best, cue: { x: cue.x, z: cue.z }, apex: { x: apex.x, z: apex.z } };
});
if (!aimPt.best) throw new Error('顶球屏幕点未找到');
await page.mouse.move(aimPt.best.cx, aimPt.best.cy);
await page.mouse.down();
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const aimRead = await page.evaluate(() => window.__bj8.aim.current);

// 满力开球（shoot-pad 拖满）
const pad = await page.evaluate(() => {
  const el = document.querySelector('.shoot-pad');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
});
await page.mouse.move(pad.x, pad.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x, pad.y + i * 8);
await page.mouse.up();

// 等出杆 + 停球
const prevShot = await page.evaluate(() => window.__bj8.world.current.shot);
await page.waitForFunction((s) => window.__bj8.world.current.shot > s, { timeout: 8000 }, prevShot);
await page.waitForFunction(() => !window.__bj8.world.current.moving, { timeout: 60000 });
await new Promise(r => setTimeout(r, 600));

// 散开统计（页内计算，打印核对）
const stats = await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const objects = world.balls.filter(b => b.active && b.number !== 0);
  const cx = objects.reduce((s, b) => s + b.x, 0) / objects.length;
  const cz = objects.reduce((s, b) => s + b.z, 0) / objects.length;
  const spread = objects.reduce((s, b) => s + Math.hypot(b.x - cx, b.z - cz), 0) / objects.length;
  return { spread: spread.toFixed(3), active: objects.length, pocketed: 15 - objects.length };
});
console.log(`aim=${aimRead.toFixed(3)} 开球后: spread=${stats.spread} 台面剩 ${stats.active} 球 落袋 ${stats.pocketed}`);

// 切俯视截图（点视角切换按钮）
const switched = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-pressed') !== null && /俯视|top|视角/i.test(b.textContent + (b.title || '')));
  if (!btn) return false;
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  btn.click();
  return true;
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/42-break-spread.png' });
console.log(`截图 shots/42-break-spread.png（俯视切换${switched ? '成功' : '未找到按钮，以当前视角截'}）JS错误=${errors.length}`);
await page.close();
