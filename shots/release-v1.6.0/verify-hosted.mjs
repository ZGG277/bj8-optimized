// Real formal-entry acceptance. Reads the rendered iframe and public provenance;
// drives normal mouse/touch controls without development state or game mutation.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const url = 'https://lg22l37ytz.aiforce.cloud/app/app_17b18dh5axj';
const root = new URL('../../', import.meta.url);
const out = new URL('./', import.meta.url);
const expectedCommit = execFileSync('git', ['rev-parse', 'v1.6.0^{}'], {
  cwd: fileURLToPath(root), encoding: 'utf8',
}).trim();
const digest = value => createHash('sha256').update(value).digest('hex');
const expectedHtml = await readFile(new URL('dist/index.html', root));
const expectedHash = digest(expectedHtml);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanUrl = value => { const parsed = new URL(value); return parsed.origin + parsed.pathname; };
const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
  assert(pass, name);
};
const report = { url, startedAt: new Date().toISOString(), expectedCommit,
  sourceTag: 'v1.6.0', expectedHash, loginState: 'fresh browser contexts, no supplied cookies or login', results };
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
});
try {
  report.browser = await browser.version();
  for (const viewport of [
    { width: 1280, height: 800, deviceScaleFactor: 1, name: 'desktop' },
    { width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true, name: 'mobile' },
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [], externalGlbs = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => {
      if (/^https?:.*\.glb(?:[?#]|$)/.test(request.url())) externalGlbs.push(cleanUrl(request.url()));
    });
    try {
      await page.setViewport(viewport);
      const gameResponsePromise = page.waitForResponse(response =>
        /^https?:/.test(response.url()) && new URL(response.url()).pathname.endsWith('/game/index.html'),
      { timeout: 60000 });
      // Attach the rejection handler immediately if the outer navigation fails.
      gameResponsePromise.catch(() => {});
      const entry = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      const iframe = await page.waitForSelector('iframe[title="瓜瓜台球"]', { timeout: 30000 });
      const frame = await iframe.contentFrame();
      assert(frame, 'game iframe attached');
      const gameResponse = await gameResponsePromise;
      const served = await gameResponse.buffer();
      check(`${viewport.name} 正式入口与游戏 iframe 可用`, entry.status() === 200 && gameResponse.status() === 200,
        { entry: cleanUrl(page.url()), game: cleanUrl(frame.url()), viewport });
      check(`${viewport.name} 线上 HTML 与发布构建逐字节一致`, served.equals(expectedHtml),
        { sha256: digest(served), bytes: served.length });
      const provenance = await frame.evaluate(async () => {
        const response = await fetch(new URL('BUILD_PROVENANCE.json', location.href), { cache: 'no-store' });
        if (!response.ok) throw new Error('provenance HTTP ' + response.status);
        return response.json();
      });
      check(`${viewport.name} 线上来源提交与标签一致`, provenance.sourceCommit === expectedCommit
        && provenance.sourceTag === 'v1.6.0' && provenance.artifactSha256 === expectedHash, provenance);
      await frame.waitForSelector('.start-btn');
      check(`${viewport.name} 介绍页尚未创建 WebGL`, !(await frame.$('.viewport canvas')));
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-intro.png`, out)) });
      if (viewport.hasTouch) await (await frame.$('.start-btn')).tap();
      else await frame.click('.start-btn');
      await frame.waitForSelector('.viewport canvas');
      await frame.waitForFunction(() => document.querySelector('.shoot-pad')?.getAttribute('aria-disabled') === 'false');
      await wait(1600);
      const canvas = await frame.$('.viewport canvas');
      const size = await canvas.evaluate(node => ({ width: node.width, height: node.height }));
      check(`${viewport.name} 开始对局后球桌与控件就绪`, size.width > 0 && size.height > 0, size);
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-table.png`, out)) });
      await frame.focus('.view-slider-track');
      await page.keyboard.press('Home');
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');
      await page.mouse.move(4, 45);
      await wait(1400);
      check(`${viewport.name} 实际视角控件进入低机位`,
        Number(await frame.$eval('.view-slider-track', node => node.getAttribute('aria-valuenow'))) === 15);
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-low.png`, out)) });
      const before = digest(await canvas.screenshot());
      const pad = await frame.$('.shoot-pad');
      const rect = await pad.boundingBox();
      const vertical = await pad.evaluate(node => node.classList.contains('is-vertical'));
      const x = rect.x + (vertical ? rect.width / 2 : Math.min(20, rect.width / 3));
      const y = rect.y + (vertical ? Math.min(20, rect.height / 3) : rect.height / 2);
      const endX = vertical ? x : Math.min(viewport.width - 2, x + 105);
      const endY = vertical ? Math.min(viewport.height - 2, y + 105) : y;
      if (viewport.hasTouch) await page.touchscreen.touchStart(x, y);
      else { await page.mouse.move(x, y); await page.mouse.down(); }
      for (let i = 1; i <= 8; i++) {
        const px = x + (endX - x) * i / 8, py = y + (endY - y) * i / 8;
        if (viewport.hasTouch) await page.touchscreen.touchMove(px, py);
        else await page.mouse.move(px, py);
      }
      const power = await frame.$eval('[aria-label="出杆力度"]', node => Number(node.getAttribute('aria-valuenow')));
      check(`${viewport.name} ${viewport.hasTouch ? '真实触摸' : '鼠标'}拖动正常蓄力`, power > 0, { power });
      if (viewport.hasTouch) await page.touchscreen.touchEnd(); else await page.mouse.up();
      await frame.waitForFunction(() => document.querySelector('.shoot-pad')?.getAttribute('aria-disabled') === 'true', { timeout: 4000 });
      await wait(700);
      check(`${viewport.name} 松开后进入击球运动画面`, digest(await canvas.screenshot()) !== before);
      await page.screenshot({ path: fileURLToPath(new URL(`${viewport.name}-shot.png`, out)) });
      check(`${viewport.name} 无 JS 错误、外部模型依赖或横向溢出`, errors.length === 0 && externalGlbs.length === 0
        && await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
        && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { errors, externalGlbs });
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.passed = results.length === 18 && results.every(result => result.pass);
  await writeFile(new URL('hosted-verification.json', out), JSON.stringify(report, null, 2) + '\n');
}
