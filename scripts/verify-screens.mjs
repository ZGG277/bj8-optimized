/* 无头浏览器截图验证脚本 */
import puppeteer from 'puppeteer-core';

const shots = [
  { name: 'intro', wait: 2500, action: null },
  { name: 'playing-first', wait: 1500, action: 'start' },
  { name: 'overhead', wait: 1500, action: 'overhead' },
];

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9333',
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: 'shots/01-intro.png' });

// 开始游戏
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('开始对局'));
  btn?.click();
});
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: 'shots/02-first-person.png' });

// 开球：空格蓄力再松开
await page.keyboard.down('Space');
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: 'shots/03-charging.png' });
await page.keyboard.up('Space');
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/04-rolling.png' });
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: 'shots/05-after-break.png' });

// 俯视视角
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '俯视');
  btn?.click();
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'shots/06-overhead.png' });

console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)));
await page.close();
await browser.disconnect();
