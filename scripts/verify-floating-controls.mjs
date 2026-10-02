/* Bounded UI acceptance in a fresh browser profile; never reads a real user's saves. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const out = 'artifacts/xhs-floating-controls-20261002';
const root = 'http://127.0.0.1:5218';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];
try {
 const page=await browser.newPage();
 page.on('pageerror', e=>errors.push(String(e)));
 await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await page.goto(`${root}/${out}/preview/`,{waitUntil:'networkidle0'});
 await page.evaluate(()=>localStorage.setItem('guagua-billiards:first-match-guide:v1','done'));
 await page.click('.start-btn');
 await page.waitForFunction(()=>!!window.__bj8?.scene.current);
 const states=[];
 for(const [width,height] of [[390,844],[844,390],[320,568],[568,320],[1280,800]]) {
  await page.setViewport({width,height,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await page.waitForFunction(w => document.querySelector('.control-deck')?.dataset.layoutProfile === (w >= 900 ? 'desktop' : innerHeight >= w ? 'portrait' : 'landscape'), {}, width);
  await page.click('[aria-label="展开视角调整"]');
  await page.waitForSelector('#view-control-panel');
  const panel = await page.$eval('#view-control-panel', e => { const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; });
  assert(panel.left>=0 && panel.top>=0 && panel.right<=width && panel.bottom<=height,'view panel outside screen');
  if(width===390) await page.screenshot({path:`${out}/view-expanded.png`});
  await page.click('[aria-label="切换俯视视角"]');
  await page.click('[aria-label="展开视角调整"]');
  await page.waitForFunction(()=>{const s=window.__bj8.scene.current;return s.camera.position.distanceTo(s.targetCameraPos)<.015});
  await new Promise(r=>setTimeout(r,250));
  const state=await page.evaluate(()=>{
   const s=window.__bj8.scene.current;
   const rect=e=>JSON.parse(JSON.stringify(e.getBoundingClientRect()));
   return {width:innerWidth,height:innerHeight,viewport:rect(document.querySelector('.viewport')),
    controls:[...document.querySelectorAll('[data-control-slot]')].map(e=>({id:e.dataset.controlSlot,edge:e.dataset.dockEdge,rect:rect(e),opacity:getComputedStyle(e.firstElementChild).opacity})),
    corners:[[-.76,-1.4],[.76,-1.4],[-.76,1.4],[.76,1.4]].map(([x,z])=>s.tableToScreen(x,z)),
    overflow:document.documentElement.scrollWidth>innerWidth,
    viewOpen:!!document.querySelector('#view-control-panel'),assistOpen:!!document.querySelector('.assist-menu')};
  });
  console.log(JSON.stringify(state));
  assert(!state.overflow && !state.viewOpen && !state.assistOpen);
  const aim=state.controls.find(c=>c.id==='aimDial');assert.equal(aim.edge,'bottom');assert(Math.abs(aim.rect.bottom-height)<1);
  const power=state.controls.find(c=>c.id==='power');assert(Math.abs(power.rect.right-width)<1);assert(Math.abs(power.rect.bottom-height)<1);
  for (const c of state.controls) {
   assert(c.rect.left>=0 && c.rect.top>=0 && c.rect.right<=width+1 && c.rect.bottom<=height+1,`outside ${c.id}`);
   for(const d of state.controls) if(c.id!==d.id) {
    const a=c.rect,b=d.rect;
    assert(!(Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1),`overlap ${c.id}/${d.id}`);
   }
  }
  for(const p of state.corners) assert(p.x>=state.viewport.left-1&&p.x<=state.viewport.right+1&&p.y>=state.viewport.top-1&&p.y<=state.viewport.bottom+1,'table crop');
  await page.screenshot({path:`${out}/floating-${width}x${height}.png`});
  states.push(state);
 }
 await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await page.waitForFunction(()=>{const s=window.__bj8.scene.current;return s.camera.position.distanceTo(s.targetCameraPos)<.015});
 await page.click('[aria-label="展开视角调整"]');
 await page.click('[aria-label="打开辅助功能"]');
 assert.equal(await page.$('#view-control-panel'),null);
 await page.screenshot({path:`${out}/assist-expanded.png`});
 await page.keyboard.press('Escape'); assert.equal(await page.$('.assist-menu'),null);
 // Genuine touch: tap spin, touch aim and drag to aim, then shoot.
 await page.click('.spin-preview');
 assert(await page.$('.spin-popover'));
 await page.screenshot({path:`${out}/spin-expanded.png`});
 await page.click('.spin-preview');
 const dial=await page.$eval('.aim-dial',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,fine:e.classList.contains('fine')}});
 await page.touchscreen.tap(dial.x,dial.y);
 assert.notEqual(await page.$eval('.aim-dial',e=>e.classList.contains('fine')),dial.fine);
 await page.mouse.move(dial.x,dial.y);await page.mouse.down();
 assert.equal(await page.$eval('[data-control-slot="aimDial"] .control-slot-body',e=>getComputedStyle(e).opacity),'1');
 await page.mouse.up();await page.mouse.move(10,80);await new Promise(r=>setTimeout(r,220));
 assert.equal(await page.$eval('[data-control-slot="aimDial"] .control-slot-body',e=>getComputedStyle(e).opacity),'0.22');
 await page.focus('[data-control-slot="power"] [role="button"]');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-control-slot="power"] [role="button"]')?.getAttribute('aria-disabled')==='true');
 const bulb=await page.$eval('[data-control-slot="bulb"]',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
 await page.mouse.move(bulb.x,bulb.y);await page.mouse.down();await new Promise(r=>setTimeout(r,460));
 await page.mouse.move(220,250,{steps:5});await page.mouse.up();
 const moved=await page.$eval('[data-control-slot="bulb"]',e=>{const r=e.getBoundingClientRect();return {placement:e.dataset.placement,x:r.x+r.width/2,y:r.y+r.height/2}});
 assert.equal(moved.placement,'free');assert(Math.abs(moved.x-212)<2 && Math.abs(moved.y-250)<2); // 离开贴边位置时进入既有 8px 自由布局安全边距。
 await page.reload({waitUntil:'networkidle0'});await page.click('.start-btn');
 assert.equal(await page.$eval('[data-control-slot="bulb"]',e=>e.dataset.placement),'free');
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/floating-ui-acceptance.json`,JSON.stringify({states,expandExclusive:true,escapeCloses:true,spinOpens:true,touchAim:true,pressOpacity:1,idleOpacity:.22,shotStarted:true,customDragAndReload:true,errors},null,2));
 console.log('PASS floating controls');
} finally {await browser.close()}
