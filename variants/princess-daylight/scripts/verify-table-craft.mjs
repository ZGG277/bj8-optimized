/*
[INPUT]: 本地实际 GAME_URL、Chrome、开发调试快照或最终生产 HTML
[OUTPUT]: 台面/袋口/接触阴影、真实出杆与旋转、双视口和异步失败/卸载证据
[POS]: 本轮台内精修的浏览器验收；所有页面串行，finally 回收浏览器
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const url = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const production = process.env.PRODUCTION === '1';
const lifecycleOnly = process.env.LIFECYCLE_ONLY === '1';
const out = new URL('../shots/table-craft-v2/', import.meta.url);
const prefix = lifecycleOnly ? 'lifecycle' : production ? 'production' : 'dev';
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = {}) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
  assert(pass, name);
};
const shot = (page, name) => page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});
await mkdir(out, {recursive:true});
const browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
try {
  for (const viewport of lifecycleOnly ? [] : [{width:1280,height:800,deviceScaleFactor:1,name:'desktop'}, {width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true,name:'mobile'}]) {
    const page = await browser.newPage();
    try {
      const errors = [], requests = [];
      page.on('pageerror', e=>errors.push(String(e)));
      page.on('request', req=>{if(req.url().includes('.glb') && req.resourceType()!=='script') requests.push(req.url());});
      await page.setViewport(viewport);
      const response = await page.goto(url,{waitUntil:'networkidle0'});
      if (production) {
        const digest = data=>createHash('sha256').update(data).digest('hex');
        const served=digest(await response.buffer());
        check(viewport.name+' 入口字节为最终构建',served===digest(await readFile(new URL('../dist/index.html',import.meta.url))),{sha256:served});
      }
      check(viewport.name+' 介绍页零 WebGL 和模型加载',!(await page.$('.viewport canvas')) && requests.length===0);
      await page.click('.start-btn');
      await page.waitForSelector('.viewport canvas');
      if (!production) await page.waitForFunction(()=>window.__bj8?.scene.current?.tableDetails.root.userData.assetState==='ready');
      await wait(1400);
      await shot(page,`${prefix}-${viewport.name}`);
      if(!production) {
        const state=await page.evaluate(()=>{
          const s=window.__bj8.scene.current,root=s.scene,cloth=root.getObjectByName('table-cloth');
          const contact=root.getObjectByName('ball-contact-shadows');
          let count=0;root.getObjectByName('blender-table-craft-v2').traverse(o=>{if(o.isMesh)count++;});
          return {detailsMeshes:count,clothRepeat:cloth.material.map.repeat.toArray(),uvCount:cloth.geometry.attributes.uv.count,
            vertexCount:cloth.geometry.attributes.position.count,contacts:contact.count,
            contactAtCue:Array.from(contact.instanceMatrix.array).slice(12,15),cue:s.ballMeshes[0].position.toArray(),
            frame:s.renderedFrames(),calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};
        });
        check(viewport.name+' 真实模型和米制织纹已装配',state.detailsMeshes===2 && state.uvCount===state.vertexCount && state.clothRepeat.every(n=>n===6.25),state);
        check(viewport.name+' 球底接触阴影贴合真实球位',state.contacts===16 && Math.abs(state.contactAtCue[0]-state.cue[0])<1e-6 && Math.abs(state.contactAtCue[2]-state.cue[2])<1e-6 && state.contactAtCue[1]<.001);
        await wait(1100);
        check(viewport.name+' 新细节保持静止停帧',await page.evaluate(()=>window.__bj8.scene.current.renderedFrames())-state.frame<=1);
      }
      await page.focus('.view-slider-track');await page.keyboard.press('Home');
      for(let i=0;i<3;i++)await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');await page.mouse.move(5,55);await wait(1300);
      check(viewport.name+' 真实低机位控件正常',Number(await page.$eval('.view-slider-track',n=>n.getAttribute('aria-valuenow')))===15);
      await shot(page,`${prefix}-${viewport.name}-low`);
      if(!production) {
        const before=await page.evaluate(()=>{
          const s=window.__bj8.scene.current;
          window.__craftFrames=[];window.__craftRenderOriginal=s.renderer.render.bind(s.renderer);
          s.renderer.render=(...args)=>{
            const b=s.ballMeshes[0].position,m=s.ballContacts.mesh.instanceMatrix.array;
            window.__craftFrames.push(Math.hypot(b.x-m[12],b.z-m[14]));
            if(window.__craftFrames.length>12)window.__craftFrames.shift();
            return window.__craftRenderOriginal(...args);
          };
          return{shot:window.__bj8.world.current.shot,q:s.ballMeshes[0].quaternion.toArray()};
        });
        const p=await page.$eval('.shoot-pad',n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
        await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+100,{steps:8});await page.mouse.up();
        await page.waitForFunction(start=>window.__bj8.world.current.shot>start,{},before.shot);await wait(300);
        const moving=await page.evaluate(()=>{
          const s=window.__bj8.scene.current,b=window.__bj8.world.current.balls[0];
          s.renderer.render=window.__craftRenderOriginal;
          return{frameContactErrors:window.__craftFrames,shot:window.__bj8.world.current.shot,moving:window.__bj8.world.current.moving,q:s.ballMeshes[0].quaternion.toArray(),
            speed:Math.hypot(b.vx,b.vz),spin:Math.hypot(b.wx,b.wy,b.wz),position:s.ballMeshes[0].position.toArray(),
            contact:Array.from(s.ballContacts.mesh.instanceMatrix.array).slice(12,15)};
        });
        check(viewport.name+' 实际出杆后红点按物理角速度旋转',moving.shot===before.shot+1 && moving.moving && moving.spin>0 && moving.q.some((v,i)=>Math.abs(v-before.q[i])>.001),moving);
        check(viewport.name+' 滚动时接触阴影同步',moving.frameContactErrors.length>0 && moving.frameContactErrors.every(distance=>distance<1e-6));
        await shot(page,`${prefix}-${viewport.name}-rolling`);
      } else check(viewport.name+' 最终单 HTML 无外部模型请求',requests.length===0);
      check(viewport.name+' 无脚本错误或横向溢出',errors.length===0 && await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),errors);
    } finally {await page.close();}
  }
  if(!production) {
    if(!lifecycleOnly) {
    const page=await browser.newPage();
    try {
      await page.setViewport({width:1440,height:960});await page.goto(url,{waitUntil:'networkidle0'});await page.click('.start-btn');
      await page.waitForFunction(()=>window.__bj8?.scene.current?.tableDetails.root.userData.assetState==='ready');
      for (const [name,camera,target] of [['side',[.38,.19,.22],[.651,.029,0]],['corner',[.37,.25,.94],[.642,.024,1.284]]]) {
        await page.evaluate(({camera,target})=>{
          const s=window.__bj8.scene.current;
          s.camera.position.set(...camera);s.targetCameraPos.copy(s.camera.position);s.targetLookAt.set(...target);s.smoothLookAt.set(...target);
          s.camera.lookAt(...target);s.cueGroup.visible=false;s.aimGhost.visible=false;s.aimLine.visible=false;s.requestRender(true);
        },{camera,target});
        await wait(1200);await shot(page,`pocket-${name}-macro`);
      }
      const contact=await page.evaluate(()=>{
        const s=window.__bj8.scene.current,b=s.ballMeshes[0];
        // 模拟最终显示球进入袋口，不改变对局物理；检查该球接触贴片立即消失。
        const saved=b.position.clone();b.position.y=-.005;s.ballContacts.sync(s.ballMeshes);
        const hidden=s.ballContacts.mesh.instanceMatrix.array[0]===0;
        b.position.copy(saved);s.ballContacts.sync(s.ballMeshes);
        return {hidden,radius:b.geometry.parameters.radius,expectedRadius:.028575};
      });
      check('落袋显示球不会留下悬空接触贴片，球半径保持原值',contact.hidden && Math.abs(contact.radius-.028575)<1e-9,contact);
    }finally{await page.close();}
    }
    const failed=await browser.newPage();
    try {
      await failed.setRequestInterception(true);
      failed.on('request',req=>req.url().includes('table-craft-v2.glb') && req.resourceType()!=='script'?req.abort():req.continue());
      await failed.goto(url,{waitUntil:'networkidle0'});await failed.click('.start-btn');
      await failed.waitForFunction(()=>window.__bj8?.scene.current?.tableDetails.root.userData.assetState==='fallback');
      check('细节加载失败仍有完整六袋和台呢',await failed.evaluate(()=>{const s=window.__bj8.scene.current.scene;return !!s.getObjectByName('table-cloth') && Array.from({length:6},(_,i)=>s.getObjectByName('pocket-top-trim-'+i)).every(Boolean);}));
    }finally{await failed.close();}
    const cancelled=await browser.newPage();
    try {
      await cancelled.setRequestInterception(true);
      cancelled.on('request',req=>{
        if(req.url().includes('table-craft-v2.glb') && req.resourceType()!=='script')setTimeout(()=>req.continue().catch(()=>{}),3500);
        else req.continue();
      });
      await cancelled.goto(url,{waitUntil:'networkidle0'});await cancelled.click('.start-btn');
      await cancelled.waitForFunction(()=>!!window.__bj8?.scene.current);
      const disposed=await cancelled.evaluate(async()=>{const s=window.__bj8.scene.current,d=s.tableDetails;let contactsReleased=false;s.ballContacts.mesh.addEventListener('dispose',()=>{contactsReleased=true;});s.dispose();return {loaded:await d.ready,attached:!!s.scene.getObjectByName('blender-table-craft-v2'),contactsReleased};});
      check('卸载先于细节加载时正确释放',!disposed.loaded && !disposed.attached && disposed.contactsReleased,disposed);
    }finally{await cancelled.close();}
  }
}finally{
  await browser.close();
  await writeFile(new URL(`${prefix}-verification.json`,out),JSON.stringify({url,production,results},null,2)+'\n');
}
