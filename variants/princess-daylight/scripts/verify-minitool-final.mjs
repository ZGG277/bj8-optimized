/* Isolated browser acceptance, reuses the task-owned CSP preview server; no user browser state. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { storageUpgrade, layoutMatrix, shareScenarios } from './verify-minitool-upgrade.mjs';
const out = fileURLToPath(new URL(`../${process.env.MINITOOL_ACCEPTANCE_DIR || 'artifacts/xhs-optimization-20261002'}/`, import.meta.url));
const root = 'http://127.0.0.1:5218';
let browser;
const errors = [], external = [];
try {
  browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width:390, height:844, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  page.on('pageerror', error=>errors.push(String(error)));
  page.on('console', event=>{ if(event.type()==='error') errors.push(event.text()); });
  page.on('request', request=>{ const url=request.url(); if(!url.startsWith(root) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url); });
  const cdp = await page.createCDPSession();
  // The shared suite uses a tiny Page surface. Keep production fixtures identical across runners.
  const adapter = {
    cdp: (method, params)=>cdp.send(method, params),
    evaluate: (fn,arg)=>page.evaluate(fn,arg),
    goto: url=>page.goto(url,{waitUntil:'networkidle0'}),
    reload: ()=>page.reload({waitUntil:'networkidle0'}),
    waitForSelector: selector=>page.waitForSelector(selector),
    waitForFunction: (fn,arg,options)=>page.waitForFunction(fn,options,arg),
    click: async selector=>{
      if(selector.startsWith('text="')) {
        const label=selector.slice(6,-1);
        const handle=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text),label);
        const element=handle.asElement(); assert(element,`missing button ${label}`); await element.click(); await handle.dispose();
      } else await page.click(selector);
    },
  };
  const storage=await storageUpgrade(adapter);
  const layouts=await layoutMatrix(adapter);
  const sharing=await shareScenarios(adapter);
  console.log(JSON.stringify({storage,layouts,sharing}));
  const worlds=[];
  for (const world of ['studio','cloud-sea','lake']) {
    await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.goto(`${root}/dist-minitool/?world=${world}`,{waitUntil:'networkidle0'});
    await page.click('.start-btn');
    await page.waitForSelector('canvas');
    await page.click('button[aria-label="展开视角调整"]');
    await page.click('button[aria-label="切换俯视视角"]');
    await page.click('button[aria-label="展开视角调整"]');
    // Production intentionally has no debug hook; bounded render settling precedes visual inspection.
    await new Promise(resolve=>setTimeout(resolve,1600));
    const state=await page.evaluate(()=>({title:document.title,debug:!!window.__bj8,overflow:document.documentElement.scrollWidth>innerWidth,
      controls:document.querySelectorAll('[data-control-slot]').length,webgl:!!document.querySelector('canvas')?.getContext('webgl2'),
      skill:JSON.parse(localStorage.getItem('guagua-billiards:player-skill:v3'))}));
    assert.equal(state.debug,false); assert.equal(state.overflow,false); assert(state.webgl && state.controls===5);
    assert.equal(state.skill.level,61); assert.equal(state.skill.totalPlayerShots,321);
    await page.screenshot({path:`${out}production-${world}-390.png`});
    worlds.push({world,...state});
  }
  // Actual user entry: native touch toggles the dial; Enter starts a physical shot.
  const dial=await page.$eval('.aim-dial',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,fine:e.classList.contains('fine')};});
  await page.touchscreen.tap(dial.x,dial.y);
  assert.notEqual(await page.$eval('.aim-dial',e=>e.classList.contains('fine')),dial.fine);
  await page.focus('[data-control-slot="power"] [role="button"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-control-slot="power"] [role="button"]')?.getAttribute('aria-disabled')==='true', {timeout:5000});
  assert.deepEqual(external,[]); assert.deepEqual(errors,[]);
  const report={browser:await browser.version(),entry:`${root}/dist-minitool/`,storage,layouts,sharing,worlds,touchDial:true,shotStarted:true,errors,external,
    limitations:['Native XHS postNote uses a mock in the isolated acceptance fixture; no real note published.','Real XHS in-place upgrade still requires same app identity and client verification.']};
  await writeFile(`${out}final-browser-acceptance.json`,JSON.stringify(report,null,2));
  console.log('PASS: production worlds, touch input, shot, storage, geometry and share contract.');
} finally { await browser?.close(); }
