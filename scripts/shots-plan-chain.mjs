/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 生成桌面/竖屏走位整链提示条视觉证据
[POS]: 走位规划视觉回归取证脚本，不参与运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 走位规划提示条目检截图：固定三球局面 → 打开提示条（整链桌上直绘）→ 截图。
 * 前置同 verify-position-plan.mjs（vite:5199 + ego lite:9333）。
 * 桌面输出 shots/40-plan-on-table.png（verify 脚本也会覆盖此文件）；
 * PORTRAIT=1 时竖屏输出 shots/41-plan-on-table-portrait.png。
 */
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';
const PORTRAIT = process.env.PORTRAIT === '1';
const viewport = PORTRAIT ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const out = PORTRAIT ? 'shots/41-plan-on-table-portrait.png' : 'shots/40-plan-on-table.png';

const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: viewport });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });

const clickBtn = async (label) => page.evaluate((text) => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text));
  if (!btn) return false;
  const r = btn.getBoundingClientRect();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  return true;
}, label);

await clickBtn('开始对局');
await new Promise(r => setTimeout(r, 800));

// 开球流程适配：placing 阶段先点击开球区放置白球（网格扫描 screenToTable 找点）
if (await page.evaluate(() => !!document.querySelector('.viewport.placing'))) {
  const spot = await page.evaluate((vw) => {
    const scene = window.__bj8.scene.current;
    const headString = 2.54 * 0.25;
    for (let py = 60; py < vw.height - 60; py += 10) {
      for (let px = 30; px < vw.width - 30; px += 10) {
        const hit = scene.screenToTable(px, py);
        if (!hit || Math.abs(hit.x) >= 0.45 || hit.z <= headString + 0.05 || hit.z >= headString + 0.9) continue;
        // 落点必须真在台面画布上（竖屏下复盘卡片会盖住下半台，点歪了点击被卡片吃掉）
        const el = document.elementFromPoint(px, py);
        if (el && (el.tagName === 'CANVAS' || el.classList.contains('viewport'))) return { px, py };
      }
    }
    return null;
  }, viewport);
  console.log(`placing spot=${JSON.stringify(spot)}`);
  if (spot) {
    await page.mouse.move(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(spot.px, spot.py);
    await new Promise(r => setTimeout(r, 500));
  }
}

await page.evaluate(() => {
  const world = window.__bj8.world.current;
  const placements = [
    { n: 0, x: 0, z: 0.55 },
    { n: 1, x: 0.5, z: 0 },
    { n: 2, x: -0.5, z: 0 },
    { n: 3, x: 0.45, z: 1.05 },
  ];
  const map = new Map(placements.map(p => [p.n, p]));
  for (const b of world.balls) {
    const p = map.get(b.number);
    if (p) { b.active = true; b.x = p.x; b.z = p.z; }
    else { b.active = false; b.x = 0; b.z = 0; }
    b.vx = 0; b.vz = 0; b.wx = 0; b.wy = 0; b.wz = 0;
  }
  world.moving = false;
  world.events = [];
  world.firstContact = null;
  window.__bj8.sync();
});

await page.evaluate(() => new Promise((resolve) => {
  const deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    const btn = document.querySelector('.plan-button');
    if (btn && getComputedStyle(btn).visibility === 'visible' && btn.classList.contains('ready')) {
      clearInterval(timer); resolve();
    }
    if (Date.now() > deadline) { clearInterval(timer); resolve(); }
  }, 120);
}));

await clickBtn('💡 走位');
await new Promise(r => setTimeout(r, 900));

await page.screenshot({ path: out });
console.log(`saved ${out}`);
console.log(errors.length ? `pageerrors: ${errors.join('; ')}` : 'no page errors');
process.exit(0);
