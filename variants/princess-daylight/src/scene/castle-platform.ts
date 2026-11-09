/**
 * [INPUT]: THREE、合并几何与独占资源壳体。
 * [OUTPUT]: 暖米黄大理石平台、非条带细云纹/窄拼缝与柔和磨光、细纹大理石柱廊；无花台或绿植。
 * [POS]: 可玩露台渲染壳体；与开场暖石材衔接，不影响碰撞。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ownedWorldShell } from './world-shell';

/** 周期值噪声：自然云纹不使用等间距正弦脉络，避免地面出现巨大重复波浪。 */
function stoneNoise(u:number,v:number,nx:number,ny:number,seed:number) {
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y);
  const smooth=(t:number)=>t*t*t*(t*(t*6-15)+10);
  const hash=(a:number,b:number)=>{
    let h=Math.imul(((a%nx+nx)%nx)^seed,374761393)^Math.imul((b%ny+ny)%ny,668265263);
    h=Math.imul(h^(h>>>13),1274126177);
    return ((h^(h>>>16))>>>0)/4294967295*2-1;
  };
  const sx=smooth(x-ix),sy=smooth(y-iy);
  return (hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx)*(1-sy)
    +(hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx)*sy;
}

/** 一张512²图内四乘四暖石板；约0.68×0.78m/块，窄缝和低对比云纹分通道。 */
function stoneMaps() {
  const size=512;
  const canvases=Array.from({length:3},()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return canvas;});
  const contexts=canvases.map(canvas=>canvas.getContext('2d')!);
  const images=contexts.map(c=>c.createImageData(size,size));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,row=Math.floor(y/128),col=Math.floor(x/128);
    const localX=x%128,localY=y%128;
    const edge=Math.min(localX,128-localX,localY,128-localY);
    const cloud=stoneNoise(u,v,11,13,17);
    const mineral=stoneNoise(u+cloud*.015,v-cloud*.012,37,43,39);
    const fine=stoneNoise(u,v,83,91,71);
    const grain=stoneNoise(u,v,173,181,103);
    const tile=Math.sin(col*31.7+row*17.3)*1.3;
    // Sparse soft mineral edges; no continuous striped vein running across slabs.
    const vein=Math.max(0,.16-Math.abs(mineral+cloud*.22))/.16*(.35+.65*Math.max(0,fine));
    const seam=1-Math.min(1,edge/.65),bevel=1-Math.min(1,edge/1.4);
    const shade=cloud*4.8+mineral*3.3+fine*1.4+grain*.65+tile-vein*3.6-seam*13-bevel*1.4;
    const i=(y*size+x)*4;
    images[0].data.set([203+shade,188+shade*.94,162+shade*.85,255],i);
    const height=184-seam*65-bevel*6+fine*.7;
    images[1].data.set([height,height,height,255],i);
    const rough=218+cloud*4+mineral*4+vein*5+seam*20;
    images[2].data.set([rough,rough,rough,255],i);
  }
  const maps=canvases.map((canvas,i)=>{
    contexts[i].putImageData(images[i],0,0);
    const map=new THREE.CanvasTexture(canvas);
    map.name=['Terrace | warm cream mineral cloud','Terrace | narrow stone joints','Terrace | honed mineral roughness'][i];
    if(i===0)map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(3,3);map.anisotropy=4;
    return map;
  });
  return {color:maps[0],height:maps[1],roughness:maps[2],textures:maps};
}
/** 柱身专用连续石纹，无砖缝；暖白底、稀疏灰金矿脉与克制磨光。 */
function columnMarble() {
  const size=512,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    const cloud=stoneNoise(u,v,5,9,227),warp=stoneNoise(u,v,11,13,263);
    const mineral=stoneNoise(u+cloud*.045,v+warp*.025,17,23,317);
    const fine=stoneNoise(u,v,73,91,359);
    const vein=Math.pow(Math.max(0,1-Math.abs(mineral+cloud*.28)/.065),1.5);
    const shade=cloud*4.5+warp*2+fine*.6-vein*24;
    const i=(y*size+x)*4;
    data.set([225+shade,221+shade*.94,210+shade*.83,255],i);
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  map.name='Columns | warm marble grey-gold mineral veins';map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;
  const material=new THREE.MeshPhysicalMaterial({name:'Columns | softly polished marble',color:0xffffff,map,bumpMap:map,bumpScale:.00022,roughness:.43,metalness:0,clearcoat:.08,clearcoatRoughness:.42,specularIntensity:.42,envMapIntensity:.48});
  return {map,material};
}

export function createCastlePlatform(){
  const root=new THREE.Group();root.name='world-shell-castle';
  const stone=stoneMaps(),marble=columnMarble(),time={value:0};
  const materials={
    stone:new THREE.MeshPhysicalMaterial({color:0xf4f1e9,map:stone.color,bumpMap:stone.height,bumpScale:.0012,roughnessMap:stone.roughness,roughness:.67,metalness:0,clearcoat:.045,clearcoatRoughness:.50,specularIntensity:.28,envMapIntensity:.32}),
    ivory:new THREE.MeshStandardMaterial({color:0xc9bea4,roughness:.82}),
    edge:new THREE.MeshStandardMaterial({color:0x94866a,roughness:.67,metalness:.12}),
    column:marble.material,
  };
  type Kind=keyof typeof materials;
  const groups=new Map<Kind,THREE.BufferGeometry[]>();
  const add=(kind:Kind,g:THREE.BufferGeometry,x:number,y:number,z:number,rotation=0)=>{
    g.rotateY(rotation);g.translate(x,y,z);const part=g.index?g.toNonIndexed():g.clone();g.dispose();
    groups.set(kind,[...(groups.get(kind)??[]),part]);
  };
  const box=(kind:Kind,w:number,h:number,d:number,x:number,y:number,z:number)=>add(kind,new THREE.BoxGeometry(w,h,d),x,y,z);
  // Cut stone lip and two shallow steps, no full palace or mountain mesh.
  box('ivory',8.5,.24,9.8,0,-.96,0);box('edge',8.2,.055,9.5,0,-.813,0);
  box('stone',8.1,.09,9.4,0,-.744,0);
  for(const x of [-3.75,3.75])box('edge',.025,.002,8.7,x,-.697,0);
  for(const z of [-4.35,4.35])box('edge',7.5,.002,.025,0,-.697,z);
  // A restrained frame of contrasting marble around the playable furniture.
  for(const x of [-1.82,1.82])box('ivory',.11,.006,4.68,x,-.694,0);
  for(const z of [-2.34,2.34])box('ivory',3.75,.006,.11,0,-.694,z);
  for(const x of [-1.9,1.9])for(const z of [-2.43,2.43]){
    const medallion=new THREE.TorusGeometry(.10,.009,4,20);medallion.rotateX(Math.PI/2);add('edge',medallion,x,-.687,z);
  }
  const pillar=(x:number,z:number,r=.105,h=3.42)=>{
    const y=-.68;
    const g=new THREE.CylinderGeometry(r*.86,r,h,64,1),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const a=Math.atan2(p.getZ(i),p.getX(i)),flute=1-.055*(.5+.5*Math.cos(a*16));
      p.setX(i,p.getX(i)*flute);p.setZ(i,p.getZ(i)*flute);
    }
    g.computeVertexNormals();add('column',g,x,y+h/2,z);
    // Separate turned marble bases/capitals, seated below the visible floor surface.
    for(const dy of [0,.08,.15,h-.18,h-.10,h]) {
      const cap=dy>1,rr=r*(cap?1.35:1.5);
      add('column',new THREE.CylinderGeometry(rr,rr*1.06,.06,24),x,y+dy,z);
    }
    for(const dy of [.20,h-.23]){const ring=new THREE.TorusGeometry(r*1.02,.009,4,24);ring.rotateX(Math.PI/2);add('edge',ring,x,y+dy,z);}
  };
  const arch=(x:number,z:number,w:number,rotation=0)=>{
    const shape=new THREE.Shape(),r=w/2,h=1.10;
    shape.moveTo(-r,0);shape.quadraticCurveTo(-r*.86,h*.76,0,h);shape.quadraticCurveTo(r*.86,h*.76,r,0);
    shape.lineTo(r-.075,0);shape.quadraticCurveTo(r*.78,h*.62,0,h-.13);shape.quadraticCurveTo(-r*.78,h*.62,-r+.075,0);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false,curveSegments:10});g.translate(0,0,-.065);add('ivory',g,x,1.62,z,rotation);
  };
  for(const x of [-3.15,3.15])for(const z of [-3.2,0,3.2])pillar(x,z);
  for(const x of [-.98,.98])pillar(x,-4.0,.16,2.65);
  for(const x of [-3.15,3.15])for(const z of [-1.6,1.6])arch(x,z,3.2,Math.PI/2);
  for(const x of [-3.15,3.15]){box('ivory',.29,.11,6.6,x,2.82,0);box('edge',.30,.024,6.7,x,2.89,0);}
  // Fine terrace balustrade remains outside the camera/table envelope.
  for(const x of [-3.68,3.68]){
    for(let z=-3.8;z<=3.81;z+=.38){add('ivory',new THREE.LatheGeometry([new THREE.Vector2(.045,0),new THREE.Vector2(.023,.14),new THREE.Vector2(.033,.35),new THREE.Vector2(.024,.60)],6),x,-.68,z);}
    box('ivory',.15,.075,8.15,x,-.025,0);box('edge',.14,.015,8.13,x,.020,0);
  }
  for(const [kind,parts]of groups){const g=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());const mesh=new THREE.Mesh(g,materials[kind]);mesh.name='terrace-'+kind;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
  const fabric=new THREE.MeshPhysicalMaterial({color:0xfffdf2,roughness:.76,transparent:true,opacity:.27,side:THREE.DoubleSide,depthWrite:false,sheen:.8,sheenColor:0xffffff,sheenRoughness:.7,forceSinglePass:true});
  fabric.onBeforeCompile=shader=>{shader.uniforms.terraceTime=time;shader.vertexShader='uniform float terraceTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float loose=1.0-uv.y;
    transformed.x+=sin(terraceTime*.85+position.y*1.7)*loose*loose*.08;
    transformed.z+=sin(terraceTime*1.1+position.y*2.2)*loose*.035;
  `);};fabric.customProgramCacheKey=()=> 'terrace-sheer-v2';
  const drapes:THREE.BufferGeometry[]=[];
  for(const x of [-3.14,3.14])for(const z of [-1.6,1.6])for(const side of [-1,1]){
    const g=new THREE.PlaneGeometry(.66,2.6,7,9),p=g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getX(i)*32)*.034);g.computeVertexNormals();g.rotateY(Math.PI/2);g.translate(x,1.20,z+side*1.21);drapes.push(g.toNonIndexed());g.dispose();
  }
  const g=mergeGeometries(drapes)!;drapes.forEach(p=>p.dispose());const curtains=new THREE.Mesh(g,fabric);curtains.name='terrace-sheer-curtains';root.add(curtains);
  root.userData.updateVisual=(seconds:number)=>{time.value=seconds;};
  root.userData.visualScope='marble columns only; no floral modules or planters';
  root.userData.columnCentres=[[-.98,-4.0],[.98,-4.0],...[-3.15,3.15].flatMap(x=>[-3.2,0,3.2].map(z=>[x,z]))];
  return ownedWorldShell(root,[...stone.textures,marble.map]);
}
