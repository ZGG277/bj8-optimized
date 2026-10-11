import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root='http://127.0.0.1:5218';
const out='artifacts/xhs-controls-ui3-20261002';
const completedKey='guagua-billiards:completed-match:v1';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
const makePage=async context=>{const p=await context.newPage();await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(String(e)));return p;};
const noTip=async p=>assert.equal(await p.$('.control-onboarding-tip'),null);
const suppressed=async p=>{
 for(const selector of ['.aim-dial','.spin-preview','.shoot-pad']) {await p.hover(selector);await noTip(p);}
 for(const selector of ['.aim-dial','.spin-preview']) {
  const r=await p.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await p.touchscreen.tap(r.x,r.y);await noTip(p);
 }
 await p.click('.spin-preview');
 await p.focus('.shoot-pad');await p.keyboard.press('Tab');await noTip(p);
};
try {
 for(const winner of ['player','opponent']) {
  const context=await browser.createBrowserContext();const page=await makePage(context);
  await page.goto(`${root}/${out}/preview/`,{waitUntil:'networkidle0'});
  await page.click('.start-btn');await page.waitForFunction(()=>!!window.__bj8);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),completedKey),null);
  await page.hover('.shoot-pad');await page.waitForSelector('[data-tip-for="shoot"]');
  // Ending-state fixture exercises the real Game effect; no claim of playing a full physical match.
  await page.evaluate(w=>window.__bj8.setMatch({phase:'finished',winner:w}),winner);
  await page.waitForFunction(key=>localStorage.getItem(key)==='done',{},completedKey);
  await page.click('.replay-btn').catch(async()=>{
   const button=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='再来一局'));
   await button.asElement().click();await button.dispose();
  });
  await page.waitForSelector('.aim-dial');await suppressed(page);
  assert.equal(await page.$('.first-match-guide'),null);
  await page.reload({waitUntil:'networkidle0'});await page.click('.start-btn');await suppressed(page);
  await context.close();
 }
 // Previously completed match from the original package: preserve every original key/value.
 const context=await browser.createBrowserContext();const page=await makePage(context);
 const {values}=JSON.parse(await readFile('artifacts/xhs-optimization-20261002/storage-fixture.json','utf8'));
 await page.goto(`${root}/dist-minitool/`,{waitUntil:'networkidle0'});
 await page.evaluate(values=>{for(const [k,v] of Object.entries(values))localStorage.setItem(k,v)},values);
 await page.reload({waitUntil:'networkidle0'});await page.click('.start-btn');
 const stored=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
 for(const [key,value] of Object.entries(values))assert.equal(stored[key],value,key);
 assert.equal(stored[completedKey],'done');
 await suppressed(page);
 await page.click('[aria-label="展开视角调整"]');await page.click('[aria-label="切换俯视视角"]');await page.click('[aria-label="展开视角调整"]');
 await page.mouse.move(5,50);await new Promise(r=>setTimeout(r,1200));
 const controls=await page.evaluate(()=>['power','spin'].map(id=>{const e=document.querySelector(`[data-control-slot="${id}"]`);return {id,width:e.querySelector(id==='power'?'.shoot-pad':'.spin-preview').getBoundingClientRect().width,opacity:getComputedStyle(e.firstElementChild).opacity}}));
 for(const c of controls){assert.equal(c.width,48);assert.equal(c.opacity,'0.44');}
 assert.equal(await page.evaluate(()=>!!window.__bj8),false);
 await page.screenshot({path:`${out}/production-390.png`});
 await page.setViewport({width:844,height:390,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await page.mouse.move(5,50);await new Promise(r=>setTimeout(r,1200));
 await page.screenshot({path:`${out}/production-landscape.png`});
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/acceptance.json`,JSON.stringify({entry:`${root}/dist-minitool/`,browser:await browser.version(),controls,wonAndLostFixtures:true,afterReplayAndReload:true,mouseTouchKeyboardSuppressed:true,legacyKeysUnchanged:Object.keys(values).length,errors},null,2));
 console.log('PASS: control visibility, win/loss completion, replay/reload, old saves and production entry');
} finally {await browser.close()}
