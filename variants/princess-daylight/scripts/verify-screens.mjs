/*
[INPUT]: 依赖已启动游戏页、固定 ego lite 调试端口与 puppeteer-core
[OUTPUT]: 介绍页、第一人称与俯视等基准视觉截图
[POS]: 基础视觉回归取证脚本，不参与运行时
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';

const shots = [
  { name: 'intro', wait: 2500, action: null },
  { name: 'playing-first', wait: 1500, action: 'start' },
  { name: 'overhead', wait: 1500, action: 'overhead' },
];
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9333';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:5199/';

const browser = await puppeteer.connect({
  browserURL: BROWSER_URL,
  defaultViewport: { width: 1280, height: 800 },
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 20000 });
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
