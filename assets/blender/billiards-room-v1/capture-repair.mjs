import puppeteer from 'puppeteer-core';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const phase=process.env.PHASE||'before', out='assets/blender/billiards-room-v1/repair-evidence';
await mkdir(out,{recursive:true});
const result={phase,url:'http://127.0.0.1:5218/?lake360=1',errors:[],views:[],assets:[]};
const digest=b=>createHash('sha256').update(b).digest('hex');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try {
 result.browser=await browser.version();
 const page=await browser.newPage();
 page.on('pageerror',e=>result.errors.push(String(e)));
 page.on('response',async r=>{if(r.url().includes('billiards-room-v1.glb')&&!r.url().includes('?import')){try{result.assets.push({url:r.url(),sha256:digest(await r.buffer())});}catch{}}});
 for(const vp of [{width:1280,height:800,deviceScaleFactor:1},{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true}]){
  await page.setViewport(vp);await page.goto(result.url,{waitUntil:'networkidle0'});await page.click('.start-btn');
  await page.waitForFunction(()=>window.__bj8?.scene.current?.studioEnvironment.root.userData.assetState==='ready');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='暂停水波')?.click());
  const views=vp.width===390?[['mobile-low',[0,.19,1.90],[0,0,0]]]:[
   ['desktop-low',[0,.19,1.90],[0,0,0]],
   ['side-right',[1.13,.15,.32],[.69,-.055,0]],
   ['side-left',[-1.13,.15,-.32],[-.69,-.055,0]],
   ['seam-close',[.34,.075,.68],[.64,0,.6]]];
  for(const [name,camera,target] of views){
   const state=await page.evaluate(({camera,target})=>{const s=window.__bj8.scene.current;
    s.camera.position.set(...camera);s.targetCameraPos.copy(s.camera.position);s.targetLookAt.set(...target);s.smoothLookAt.set(...target);s.camera.lookAt(...target);
    s.cueGroup.visible=false;s.aimGhost.visible=false;s.aimLine.visible=false;s.requestRender(true);
    return {camera:s.camera.position.toArray(),target,repairNodes:['BJ8_ClothUnderlap','BJ8_MiddlePocketAprons'].map(n=>{const o=s.scene.getObjectByName(n);return {name:n,exists:!!o,visible:o?.visible,vertices:o?.geometry?.attributes.position.count};}),state:s.studioEnvironment.root.userData};
   },{camera,target});
   await new Promise(r=>setTimeout(r,450));await page.screenshot({path:`${out}/${phase}-${name}.png`});result.views.push({name,viewport:vp,...state});
  }
 }
 result.localAssetSha256=digest(await readFile('src/scene/assets/billiards-room-v1.glb'));
 if(phase==='after' && (result.errors.length||result.views.some(v=>v.repairNodes.some(n=>!n.exists))))throw new Error('Repair asset not loaded');
}finally{await browser.close();await writeFile(`${out}/${phase}-browser.json`,JSON.stringify(result,null,2));}
console.log(JSON.stringify({phase,errors:result.errors,views:result.views.length,assets:result.assets,localAssetSha256:result.localAssetSha256},null,2));
