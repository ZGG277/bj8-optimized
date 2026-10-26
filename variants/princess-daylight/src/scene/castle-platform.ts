/**
 * [INPUT]: THREE、合并几何与独占资源壳体。
 * [OUTPUT]: 暖灰大理石平台、细石纹/细拼缝与柔和磨光、哑光柱廊；不含远景城堡。
 * [POS]: 可玩露台渲染壳体；与开场暖石材衔接，不影响碰撞。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ownedWorldShell } from './world-shell';

/** 大块暖灰大理石：色纹、细缝高度与柔和磨光分别编码，仍只有一批地面。 */
function stoneMaps() {
  const size=512;
  const canvases=Array.from({length:3},()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;return canvas;});
  const contexts=canvases.map(canvas=>canvas.getContext('2d')!);
  const images=contexts.map(c=>c.createImageData(size,size));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    const row=Math.floor(y/256),offset=row%2*128,col=Math.floor((x+offset)/256);
    const localX=(x+offset)%256,localY=y%256;
    const edge=Math.min(localX,256-localX,localY,256-localY);
    const warp=.8*Math.sin(u+2*v)+.32*Math.sin(3*u-2*v)+.13*Math.sin(7*u+5*v);
    const vein=Math.exp(-Math.abs(Math.sin(2*u+3*v+warp))*29);
    const branch=Math.exp(-Math.abs(Math.sin(3*u+5*v+warp*.7+.8))*48);
    const cloud=3.5*Math.sin(u+v)+2.5*Math.cos(2*u-v);
    const grain=Math.sin(x*1.7+y*.93)*.7+Math.sin(x*.21-y*.37)*.5;
    const tile=Math.sin((col%2)*31.7+row*17.3)*2.8;
    const seam=1-Math.min(1,edge/1.35),bevel=1-Math.min(1,edge/3);
    const shade=cloud+grain+tile-vein*23-branch*8-seam*24-bevel*3;
    const i=(y*size+x)*4;
    images[0].data.set([194+shade,190+shade,180+shade,255],i);
    const height=184-seam*90-bevel*12+grain*.5;
    images[1].data.set([height,height,height,255],i);
    const rough=210+cloud*1.5+vein*18+seam*28;
    images[2].data.set([rough,rough,rough,255],i);
  }
  const maps=canvases.map((canvas,i)=>{
    contexts[i].putImageData(images[i],0,0);
    const map=new THREE.CanvasTexture(canvas);
    if(i===0)map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(3,3);map.anisotropy=4;
    return map;
  });
  return {color:maps[0],height:maps[1],roughness:maps[2],textures:maps};
}
export function createCastlePlatform(){
  const root=new THREE.Group();root.name='world-shell-castle';
  const stone=stoneMaps(),time={value:0};
  const materials={
    stone:new THREE.MeshPhysicalMaterial({color:0xf4f1e9,map:stone.color,bumpMap:stone.height,bumpScale:.003,roughnessMap:stone.roughness,roughness:.60,metalness:0,clearcoat:.10,clearcoatRoughness:.44,specularIntensity:.32,envMapIntensity:.38}),
    ivory:new THREE.MeshStandardMaterial({color:0xc9bea4,roughness:.82}),
    edge:new THREE.MeshStandardMaterial({color:0x94866a,roughness:.67,metalness:.12}),
    sage:new THREE.MeshStandardMaterial({color:0x719181,roughness:.75,side:THREE.DoubleSide}),
  };
  type Kind=keyof typeof materials;
  const groups=new Map<Kind,THREE.BufferGeometry[]>();
  const add=(kind:Kind,g:THREE.BufferGeometry,x:number,y:number,z:number,rotation=0)=>{
    g.rotateY(rotation);g.translate(x,y,z);const part=g.index?g.toNonIndexed():g.clone();g.dispose();
    groups.set(kind,[...(groups.get(kind)??[]),part]);
  };
  const box=(kind:Kind,w:number,h:number,d:number,x:number,y:number,z:number)=>add(kind,new THREE.BoxGeometry(w,h,d),x,y,z);
  const line=(kind:Kind,points:THREE.Vector3[],radius=.012)=>add(kind,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,radius,3,false),0,0,0);
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
  const pillar=(x:number,z:number)=>{
    const y=-.68,h=3.42,r=.105;
    const g=new THREE.CylinderGeometry(r*.78,r,h,16,1),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i)),f=1+.045*Math.cos(a*8);p.setX(i,p.getX(i)*f);p.setZ(i,p.getZ(i)*f);}g.computeVertexNormals();add('ivory',g,x,y+h/2,z);
    for(const dy of [0,.10,h-.13,h]){const top=dy>1;add('ivory',new THREE.CylinderGeometry(top?.18:.20,top?.13:.21,.075,12),x,y+dy,z);}
    for(const dy of [.17,h-.20]){const ring=new THREE.TorusGeometry(.108,.014,5,16);ring.rotateX(Math.PI/2);add('edge',ring,x,y+dy,z);}
    for(let k=0;k<6;k++){const a=k*Math.PI/3;line('ivory',[new THREE.Vector3(x,y+h-.44,z),new THREE.Vector3(x+Math.cos(a)*.09,y+h-.18,z+Math.sin(a)*.09),new THREE.Vector3(x+Math.cos(a)*.18,y+h-.07,z+Math.sin(a)*.18)],.014);}
  };
  const arch=(x:number,z:number,w:number,rotation=0)=>{
    const shape=new THREE.Shape(),r=w/2,h=1.10;
    shape.moveTo(-r,0);shape.quadraticCurveTo(-r*.86,h*.76,0,h);shape.quadraticCurveTo(r*.86,h*.76,r,0);
    shape.lineTo(r-.075,0);shape.quadraticCurveTo(r*.78,h*.62,0,h-.13);shape.quadraticCurveTo(-r*.78,h*.62,-r+.075,0);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:false,curveSegments:10});g.translate(0,0,-.065);add('ivory',g,x,1.62,z,rotation);
  };
  for(const x of [-3.15,3.15])for(const z of [-3.2,0,3.2])pillar(x,z);
  for(const x of [-3.15,3.15])for(const z of [-1.6,1.6])arch(x,z,3.2,Math.PI/2);
  for(const x of [-3.15,3.15]){box('ivory',.29,.11,6.6,x,2.82,0);box('edge',.30,.024,6.7,x,2.89,0);}
  // Fine terrace balustrade remains outside the camera/table envelope.
  for(const x of [-3.68,3.68]){
    for(let z=-3.8;z<=3.81;z+=.38){add('ivory',new THREE.LatheGeometry([new THREE.Vector2(.045,0),new THREE.Vector2(.023,.14),new THREE.Vector2(.033,.35),new THREE.Vector2(.024,.60)],6),x,-.68,z);}
    box('ivory',.15,.075,8.15,x,-.025,0);box('edge',.14,.015,8.13,x,.020,0);
  }
  for(const x of [-2.78,2.78])for(const z of [-3.92,3.92]){
    add('ivory',new THREE.CylinderGeometry(.24,.18,.30,12),x,-.53,z);
    for(let j=0;j<8;j++){
      const a=j*2.399,r=.12+(j%3)*.075,h=.26+(j%4)*.095;
      line('sage',[new THREE.Vector3(x,-.39,z),new THREE.Vector3(x+Math.cos(a)*r*.55,-.26+h*.4,z+Math.sin(a)*r*.55),new THREE.Vector3(x+Math.cos(a)*r,-.39+h,z+Math.sin(a)*r)],.008);
      const leaf=new THREE.SphereGeometry(.095,5,3);leaf.scale(.38,1,.12);leaf.rotateZ(.45);add('sage',leaf,x+Math.cos(a)*r,-.39+h,z+Math.sin(a)*r,a);
    }
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
  root.userData.visualScope='playable terrace only; distant architecture is not modeled';
  return ownedWorldShell(root,stone.textures);
}
