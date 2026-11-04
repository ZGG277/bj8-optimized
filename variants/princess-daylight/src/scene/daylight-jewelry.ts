/**
 * [INPUT]: 原始桌球GLB、共享物理尺寸、宝石光学与已就绪的统一字体、独立暖天空背景。
 * [OUTPUT]: 帮面卷草金丝、暖象牙上缘与下架、末帧深翡翠细绒台呢与同源护口；正常/热档宝石球号统一霞鹜文楷。
 * [POS]: 实际 daylight GLB 视觉适配；消费共享袋口尺寸，不改球光学或曝光；城堡仅暖化既有日光/半球光。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyJewelFinish, applyObsidianNumberFont } from './jewel-ball-finish';
import { createGemCaustics } from './gem-caustics';
import { batchStaticTable } from '../minitool/render-guard';
import { loadGlb } from './glb-loader';
import { createDaylightEnvironment, createCastleSkyBackground } from './daylight-environment';
import { TABLE, POCKETS } from '../physics';
import { splitFairyTableParts, retireAuthoredPocketAssembly } from './fairy-table-finish';
import { addContinuousTableDeck, clipAuthoredUpperDeck } from './table-deck';
import { createPocketCollars } from './pocket-collars';
import { createWarmIvoryMaps, warmIvoryMaterial } from './warm-ivory';
import tableUrl from './assets/daylight/table-refined.glb?url';
import tableHotUrl from './assets/daylight/table-hot.glb?url';
import ballsUrl from './assets/daylight/balls-quality.glb?url';
import ballsHotUrl from './assets/daylight/balls-hot.glb?url';

function release(root:THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of m.userData.sourceTextures??[])if(t instanceof THREE.Texture)textures.add(t);for(const t of Object.values(m))if(t instanceof THREE.Texture)textures.add(t);}});
  textures.forEach(t=>{if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)t.image.close();t.dispose();});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}
export function daylightEnabled(){return new URLSearchParams(location.search).get('daylight')!=='0';}
export function setupDaylight(scene:THREE.Scene,renderer:THREE.WebGLRenderer,key:THREE.DirectionalLight,ceiling:THREE.Group,castle=false){
  scene.remove(ceiling);release(ceiling); // Replace the studio's eight spots with sun and sky, not an additional lighting rig.
  scene.environmentIntensity=.58;scene.environmentRotation.set(0,.48,0);renderer.toneMappingExposure=1.04;
  key.color.set(0xfff1d9);key.intensity=1.2;key.position.set(-2.5,4.8,-2.1);key.shadow.radius=4;
  scene.traverse(o=>{if(o instanceof THREE.AmbientLight)o.intensity=.32;if(o instanceof THREE.HemisphereLight){o.color.set(0xe6f3ff);o.groundColor.set(0x91baa5);o.intensity=.48;}});
  if(castle){
    scene.environment?.dispose();scene.environment=createDaylightEnvironment(renderer);scene.environmentIntensity=.62;scene.environmentRotation.set(0,0,0);
    renderer.toneMappingExposure=.94;
    key.position.set(-3.8,5.8,-4.5);key.intensity=2.2;key.color.set(0xffecd0);key.shadow.radius=3;
    scene.traverse(o=>{if(o instanceof THREE.AmbientLight)o.intensity=.10;if(o instanceof THREE.HemisphereLight){o.color.set(0xe4edf1);o.groundColor.set(0xa39878);o.intensity=.32;}});
    Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,far:24});key.shadow.camera.updateProjectionMatrix();
    scene.fog=new THREE.Fog(0xded8bf,50,230);
    if(scene.background instanceof THREE.Texture)scene.background.dispose();
    scene.background=createCastleSkyBackground();
  }
  renderer.domElement.dataset.visualVersion='princess-scene-r2-ball-clarity-20261104';
}
function styleCloth(table:THREE.Group){
  table.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(o.name==='table-cloth'||o.name.startsWith('cushion-')))return;
    o.castShadow=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshPhysicalMaterial){m.color.set(0xf4fff9);m.roughness=.96;m.metalness=0;m.clearcoat=0;m.sheen=.42;m.sheenColor.set(0x38764d);m.sheenRoughness=.88;m.specularIntensity=.08;m.normalScale.set(.35,.28);m.envMapIntensity=.10;}
  });
}
function styleTable(root:THREE.Group,hot=false){
  const maps=createWarmIvoryMaps(hot),ivory=warmIvoryMaterial(hot,maps,true),replaced=new Set<THREE.Texture>();
  root.rotation.y=-Math.PI/2;root.position.set(-.81006,-.718,-1.44506);
  root.updateMatrixWorld(true);
  splitFairyTableParts(root,hot,maps);
  retireAuthoredPocketAssembly(root);
  root.updateMatrixWorld(true);
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.castShadow=!hot;o.receiveShadow=true;
    // Compress only the outer apron; retain the exact playing rectangle. Both LODs use this same deformation.
    const position=o.geometry.getAttribute('position'),point=new THREE.Vector3(),inverse=o.matrixWorld.clone().invert();
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld);
      // Thin only the rolled crown cross-section vertically; its rounded mouth
      // contour and shared aperture deformation are retained in both LODs.
      if(o.userData.fairyRole==='pocket-crown')point.y=.065+(point.y-.065)*.82;
      for(const p of POCKETS){
        const dx=point.x-p.x,dz=point.z-p.z,d=Math.hypot(dx,dz);
        if(d<.30 && point.y>-.35){
          const weight=(1-THREE.MathUtils.smoothstep(d,.16,.30))*THREE.MathUtils.smoothstep(point.y,-.35,-.10);
          const shrink=(1-p.mouthWidth/((p.kind==='corner'?.100:.102)*1.77))*weight;
          point.x-=dx*shrink;point.z-=dz*shrink;
        }
      }
      point.x=Math.sign(point.x)*(Math.min(Math.abs(point.x),TABLE.width/2)+Math.max(0,Math.abs(point.x)-TABLE.width/2)*.8);
      point.z=Math.sign(point.z)*(Math.min(Math.abs(point.z),TABLE.length/2)+Math.max(0,Math.abs(point.z)-TABLE.length/2)*.8);
      point.applyMatrix4(inverse);position.setXYZ(i,point.x,point.y,point.z);
    }
    position.needsUpdate=true;
    // Rejoin normal seams after deformation, while preserving edges sharper than 45 degrees.
    // The restored crown curves remain smooth rather than inheriting triangulated highlights.
    const oldGeometry=o.geometry;o.geometry=toCreasedNormals(oldGeometry,o.userData.fairyRole==='pocket-crown'?Math.PI/3:Math.PI/4);
    if(o.geometry!==oldGeometry)oldGeometry.dispose();
    o.geometry.computeBoundingSphere();o.geometry.computeBoundingBox();
    const list=Array.isArray(o.material)?o.material:[o.material];
    for(const base of list){
      // Original asset cloth is replaced by the unchanged game cloth/cushion geometry.
      if(/Emerald cloth/.test(base.name)){o.visible=false;continue;}
      if(!(base instanceof THREE.MeshStandardMaterial))continue;
      const m=base instanceof THREE.MeshPhysicalMaterial?base:new THREE.MeshPhysicalMaterial().copy(base as THREE.MeshPhysicalMaterial);
      if(m!==base){o.material=m;base.dispose();}
      if(/gold/i.test(m.name)){m.color.setRGB(.73,.49,.20);m.metalness=1;m.roughness=.46;m.clearcoat=0;m.clearcoatRoughness=.4;m.envMapIntensity=.78;}
      // Upper rails and lower structure share one bone grain family, with a softer lower polish.
      if(/Pearl|shell|inlay|Crystal/i.test(m.name)){
        if(m.map)replaced.add(m.map);
        m.copy(ivory);
      }
      if(/^Pocket/i.test(m.name)){m.color.set(0x244b42);m.roughness=.86;m.metalness=0;m.clearcoat=0;m.envMapIntensity=.28;}
      if(m.map)m.map.anisotropy=4;
    }
  });
  clipAuthoredUpperDeck(root);
  addContinuousTableDeck(root,hot,ivory,maps);
  // Retire only the authored pocket cap/insert. Its disjoint triangles expose
  // the gold underside at close range after the C1 aperture deformation.
  root.traverse(o=>{if(o instanceof THREE.Mesh && !Array.isArray(o.material)
    && (o.userData.fairyRole==='pocket-crown' || /^Pocket/.test(o.material.name))) o.visible=false;});
  replaced.forEach(t=>t.dispose());
}

function boundTextures(root:THREE.Group,maxSide:number){
 const seen=new Set<THREE.Texture>(),images=new Set<ImageBitmap>();
 root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m)){
  if(!(value instanceof THREE.Texture)||seen.has(value))continue;seen.add(value);
  const image=value.image;if(!image?.width||Math.max(image.width,image.height)<=maxSide)continue;
  const scale=maxSide/Math.max(image.width,image.height),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);value.image=canvas;value.needsUpdate=true;
  if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap)images.add(image);
 }});images.forEach(i=>i.close());
}
function prepareBalls(root:THREE.Group,hot:boolean){
 boundTextures(root,hot?256:512);
 const result:THREE.Mesh[]=[];
 for(let n=0;n<16;n++){
  const object=root.getObjectByName(`ball-${n}`);if(!(object instanceof THREE.Mesh))throw Error(`Missing numbered ball ${n}`);
  // Bake authored local rotation, discard the 4x4 display layout, match the shared physical radius and preserve UV identity.
  object.geometry.applyQuaternion(object.quaternion);object.quaternion.identity();
  const radiusScale=TABLE.ballRadius/.0451485; // Immutable authored GLB radius.
  object.geometry.scale(radiusScale,radiusScale,radiusScale);
  const m=object.material as THREE.MeshPhysicalMaterial;
  m.envMapIntensity=n===8?.7:.95;m.clearcoat=1;m.clearcoatRoughness=n===0?.17:.06;
  if(n===0){m.roughness=.24;m.clearcoat=.18;m.specularIntensity=.6;m.envMapIntensity=.65;}
  if(n!==0){
    m.roughness=.09;m.ior=1.52;m.thickness=.075;m.metalness=0;
    m.transmission=hot||n===8?0:.94;m.dispersion=hot?0:.035;
    m.attenuationColor.set(n<8?0xf24467:0xffc93e);m.attenuationDistance=.08;
    m.envMapIntensity=n===8?.6:.8;
    if(n===8){m.color.setRGB(.16,.18,.23);m.roughness=.18;m.clearcoat=.35;applyObsidianNumberFont(m);}else if(n>=9)m.color.setRGB(1,.83,.42);
    m.emissive.set(n===8?0x000000:n<8?0xff1545:0xffa719);m.emissiveIntensity=n===8?0:.065;
    if(n!==8 && m.map)applyJewelFinish(m,n,hot);
  }
  m.userData.crystalOptics={transmission:m.transmission,dispersion:m.dispersion};
  result[n]=object;
 }
 return result;
}
export function createDaylightJewelry(scene:THREE.Scene,table:THREE.Group,balls:THREE.Mesh[],redraw:()=>void){
 let disposed=false,ready=false,hot=false;const owned:THREE.Group[]=[];let sets:THREE.Mesh[][]=[];let tables:THREE.Group[]=[];
 const caustics=createGemCaustics(),light=caustics.mesh;scene.add(light);light.visible=false;
 const originalBalls=balls.map(b=>({geometry:b.geometry,material:b.material}));
 const state={status:'loading',tier:'balanced',error:''};
 styleCloth(table);
 const apply=()=>{
  if(!ready||disposed)return;const index=hot?1:0;tables.forEach((t,i)=>t.visible=i===index);
  balls.forEach((b,n)=>{b.geometry=sets[index][n].geometry;b.material=sets[index][n].material;});
  light.visible=true;state.tier=hot?'hot':'balanced';redraw();
 };
 // Retain failed-load fallback and clean late responses after scene unmount.
 Promise.all([tableUrl,tableHotUrl,ballsUrl,ballsHotUrl].map(async url=>{try{return {status:'fulfilled' as const,value:await loadGlb(url)};}catch(reason){return {status:'rejected' as const,reason};}})).then(results=>{
  const roots=results.flatMap(r=>r.status==='fulfilled'?[r.value.scene]:[]);
  const failure=results.find(r=>r.status==='rejected');if(failure){roots.forEach(release);throw Error(String(failure.reason));}if(disposed){roots.forEach(release);return;}owned.push(...roots);
  sets=[prepareBalls(roots[2],false),prepareBalls(roots[3],true)];tables=roots.slice(0,2);tables.forEach((t,i)=>styleTable(t,i===1));tables.forEach(t=>table.add(t));
  // Replace the old furniture only; cloth, cushion noses and pocket interiors retain the physics-derived shape.
  table.children.forEach(o=>{if(tables.includes(o as THREE.Group)||o.name==='studio-environment')return;
   const preserve=o.name==='table-cloth'||o.name.startsWith('cushion-')||o.name.startsWith('pocket-well-')||o.name.startsWith('pocket-bottom-');
   if(!preserve)o.visible=false;
  });
  const lining = table.getObjectByName('pocket-well-0') as THREE.Mesh;
  table.add(createPocketCollars(lining.material as THREE.Material));
  batchStaticTable(table);
  ready=true;state.status='ready';apply();
 }).catch(error=>{owned.splice(0).forEach(r=>{r.removeFromParent();release(r);});state.status='fallback';state.error=String(error);redraw();});
 return {state,setHot(value:boolean){if(hot===value)return;hot=value;apply();},get ready(){return ready;},sync(){if(ready&&light.visible)caustics.sync(balls);},dispose(){disposed=true;balls.forEach((b,n)=>Object.assign(b,originalBalls[n]));owned.forEach(r=>{r.removeFromParent();release(r);});caustics.dispose();}};
}
