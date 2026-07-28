/*
[INPUT]: 依赖已启动游戏页、ego lite 调试端口与 puppeteer-core
[OUTPUT]: 输出开球放置/瞄准阶段调试状态与页面错误
[POS]: 开球真实交互诊断脚本，不属于运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5199/';

const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.bringToFront();
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });

const errors = [];
page.on('pageerror', e => errors.push(String(e)));

async function readState() {
  return page.evaluate(() => ({
    phase: window.__bj8?.match?.current?.phase,
    label: document.querySelector('.match-state p')?.textContent,
    cue: window.__bj8?.world?.current?.balls?.[0] ? {
      x: window.__bj8.world.current.balls[0].x,
      z: window.__bj8.world.current.balls[0].z,
      active: window.__bj8.world.current.balls[0].active,
    } : null,
    viewMode: document.querySelector('.viewport')?.classList.contains('overhead') ? 'overhead' : 'first',
  }));
}

async function clickTable(fx, fy) {
  const pt = await page.evaluate((fx, fy) => {
    const r = document.querySelector('.viewport').getBoundingClientRect();
    return { x: r.x + r.width * fx, y: r.y + r.height * fy };
  }, fx, fy);
  console.log(`  click table fx=${fx} fy=${fy} => px=${Math.round(pt.x)} py=${Math.round(pt.y)}`);
  await page.mouse.click(pt.x, pt.y);
  await new Promise(r => setTimeout(r, 400));
}

console.log('initial state:', await readState());

// 点击开始对局
const startBtn = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === '开始对局');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (startBtn) {
  console.log('click 开始对局');
  await page.mouse.click(startBtn.x, startBtn.y);
  await new Promise(r => setTimeout(r, 800));
  console.log('after start:', await readState());
}

// 切俯视
const overheadBtn = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === '俯视');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (overheadBtn) {
  console.log('click 俯视');
  await page.mouse.click(overheadBtn.x, overheadBtn.y);
  await new Promise(r => setTimeout(r, 400));
  console.log('after overhead:', await readState());
}

// 尝试点击开球区不同位置
for (const fy of [0.15, 0.20, 0.25, 0.30, 0.35]) {
  await clickTable(0.5, fy);
  console.log('  state after click:', await readState());
}

// 直接调用 screenToTable 看映射结果
const mapping = await page.evaluate(() => {
  const scene = window.__bj8.scene.current;
  const rect = document.querySelector('.viewport').getBoundingClientRect();
  const pts = [];
  for (let fy = 0; fy <= 1; fy += 0.05) {
    pts.push({
      fx: 0.5,
      fy,
      px: rect.x + rect.width * 0.5,
      py: rect.y + rect.height * fy,
    });
  }
  return pts.map(p => ({ fy: p.fy, hit: scene.screenToTable(p.px, p.py) }));
});
console.log('screenToTable mapping (fy vs z):');
for (const m of mapping) {
  if (m.hit) console.log(`  fy=${m.fy.toFixed(2)} z=${m.hit.z.toFixed(3)}`);
}

// 检查 viewport 子元素是否遮挡点击
const hitTest = await page.evaluate(() => {
  const rect = document.querySelector('.viewport').getBoundingClientRect();
  const pts = [0.15, 0.20, 0.25, 0.30, 0.35].map(fy => ({
    fx: 0.5,
    fy,
    px: rect.x + rect.width * 0.5,
    py: rect.y + rect.height * fy,
    hit: document.elementFromPoint(rect.x + rect.width * 0.5, rect.y + rect.height * fy)?.className,
  }));
  return pts;
});
console.log('elementFromPoint:', hitTest);

console.log('errors:', errors);
await page.close();
await browser.disconnect();
