/** Local experiment acceptance: actual game entry, six-axis panorama and measured browser submission/frame cadence. */
import puppeteer from 'puppeteer-core';
import {writeFile} from 'node:fs/promises';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const result={url:'http://127.0.0.1:5216/?lake360=1',device:'macOS host; desktop Chrome and emulated mobile viewport, NOT physical phone',views:[],errors:[]};
let browser;
try {
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 result.browser=await browser.version();
 const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error' && !m.text().includes('Failed to load resource'))result.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400 && !r.url().endsWith('/favicon.ico')) result.errors.push(`${r.status()} ${r.url()}`);});
 for(const viewport of [{width:1280,height:800,deviceScaleFactor:1},{width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
  await page.setViewport(viewport);await page.goto(result.url,{waitUntil:'networkidle0'});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='开始对局')?.click());
  await page.waitForFunction(()=>window.__bj8?.scene.current?.studioEnvironment?.worldShell.root.userData.assetState==='ready');
  await wait(1800);
  const name=viewport.width===390?'mobile':'desktop';
  await page.screenshot({path:`shots/lake360/${name}-game.png`});
  const status=await page.evaluate(()=>{
   const s=window.__bj8.scene.current; const gl=s.renderer.getContext(); const ext=gl.getExtension('WEBGL_debug_renderer_info');
   const lake=s.studioEnvironment.worldShell.root;let tris=0,meshes=0;lake.traverse(o=>{if(o.isMesh){meshes++;tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
   return {url:location.href,title:document.title,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:s.renderer.getPixelRatio(),calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles,lakeTriangles:tris,lakeMeshes:meshes,quality:s.thermalSnapshot(),world:s.studioEnvironment.root.userData,loaded:lake.userData};
  });
  // Measure actual renderer submissions during calm idle animation; not GPU time.
  await page.evaluate(()=>{const s=window.__bj8.scene.current;window.__lakeSamples={cpu:[],interval:[],last:null};const render=s.renderer.render.bind(s.renderer);window.__restoreLakeRender=()=>s.renderer.render=render;s.renderer.render=(...args)=>{const t=performance.now();render(...args);const q=window.__lakeSamples;q.cpu.push(performance.now()-t);if(q.last!==null)q.interval.push(t-q.last);q.last=t;};});
  await wait(12000);
  const samples=await page.evaluate(()=>{window.__restoreLakeRender();return window.__lakeSamples;});
  const stat=a=>({n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)]});
  result.views.push({viewport,...status,renderSubmissionMs:stat(samples.cpu),presentationIntervalMs:stat(samples.interval),fps:1000/stat(samples.interval).mean});
  // User-visible controls drive every orientation.
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='环顾湖面')?.click());
  for(const [direction,yaw,pitch] of [['north',0,0],['east',90,0],['south',180,0],['west',270,0],['up',0,85],['down',0,-85]]){
   await page.evaluate((yaw,pitch)=>{for(const [label,val] of [['湖面方位',yaw],['抬头低头',pitch]]){const e=document.querySelector(`input[aria-label="${label}"]`);e.value=val;e.dispatchEvent(new Event('input',{bubbles:true}));}},yaw,pitch);
   await wait(250);await page.screenshot({path:`shots/lake360/${name}-${direction}.png`});
  }
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='回到球桌')?.click());await wait(1400);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='暂停水波')?.click());await wait(300);
  const before=await page.evaluate(()=>window.__bj8.scene.current.renderedFrames());await wait(1000);
  const after=await page.evaluate(()=>window.__bj8.scene.current.renderedFrames());
  result.views.at(-1).pausedFrames=after-before;
  result.views.at(-1).returnedToGame=await page.evaluate(()=>window.__bj8.scene.current.lakeExplore===null);
  const candidates=await page.evaluate(()=>{const r=document.querySelector('.viewport').getBoundingClientRect();return [.68,.74,.8,.86].map(t=>({x:r.x+r.width/2,y:r.y+r.height*t}));});
  for(const p of candidates){await page.mouse.click(p.x,p.y);await wait(200);if(await page.evaluate(()=>window.__bj8.match.current.phase==='aiming'))break;}
  const aiming=await page.evaluate(()=>window.__bj8.match.current.phase==='aiming');
  if(aiming){
   const pad=await page.$('.shoot-pad');const r=await pad.boundingBox();
   await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2+110,{steps:8});await page.mouse.up();await wait(450);
  }
  result.views.at(-1).shot=await page.evaluate(()=>({phase:window.__bj8.match.current.phase,moving:window.__bj8.world.current.moving}));
  result.views.at(-1).realPointerPlacement=aiming;
 }
 await writeFile('shots/lake360/browser-evidence.json',JSON.stringify(result,null,2));
 if(result.errors.length||result.views.some(v=>!v.returnedToGame||v.pausedFrames>1))throw new Error('Lake acceptance failed: inspect browser-evidence.json');
 console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();}
