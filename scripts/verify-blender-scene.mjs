/*
[INPUT]: 当前主树 GAME_URL、Chrome 与 Blender GLB 场景适配器
[OUTPUT]: 桌面/手机真实旅程、资产加载/回退/卸载、无外链生产入口截图与 JSON 证据
[POS]: 第一版 Blender 场景的真实浏览器验收；页面串行执行且 finally 关闭浏览器
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const url = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const production = process.env.PRODUCTION === '1';
const out = new URL('../shots/scene-blender-v1/', import.meta.url);
const prefix = production ? 'production' : 'dev';
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
  assert(pass, name);
};
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
});
try {
  for (const size of [{ width: 1280, height: 800, deviceScaleFactor: 1, name: 'desktop' },
    { width: 390, height: 844, deviceScaleFactor: 2, name: 'mobile' }]) {
    const page = await browser.newPage();
    try {
      const errors = [], assets = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('request', req => { if (req.url().includes('.glb') && req.resourceType() !== 'script') assets.push(req.url()); });
      await page.setViewport(size);
      const response = await page.goto(url, { waitUntil: 'networkidle0' });
      if (production) {
        const served = createHash('sha256').update(await response.buffer()).digest('hex');
        const built = createHash('sha256').update(await readFile(new URL('../dist/index.html', import.meta.url))).digest('hex');
        check(size.name + ' 服务字节与生产构建一致', served === built, { sha256: served });
      }
      check(size.name + ' 介绍页无 WebGL/资产加载', await page.$('.viewport canvas') === null && assets.length === 0);
      await page.click('.start-btn');
      await page.waitForSelector('.viewport canvas');
      if (!production) await page.waitForFunction(() => !!window.__bj8.scene.current.scene.getObjectByName('blender-room-v1'));
      await wait(1700);
      await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-${size.name}.png`, out)) });
      if (!production) {
        const state = await page.evaluate(() => {
          const s = window.__bj8.scene.current;
          const model = s.scene.getObjectByName('blender-room-v1');
          let meshes = 0;
          model.traverse(o => { if (o.isMesh) meshes++; });
          return { meshes, frame: s.renderedFrames(), calls: s.renderer.info.render.calls,
            triangles: s.renderer.info.render.triangles, pixelRatio: s.renderer.getPixelRatio(),
            fallbackVisible: s.scene.getObjectByName('studio-fallback').visible,
            lampVisible: model.getObjectByName('BJ8_Pendant').visible };
        });
        check(size.name + ' 实际 GLB 已装配且俯视无灯具遮挡', state.meshes === 17 && !state.fallbackVisible && !state.lampVisible, state);
        await wait(1100);
        check(size.name + ' 空闲停止渲染', await page.evaluate(() => window.__bj8.scene.current.renderedFrames()) - state.frame <= 1);
      }
      // 使用真正的视角控件进入低机位，验证主入口和输入映射。
      await page.focus('.view-slider-track');
      await page.keyboard.press('Home');
      for (let i=0; i<3; i++) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');
      await page.mouse.move(8, 50);
      await wait(1400);
      check(size.name + ' 真实视角推杆可用', Number(await page.$eval('.view-slider-track', n => n.getAttribute('aria-valuenow'))) === 15);
      await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-${size.name}-low.png`, out)) });
      if (!production) {
        const startShot = await page.evaluate(() => window.__bj8.world.current.shot);
        const rect = await page.$eval('.shoot-pad', n => {const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
        await page.mouse.move(rect.x, rect.y); await page.mouse.down();
        await page.mouse.move(rect.x, rect.y+100, { steps: 8 }); await page.mouse.up();
        await page.waitForFunction(start => window.__bj8.world.current.shot > start, {}, startShot);
        await wait(450);
        const shot = await page.evaluate(() => ({ moving: window.__bj8.world.current.moving, shot: window.__bj8.world.current.shot }));
        check(size.name + ' 真实出杆触发物理', shot.moving && shot.shot === startShot+1, shot);
        await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-${size.name}-shot.png`, out)) });
      } else {
        check(size.name + ' 生产入口无需外部 GLB', assets.length === 0);
      }
      check(size.name + ' 无页面错误', errors.length === 0, errors);
    } finally { await page.close(); }
  }

  if (!production) {
    // 资源失败时仍保留可玩台面与基础环境。
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 390, height: 844 });
      await page.setCacheEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', req => req.url().includes('.glb') && req.resourceType() !== 'script' ? req.abort() : req.continue());
      const response = await page.goto(url, { waitUntil: 'networkidle0' });
      if (production) {
        const served = createHash('sha256').update(await response.buffer()).digest('hex');
        const built = createHash('sha256').update(await readFile(new URL('../dist/index.html', import.meta.url))).digest('hex');
        check(size.name + ' 服务字节与生产构建一致', served === built, { sha256: served });
      }
      await page.click('.start-btn');
      await page.waitForFunction(() => window.__bj8?.scene?.current?.scene.getObjectByName('studio-environment')?.userData.assetState === 'fallback');
      check('加载失败保留基础场景', await page.evaluate(() => {
        const s=window.__bj8.scene.current;
        return s.scene.getObjectByName('studio-fallback').visible && !!s.scene.getObjectByName('table-cloth') && !!document.querySelector('.viewport canvas');
      }));
      const p=await page.$eval('.shoot-pad',n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+90,{steps:6});await page.mouse.up();
      await page.waitForFunction(()=>window.__bj8.world.current.shot===1);
      check('加载失败后仍可真实出杆',true);
    } finally { await page.close(); }

    // 精确制造“卸载先于加载完成”，确认异步结果不会挂回旧场景。
    const cancelled = await browser.newPage();
    try {
      await cancelled.setCacheEnabled(false);
      await cancelled.setRequestInterception(true);
      cancelled.on('request', req => {
        if(req.url().includes('.glb') && req.resourceType() !== 'script') setTimeout(()=>req.continue().catch(()=>{}),800);
        else req.continue();
      });
      await cancelled.goto(url, {waitUntil:'networkidle0'});
      await cancelled.click('.start-btn');
      await cancelled.waitForFunction(()=>!!window.__bj8?.scene?.current);
      const state=await cancelled.evaluate(async()=>{
        const s=window.__bj8.scene.current;
        const environment=s.studioEnvironment;
        s.dispose();
        const ready=await environment.ready;
        return {ready, detached:!document.querySelector('.viewport canvas'), attached:!!s.scene.getObjectByName('blender-room-v1')};
      });
      check('卸载后到达的资产被回收',!state.ready && state.detached && !state.attached,state);
    } finally { await cancelled.close(); }
  }
} finally {
  await browser.close();
  await writeFile(new URL(`${prefix}-verification.json`,out),JSON.stringify({url,production,results},null,2)+'\n');
}
