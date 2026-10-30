/**
 * [INPUT]: 原始桌球 GLB、共享物理尺寸及宝石光学。
 * [OUTPUT]: 独立实验的清透宝石上缘、象牙下架、细圆弧护口与预算内宝石球。
 * [POS]: 实际 daylight GLB 视觉适配；消费共享袋口尺寸，不改球光学或照明。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyJewelFinish } from './jewel-ball-finish';
import { createGemCaustics } from './gem-caustics';
import { batchStaticTable } from '../minitool/render-guard';
import { loadGlb } from './glb-loader';
import { createDaylightEnvironment } from './daylight-environment';
import { TABLE, POCKETS } from '../physics';
import { splitFairyTableParts } from './fairy-table-finish';
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
    key.position.set(-3.8,5.8,-4.5);key.intensity=2.2;key.color.set(0xfff4e2);key.shadow.radius=3;
    scene.traverse(o=>{if(o instanceof THREE.AmbientLight)o.intensity=.10;if(o instanceof THREE.HemisphereLight){o.color.set(0xdceaff);o.groundColor.set(0x839479);o.intensity=.32;}});
    Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,far:24});key.shadow.camera.updateProjectionMatrix();
    scene.fog=new THREE.Fog(0xcfe2e5,50,230);scene.background=new THREE.Color(0xcfe2e5);
  }
  renderer.domElement.dataset.visualVersion='fairy-gem-rails-experiment-20261030';
}
function styleCloth(table:THREE.Group){
  table.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(o.name==='table-cloth'||o.name.startsWith('cushion-')))return;
    o.castShadow=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshPhysicalMaterial){m.color.set(0xf4fff9);m.roughness=.9;m.metalness=0;m.clearcoat=0;m.sheen=.18;m.sheenColor.set(0x5a9d85);m.sheenRoughness=.94;m.specularIntensity=.12;m.normalScale.set(.16,.16);m.envMapIntensity=.14;}
  });
}
function ivoryMap(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const context=canvas.getContext('2d')!,image=context.createImageData(512,256);
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){
    const u=x/512,v=y/256;
    // Low-contrast longitudinal grain, without the old broad nacre swirls or blue/pink shimmer.
    const grain=Math.sin(u*230+Math.sin(v*12)*1.2)*1.2+Math.sin(u*490+v*18)*.65;
    const growth=Math.sin(u*36+Math.sin(v*5)*.6)*1.8;
    image.data.set([232+grain+growth,222+grain+growth,199+grain+growth,255],(y*512+x)*4);
  }
  context.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}
function styleTable(root:THREE.Group,hot=false){
  const shell=ivoryMap(),replaced=new Set<THREE.Texture>();
  root.rotation.y=-Math.PI/2;root.position.set(-.81006,-.718,-1.44506);
  root.updateMatrixWorld(true);
  splitFairyTableParts(root,hot);
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
      // Upper shell-inlay rails were extracted above; lower Crystal/Pearl structure remains ivory.
      if(/Pearl|shell|inlay|Crystal/i.test(m.name)){
        if(m.map)replaced.add(m.map);m.map=shell;m.bumpMap=shell;m.bumpScale=.00008;
        m.color.set(0xe0cfac);m.metalness=0;m.roughness=.78;m.clearcoat=0;m.clearcoatRoughness=.65;
        m.transmission=0;m.transparent=false;m.opacity=1;m.iridescence=0;m.specularIntensity=.16;m.ior=1.48;m.envMapIntensity=.22;
      }
      if(/^Pocket/i.test(m.name)){m.color.set(0x244b42);m.roughness=.86;m.metalness=0;m.clearcoat=0;m.envMapIntensity=.28;}
      if(m.map)m.map.anisotropy=4;
    }
  });
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
function prepareBalls(root:THREE.Group,hot:boolean,numberMasks?:Array<THREE.Texture|undefined>){
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
    if(n===8){m.color.setRGB(.16,.18,.23);m.roughness=.18;m.clearcoat=.35;}else if(n>=9)m.color.setRGB(1,.83,.42);
    m.emissive.set(n===8?0x000000:n<8?0xff1545:0xffa719);m.emissiveIntensity=n===8?0:.065;
    if(n!==8 && m.map)applyJewelFinish(m,n,hot,numberMasks?.[n]);
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
  const numberMasks=Array.from({length:16},(_,n)=>((roots[2].getObjectByName(`ball-${n}`) as THREE.Mesh).material as THREE.MeshPhysicalMaterial).transmissionMap??undefined);
  sets=[prepareBalls(roots[2],false),prepareBalls(roots[3],true,numberMasks)];tables=roots.slice(0,2);tables.forEach((t,i)=>styleTable(t,i===1));tables.forEach(t=>table.add(t));
  // Replace the old furniture only; cloth, cushion noses and pocket interiors retain the physics-derived shape.
  table.children.forEach(o=>{if(tables.includes(o as THREE.Group)||o.name==='studio-environment')return;
   const preserve=o.name==='table-cloth'||o.name.startsWith('cushion-')||o.name.startsWith('pocket-well-')||o.name.startsWith('pocket-bottom-');
   if(!preserve)o.visible=false;
  });
  batchStaticTable(table);
  ready=true;state.status='ready';apply();
 }).catch(error=>{owned.splice(0).forEach(r=>{r.removeFromParent();release(r);});state.status='fallback';state.error=String(error);redraw();});
 return {state,setHot(value:boolean){if(hot===value)return;hot=value;apply();},get ready(){return ready;},sync(){if(ready&&light.visible)caustics.sync(balls);},dispose(){disposed=true;balls.forEach((b,n)=>Object.assign(b,originalBalls[n]));owned.forEach(r=>{r.removeFromParent();release(r);});caustics.dispose();}};
}
