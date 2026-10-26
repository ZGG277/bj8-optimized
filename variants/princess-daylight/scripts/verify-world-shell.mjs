/*
[INPUT]: 正式工作树 GAME_URL、Chrome；PRODUCTION=1 验证最终单 HTML
[OUTPUT]: 双视口入口/真实手势/静止停帧、跨世界核心指纹、失败与卸载证据和截图
[POS]: 多世界本地真实入口验收；每页串行，finally 关闭浏览器
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const base = process.env.GAME_URL || 'http://127.0.0.1:5199/';
const production = process.env.PRODUCTION === '1';
const out = new URL('../shots/world-shell/', import.meta.url);
const prefix = production ? 'production' : 'dev';
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass, detail = {}) => { results.push({name,pass,detail}); console.log(`${pass?'PASS':'FAIL'} ${name}`, JSON.stringify(detail)); assert(pass, name); };
const shotPath = name => fileURLToPath(new URL(`${prefix}-${name}.png`, out));
const worldUrl = world => new URL(`?world=${world}`, base).href;
await mkdir(out,{recursive:true});
const browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
const center = (p,selector) => p.$eval(selector,n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
async function tap(p,selector,mobile) { const pt=await center(p,selector); if(mobile) await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y); }
async function drag(p,from,to,mobile) {
  if(mobile){ await p.touchscreen.touchStart(from.x,from.y);for(let i=1;i<=8;i++){await p.touchscreen.touchMove(from.x+(to.x-from.x)*i/8,from.y+(to.y-from.y)*i/8);await wait(12);}await p.touchscreen.touchEnd(); }
  else{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:8});await p.mouse.up();}
}
async function lowView(p) { await p.focus('.view-slider-track');await p.keyboard.press('Home');for(let i=0;i<3;i++)await p.keyboard.press('ArrowUp');await p.keyboard.press('Tab');await p.mouse.move(5,45);await wait(1300); }
async function coreFingerprint(p) {
 return p.evaluate(async()=>{
  const s=window.__bj8.scene.current;
  s.scene.updateMatrixWorld(true);
  const objects=[];
  const roots=[s.scene.getObjectByName('BJ8_TableShell'),s.tableDetails.root,
    ...s.tableGroup.children.filter(o=>o!==s.studioEnvironment.root && o!==s.tableDetails.root)];
  for(const root of roots) root.traverse(o=>{
    if(!o.isMesh)return;
    const geometry={};for(const [key,value] of Object.entries(o.geometry.attributes))geometry[key]=Array.from(value.array);
    const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,color:m.color?.getHex(),roughness:m.roughness,metalness:m.metalness,
      clearcoat:m.clearcoat,envMapIntensity:m.envMapIntensity,mapRepeat:m.map?.repeat.toArray(),normalScale:m.normalScale?.toArray()}));
    objects.push({name:o.name,matrix:o.matrixWorld.toArray(),geometry,index:o.geometry.index?Array.from(o.geometry.index.array):null,materials});
  });
  const lights=[];s.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,color:o.color.getHex(),intensity:o.intensity,position:o.position.toArray(),castShadow:o.castShadow});});
  const contract={objects,lights,fog:{color:s.scene.fog.color.getHex(),near:s.scene.fog.near,far:s.scene.fog.far},exposure:s.renderer.toneMappingExposure,
    environmentIntensity:s.scene.environmentIntensity,balls:s.ballMeshes.map(b=>({radius:b.geometry.parameters.radius,roughness:b.material.roughness,clearcoat:b.material.clearcoat,envMapIntensity:b.material.envMapIntensity})),
    camera:{fov:s.camera.fov,near:s.camera.near,far:s.camera.far}};
  const bytes=new TextEncoder().encode(JSON.stringify(contract));const digest=await crypto.subtle.digest('SHA-256',bytes);
  return{sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),meshes:objects.length};
 });
}
try {
  // 入口解析只检查 DOM，不创建 WebGL。
  for(const query of ['', '?world=unknown', '?world=studio']) {
    const p=await browser.newPage();try{await p.goto(new URL(query,base).href,{waitUntil:'networkidle0'});
      const selected = await p.$eval('input[name="world"]:checked', input => input.value);
      check(`入口 ${query||'普通'} 保持约定`,Boolean(await p.$('.world-choice')) && selected==='studio' && !await p.$('.viewport canvas'));
    }finally{await p.close();}
  }
  const coreHashes={};
  for(const size of [{name:'desktop',width:1280,height:800,deviceScaleFactor:1},{name:'mobile',width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true}]) {
    for(const world of ['studio','cloud-sea']) {
      const mobile=size.name==='mobile', label=`${size.name}-${world}`;
      const p=await browser.newPage();
      try{
        const errors=[],assetRequests=[];
        p.on('pageerror',error=>errors.push(String(error)));
        p.on('request',r=>{if(r.url().includes('.glb') && r.resourceType()!=='script')assetRequests.push(r.url());});
        await p.setViewport(size);
        const response=await p.goto(worldUrl(world),{waitUntil:'networkidle0'});
        if(production){const served=createHash('sha256').update(await response.buffer()).digest('hex');const built=createHash('sha256').update(await readFile(new URL('../dist/index.html',import.meta.url))).digest('hex');check(label+' 服务字节匹配最终构建',served===built,{sha256:served});}
        check(label+' 局前零 WebGL 和零资产解析',!await p.$('.viewport canvas') && assetRequests.length===0);
        // 用真实点击验证两项选择与 URL 同步，再回到本次世界。
        const other=world==='studio'?'cloud-sea':'studio';
        await tap(p,`input[value="${other}"] + span`,mobile);
        await p.waitForFunction(value=>new URL(location.href).searchParams.get('world')===value,{timeout:2500},other);
        check(label+' 局前选择更新链接',new URL(p.url()).searchParams.get('world')===other);
        await tap(p,`input[value="${world}"] + span`,mobile);
        await p.waitForFunction(value=>new URL(location.href).searchParams.get('world')===value,{timeout:2500},world);
        await p.waitForFunction(()=>[...document.querySelectorAll('.intro-card h1 span,.skill-summary,.mode-grid')].every(n=>Number(getComputedStyle(n).opacity)>.99),{timeout:4000});
        await p.screenshot({path:shotPath(label+'-intro')});
        await tap(p,'.start-btn',mobile);await p.waitForSelector('.viewport canvas');
        if(!production) await p.waitForFunction(()=>window.__bj8?.scene.current?.studioEnvironment.root.userData.assetState==='ready' && window.__bj8.scene.current.tableDetails.root.userData.assetState==='ready');
        await wait(1600);
        check(label+' 局内不出现世界选择',!await p.$('.world-choice'));
        await p.screenshot({path:shotPath(label+'-overhead')});
        if(!production){
          const core=await coreFingerprint(p);coreHashes[label]=core;
          const s=await p.evaluate(()=>{const s=window.__bj8.scene.current;let tris=0,calls=0;s.studioEnvironment.worldShell.root.traverse(o=>{if(o.isMesh){calls++;tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return{world:s.studioEnvironment.root.userData.worldId,frames:s.renderedFrames(),calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles,shellCalls:calls,shellTriangles:tris,pixelRatio:s.renderer.getPixelRatio()};});
          check(label+' 指定世界已装配',s.world===world,s);
          if(world==='cloud-sea')check(label+' 外围预算',s.shellCalls<=12&&s.shellTriangles<=30000,s);
          await wait(1100);check(label+' 静止停帧',await p.evaluate(()=>window.__bj8.scene.current.renderedFrames())-s.frames<=1);
          // 开球白球真实拖放，使用现有坐标投影计算指针位置。
          const points=await p.evaluate(()=>{const h=window.__bj8,s=h.scene.current,w=h.world.current;const a=h.cameraViewAzimuth.current,l=Number(document.querySelector('.viewport').dataset.viewLevel);return{from:s.tableToScreenAt(w.balls[0].x,w.balls[0].z,a,l),to:s.tableToScreenAt(.12,.7,a,l)};});
          await drag(p,points.from,points.to,mobile);await wait(300);
          const cue=await p.evaluate(()=>{const b=window.__bj8.world.current.balls[0];return{x:b.x,z:b.z};});
          check(label+' 开球白球可拖放',Math.abs(cue.x-.12)<.04&&Math.abs(cue.z-.7)<.04,cue);
        }
        const dial=await center(p,'.aim-dial');
        const beforeDial=!production?await p.evaluate(()=>window.__bj8.aim.current):await p.$eval('.aim-dial',n=>n.getAttribute('aria-valuenow'));
        if(!production){
          const vertical=await p.$eval('.aim-dial',n=>n.classList.contains('is-vertical'));
          await drag(p,dial,{x:dial.x+(vertical?0:25),y:dial.y+(vertical?25:0)},mobile);await wait(200);
          check(label+' 真实拨轮可瞄准',Math.abs(await p.evaluate(()=>window.__bj8.aim.current)-beforeDial)>1e-4);
        }else{
          await tap(p,'.aim-dial',mobile);await wait(150);
          check(label+' 生产瞄准控件粗细档可切换',await p.$eval('.aim-dial',n=>n.getAttribute('aria-valuenow'))!==beforeDial);
        }
        await lowView(p);
        check(label+' 真实视角滑杆可用',await p.$eval('.view-slider-track',n=>n.getAttribute('aria-valuenow'))==='15');
        await p.screenshot({path:shotPath(label+'-low')});
        const aimBefore=!production?await p.evaluate(()=>window.__bj8.aim.current):null;
        await tap(p,'.manual-camera-button',mobile);
        const cameraBefore=!production?await p.evaluate(()=>window.__bj8.cameraAzimuth.current):null;
        for(let i=0;i<4;i++)await drag(p,{x:size.width*.27,y:size.height*.54},{x:size.width*.72,y:size.height*.54},mobile);
        await wait(1300);await p.screenshot({path:shotPath(label+'-orbit')});
        if(!production){const state=await p.evaluate(()=>({aim:window.__bj8.aim.current,camera:window.__bj8.cameraAzimuth.current}));check(label+' 环绕只改相机不改杆向',Math.abs(state.aim-aimBefore)<1e-10&&Math.abs(state.camera-cameraBefore)>.02,state);}
        await tap(p,'.manual-camera-button',mobile);
        const shotBefore=!production?await p.evaluate(()=>window.__bj8.world.current.shot):null;
        const shoot=await center(p,'.shoot-pad');await drag(p,{x:shoot.x,y:shoot.y-20},{x:shoot.x,y:Math.min(size.height-15,shoot.y+100)},mobile);
        await p.waitForFunction(()=>document.querySelector('.shoot-pad')?.getAttribute('aria-disabled')==='true');
        if(!production){await p.waitForFunction(n=>window.__bj8.world.current.shot>n,{},shotBefore);const state=await p.evaluate(()=>({shot:window.__bj8.world.current.shot,moving:window.__bj8.world.current.moving}));check(label+' 实际出杆触发物理',state.shot===shotBefore+1&&state.moving,state);}
        else check(label+' 生产入口实际出杆进入滚动',await p.$eval('.shoot-pad',n=>n.getAttribute('aria-disabled'))==='true');
        await wait(450);await p.screenshot({path:shotPath(label+'-shot')});
        check(label+' 无页面错误和横向溢出',errors.length===0&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),errors);
        if(production)check(label+' 生产无外部模型请求',assetRequests.length===0);
      }finally{await p.close();}
    }
    if(!production)check(size.name+' 两世界核心几何材质灯光相机一致',coreHashes[size.name+'-studio'].sha256===coreHashes[size.name+'-cloud-sea'].sha256,coreHashes);
  }
  if(!production){
    // 全新独立 Scene3D fixture；不挂载第二份 Game，不重建原对局。
    const p=await browser.newPage();try{
      await p.setViewport({width:1280,height:800});await p.goto(base,{waitUntil:'networkidle0'});
      const result=await p.evaluate(async()=>{
        const {Scene3D}=await import('/src/Scene3D.ts');const {createEmptyWorldShell}=await import('/src/scene/world-shell.ts');
        const {createInitialWorld,strikeCueBall,stepWorld}=await import('/src/physics.ts');
        const records=[];
        for(const kind of ['empty','cloud','failed']){
          const el=document.createElement('div');el.style.cssText='width:1280px;height:800px';document.body.appendChild(el);
          const s=new Scene3D(el,{worldId:'cloud-sea',...(kind==='empty'?{worldShellFactory:createEmptyWorldShell}:kind==='failed'?{worldShellFactory:()=>{throw new Error('injected shell failure')}}:{})});
          await s.studioEnvironment.ready;await s.tableDetails.ready;await s.studioEnvironment.worldShell.ready;
          let seed=29;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
          const world=createInitialWorld(rng);strikeCueBall(world,.017,68,{x:.25,y:.1});
          const samples=[];for(let i=0;i<480;i++){stepWorld(world);samples.push(JSON.stringify(world));}
          const bytes=new TextEncoder().encode(samples.join('\n'));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
          const table=s.scene.getObjectByName('BJ8_TableShell');let tableReleased=0;table.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>tableReleased++);});
          s.studioEnvironment.worldShell.dispose();
          records.push({kind,physicsHash:hash,quiet:s.studioEnvironment.quietZone.children.length,tablePresent:!!s.scene.getObjectByName('BJ8_TableShell'),tableReleased,shellState:s.studioEnvironment.root.userData.shellState});
          s.dispose();el.remove();
        }
        return records;
      });
      check('云海、空壳和失败回退复用静区及核心，480 固定步一致',new Set(result.map(r=>r.physicsHash)).size===1&&result.every(r=>r.quiet===1&&r.tablePresent&&r.tableReleased===0)&&result[2].shellState==='fallback',result);
    }finally{await p.close();}
    for(const kind of ['failed','late']){
      const p=await browser.newPage();try{
        await p.setCacheEnabled(false);await p.setRequestInterception(true);
        p.on('request',r=>{if(r.url().includes('.glb')&&r.resourceType()!=='script'){if(kind==='failed')void r.abort();else setTimeout(()=>r.continue().catch(()=>{}),900);}else void r.continue();});
        await p.goto(worldUrl('cloud-sea'),{waitUntil:'networkidle0'});await p.click('.start-btn');await p.waitForFunction(()=>!!window.__bj8?.scene.current);
        if(kind==='failed'){
          await p.waitForFunction(()=>window.__bj8.scene.current.studioEnvironment.root.userData.assetState==='fallback');
          const state=await p.evaluate(()=>{const s=window.__bj8.scene.current;return {cloth:!!s.scene.getObjectByName('table-cloth'),quiet:!!s.scene.getObjectByName('quiet-platform'),pockets:Array.from({length:6},(_,i)=>!!s.scene.getObjectByName('pocket-top-trim-'+i)).every(Boolean)};});
          const shoot=await center(p,'.shoot-pad');await drag(p,shoot,{x:shoot.x,y:shoot.y+100},false);await p.waitForFunction(()=>window.__bj8.world.current.shot===1);
          check('GLB 失败仍保留六袋台呢和静区，可真实出杆',state.cloth&&state.quiet&&state.pockets,state);
        }else{
          const result=await p.evaluate(async()=>{const s=window.__bj8.scene.current,e=s.studioEnvironment;s.dispose();return{ready:await e.ready,attached:!!s.scene.getObjectByName('blender-room-v1'),canvas:!!document.querySelector('.viewport canvas'),shellChildren:e.worldShell.root.children.length};});
          check('提前卸载后晚到模型不回挂且云海被释放',!result.ready&&!result.attached&&!result.canvas&&result.shellChildren===0,result);
        }
      }finally{await p.close();}
    }
  }
}finally{
  await browser.close();
  await writeFile(new URL(prefix+'-verification.json',out),JSON.stringify({url:base,production,results},null,2)+'\n');
}
