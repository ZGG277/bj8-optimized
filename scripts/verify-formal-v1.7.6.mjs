/*
[INPUT]: 已完成的妙搭 release、正式父页面与 v1.7.6 固定包装/产物指纹
[OUTPUT]: 正式父页面、CDN、局前选择、湖面/云海开场和真实出杆的双视口证据
[POS]: v1.7.6 发布后真实入口门禁；不提交留言或写生产数据
*/
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const formalUrl = process.env.FORMAL_URL ||
  'https://lg22l37ytz.feishuapp.com/app/app_17b18dh5axj';
const expectedWrapperCommit = 'cfc981608455c23c185935cd50b36f252e0c1f7a';
const expectedGameSha256 = '47850367fc65984b955a3fda29346f26ede70fdc9a9fd2fa86dd552b5795e7eb';
const expectedGameBytes = 9_568_828;
const outRoot = resolve(process.env.FORMAL_OUT || 'shots/release-v1.7.6/formal-final');
const viewports = [
  { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

await mkdir(outRoot, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const report = { formalUrl, expectedWrapperCommit, expectedGameSha256, checks: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail });
  assert(pass, `${name}: ${JSON.stringify(detail)}`);
};
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));

async function openEntry(viewport, world) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewport(viewport);
  const url = world ? `${formalUrl}?world=${world}` : formalUrl;
  let response;
  let frame;
  let iframeSrc;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const iframe = await page.waitForSelector('iframe', { timeout: 30_000 });
      iframeSrc = await iframe.evaluate(element => element.src);
      for (let frameAttempt = 1; frameAttempt <= 60; frameAttempt += 1) {
        frame = page.frames().find(candidate => candidate.url().includes(`/${expectedWrapperCommit}/`));
        if (frame) break;
        await pause(500);
      }
      if (!frame) throw new Error(`新包装 iframe 未完成加载: ${iframeSrc}`);
      await frame.waitForSelector('.intro-backdrop', { timeout: 30_000 });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
      await page.goto('about:blank');
      await pause(500 * attempt);
    }
  }
  if (!frame || !iframeSrc) throw lastError ?? new Error(`正式入口缺少可访问的游戏 iframe: ${url}`);
  return { page, frame, response, errors, iframeSrc };
}

async function introState(frame) {
  return frame.evaluate(() => ({
    selected: document.querySelector('.world-choice input:checked')?.value ?? null,
    canvasCount: document.querySelectorAll('.viewport canvas').length,
    openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}

try {
  let cdnChecked = false;
  for (const viewport of viewports) {
    const studio = await openEntry(viewport, null);
    check(`${viewport.name} 正式父页面与新包装`,
      studio.response?.status() === 200 &&
        studio.iframeSrc.includes(`/app_17b18dh5axj/${expectedWrapperCommit}/`) &&
        !new URL(studio.iframeSrc).searchParams.has('world'),
      { status: studio.response?.status(), iframeSrc: studio.iframeSrc });
    if (!cdnChecked) {
      const cdnResponse = await fetch(studio.iframeSrc);
      const cdnBytes = Buffer.from(await cdnResponse.arrayBuffer());
      const cdnSha256 = createHash('sha256').update(cdnBytes).digest('hex');
      check('正式 CDN 与 v1.7.6 产物逐字节一致',
        cdnResponse.ok && cdnBytes.length === expectedGameBytes && cdnSha256 === expectedGameSha256,
        { status: cdnResponse.status, bytes: cdnBytes.length, sha256: cdnSha256 });
      cdnChecked = true;
    }
    const studioIntro = await introState(studio.frame);
    check(`${viewport.name} 无参数入口保留局前选择`,
      studioIntro.selected === 'studio' && studioIntro.canvasCount === 0 &&
        studioIntro.openingStatus === null && !studioIntro.overflow,
      studioIntro);
    await studio.frame.click('.mode-choice.practice .mode-start');
    await studio.frame.waitForSelector('.viewport canvas', { timeout: 30_000 });
    await pause(250);
    const studioStarted = await studio.frame.evaluate(() => ({
      openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
      caption: document.querySelector('.opening-demo-caption')?.textContent ?? null,
      shootDisabled: document.querySelector('.shoot-pad')?.getAttribute('aria-disabled'),
    }));
    check(`${viewport.name} 摄影棚开始时不开场`,
      studioStarted.openingStatus === null && studioStarted.caption === null &&
        studioStarted.shootDisabled === 'false',
      studioStarted);
    check(`${viewport.name} 摄影棚正式流程无脚本错误`, studio.errors.length === 0, studio.errors);
    await studio.page.close();

    for (const world of ['cloud-sea', 'lake']) {
      const entry = await openEntry(viewport, world);
      const intro = await introState(entry.frame);
      check(`${viewport.name}/${world} 参数只预选`,
        entry.iframeSrc.includes(`/app_17b18dh5axj/${expectedWrapperCommit}/`) &&
          new URL(entry.iframeSrc).searchParams.get('world') === world &&
          intro.selected === world && intro.canvasCount === 0 && intro.openingStatus === null,
        { iframeSrc: entry.iframeSrc, intro });
      await entry.frame.click('.mode-choice.practice .mode-start');
      await entry.frame.waitForSelector('.viewport canvas', { timeout: 30_000 });
      await entry.frame.waitForFunction(
        () => document.querySelector('.game-shell')?.dataset.openingDemo === 'playing',
        { timeout: 30_000 },
      );
      const expectedCaption = world === 'cloud-sea' ? '穿过云海' : '向湖心靠近';
      const playing = await entry.frame.evaluate(() => ({
        openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
        caption: document.querySelector('.opening-demo-caption span')?.textContent ?? null,
        canvasCount: document.querySelectorAll('.viewport canvas').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      check(`${viewport.name}/${world} 点击开始后播放对应开场`,
        playing.openingStatus === 'playing' && playing.caption === expectedCaption &&
          playing.canvasCount === 1 && !playing.overflow,
        playing);
      await entry.frame.waitForFunction(
        () => document.querySelector('.game-shell')?.dataset.openingDemo === 'done',
        { timeout: 15_000 },
      );
      const done = await entry.frame.evaluate(() => ({
        openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
        replayVisible: Boolean(document.querySelector('.opening-demo-ui.done button')),
        shootDisabled: document.querySelector('.shoot-pad')?.getAttribute('aria-disabled'),
      }));
      check(`${viewport.name}/${world} 开场完成并交回操作`,
        done.openingStatus === 'done' && done.replayVisible && done.shootDisabled === 'false',
        done);
      if (world === 'cloud-sea') {
        await entry.page.screenshot({ path: resolve(outRoot, `${viewport.name}-cloud-first-person.png`) });
        const shoot = await entry.frame.$('.shoot-pad');
        assert(shoot, '正式云海入口缺少出杆控件');
        await shoot.focus();
        await entry.page.keyboard.press('Enter');
        await entry.frame.waitForFunction(
          () => document.querySelector('.shoot-pad')?.getAttribute('aria-disabled') === 'true',
          { timeout: 4_000 },
        );
        const afterShot = await entry.frame.evaluate(() => ({
          openingStatus: document.querySelector('.game-shell')?.dataset.openingDemo ?? null,
          shootDisabled: document.querySelector('.shoot-pad')?.getAttribute('aria-disabled'),
        }));
        check(`${viewport.name} 云海交接后真实轻杆可提交`,
          afterShot.openingStatus === 'done' && afterShot.shootDisabled === 'true',
          afterShot);
      }
      check(`${viewport.name}/${world} 正式流程无脚本错误`, entry.errors.length === 0, entry.errors);
      await entry.page.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(resolve(outRoot, 'browser-evidence.json'), JSON.stringify(report, null, 2) + '\n');
}

console.log(JSON.stringify({
  passed: report.checks.every(item => item.pass),
  checks: report.checks.length,
  outRoot,
}, null, 2));
