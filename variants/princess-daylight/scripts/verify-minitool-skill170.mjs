/** Local diagnostic only: no platform, Android or iOS acceptance claims. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const dir = 'artifacts/xhs-skill170-20261002';
const origin = 'http://127.0.0.1:5218';
const url = `${origin}/${dir}/dist/`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const report = { label: 'local diagnostic, not Mini Tool client acceptance', cases: [] };
try {
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith(origin) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  await page.setViewport({ width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true });
  // Every value is synthetic in a new isolated browser. No user storage is read or cleared.
  await page.evaluateOnNewDocument(() => {
    window.__cache = {};
    window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9462004 } }, miniTool: {
      getStorageInfo: async () => ({ keys: Object.keys(window.__cache) }),
      getStorage: async ({ key }) => ({ data: window.__cache[key] ?? null }),
      setStorage: async ({ key, data }) => { window.__cache[key] = data; },
    } };
    localStorage.setItem('guagua-billiards:aim-assist:v1', 'false');
    localStorage.setItem('guagua-billiards:completed-match:v1', 'done');
  });
  for (const world of ['studio', 'cloud-sea', 'lake']) {
    await page.goto(`${url}?world=${world}`, { waitUntil:'networkidle0' });
    await page.waitForSelector('.start-btn'); await page.click('.start-btn');
    await page.waitForSelector('canvas');
    await new Promise(r => setTimeout(r,1800));
    const state = await page.evaluate(() => ({
      alert: document.querySelector('[role=alert]')?.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
      canvas: [...document.querySelectorAll('canvas')].map(c => ({ w:c.width,h:c.height })),
      migrated: JSON.parse(window.__cache['guagua-billiards:aim-assist:v1']),
      original: localStorage.getItem('guagua-billiards:aim-assist:v1'),
      controls: document.querySelectorAll('[data-control-slot]').length,
      opacities: [...document.querySelectorAll('.control-slot-power .control-slot-body,.control-slot-spin .control-slot-body')].map(e => getComputedStyle(e).opacity),
    }));
    assert(!state.alert, state.alert); assert.equal(state.overflow,false); assert.equal(state.controls,5);
    assert.equal(state.migrated,'false'); assert.equal(state.original,'false'); assert(state.canvas.every(c => c.w*c.h <= 2000000));
    await page.screenshot({ path:`${dir}/${world}.png` }); report.cases.push({ world,...state });
  }
  // Observer-less runtime; viewport changes still rely on existing resize listeners.
  await page.evaluateOnNewDocument(() => { window.ResizeObserver = undefined; Array.prototype.flatMap = undefined; });
  await page.goto(url, { waitUntil:'networkidle0' }); await page.waitForSelector('.start-btn'); await page.click('.start-btn'); await page.waitForSelector('canvas');
  await page.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await new Promise(r => setTimeout(r,600));
  assert.equal(await page.$eval('html', e => e.scrollWidth > innerWidth),false);
  const dial=await page.$eval('.aim-dial',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,fine:e.classList.contains('fine')};});
  await page.touchscreen.tap(dial.x,dial.y);
  assert.notEqual(await page.$eval('.aim-dial',e=>e.classList.contains('fine')),dial.fine);
  await page.focus('[data-control-slot="power"] [role="button"]'); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-control-slot="power"] [role="button"]')?.getAttribute('aria-disabled')==='true');
  report.cases.push({observerFallback:true,touchAim:true,shotStarted:true});
  await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', {cancelable:true})));
  await page.waitForSelector('[role=alert]');
  report.cases.push({contextLost:await page.$eval('[role=alert]',e=>e.textContent)});
  await page.evaluateOnNewDocument(() => { window.xhs.miniTool.getStorageInfo = async () => { throw Error('mock read failure'); }; });
  await page.goto(url,{waitUntil:'networkidle0'});
  assert.equal(await page.$('.start-btn'),null);
  assert((await page.$eval('#root',e=>e.textContent)).includes('为保护进度'));
  report.cases.push({nativeReadFailureBlocksDefaults:true});
  const unsupported = await browser.newPage();
  await unsupported.evaluateOnNewDocument(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : getContext.call(this, type, ...args); };
  });
  await unsupported.goto(url, {waitUntil:'networkidle0'}); await unsupported.waitForSelector('.start-btn'); await unsupported.click('.start-btn');
  await unsupported.waitForSelector('[role=alert]');
  report.cases.push({noWebglFallback:await unsupported.$eval('[role=alert]', e=>e.textContent)});
  await unsupported.close();
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  report.errors=errors; report.external=external;
} finally { await browser.close(); await writeFile(`${dir}/local-diagnostics.json`,JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report,null,2));
