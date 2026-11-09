/**
 * [INPUT]: Three.js renderer for the unchanged reflection environment; no external sky asset.
 * [OUTPUT]: 既有日光反射环境与独立512×256暖桃色天际/蓝天/蓝紫远山背景纹理。
 * [POS]: 反射与可见天空分离；天空由Scene3D统一释放，不加灯、网格或动画。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
export function createDaylightEnvironment(renderer:THREE.WebGLRenderer){
  const w=256,h=128,data=new Float32Array(w*h*4),sun=new THREE.Vector3(-3.8,5.8,-4.5).normalize();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const theta=(1-(y+.5)/h)*Math.PI,phi=(x+.5)/w*Math.PI*2-Math.PI;
    const dx=Math.sin(theta)*Math.cos(phi),dy=Math.cos(theta),dz=Math.sin(theta)*Math.sin(phi);
    const sky=Math.max(0,dy),sunDot=dx*sun.x+dy*sun.y+dz*sun.z;
    const glow=Math.exp((sunDot-1)*120)*18+Math.exp((sunDot-1)*12)*.65;
    const ground=THREE.MathUtils.lerp(.20,.48,THREE.MathUtils.smoothstep(dy,-.2,.2));
    const height=THREE.MathUtils.smoothstep(dy,.02,.18)*(1-THREE.MathUtils.smoothstep(dy,.78,.96));
    const opening=height*(Math.pow(Math.max(0,Math.cos(phi+.65)),28)*3.8+Math.pow(Math.max(0,Math.cos(phi-1.65)),42)*1.7);
    const i=(y*w+x)*4;data[i]=ground+sky*.24+glow+opening;data[i+1]=ground*.96+sky*.35+glow*.85+opening*.96;data[i+2]=ground*.86+sky*.58+glow*.65+opening*.86;data[i+3]=1;
  }
  const source=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(source);source.dispose();pmrem.dispose();return target.texture;
}

/** 可见天幕只做方向一致的蓝天到暖色地平线过渡；远山只占地平线数度。
 * CPU RGBA8 0.5 MiB，零mip；不送进PMREM，避免改动既有宝石球反射。 */
export function createCastleSkyBackground() {
  const width=512,height=256,bytes=new Uint8Array(width*height*4);
  const mix=(a:number[],b:number[],t:number)=>a.map((c,i)=>c+(b[i]-c)*t);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const elevation=(y/(height-1)-.5)*Math.PI,phi=x/(width-1)*Math.PI*2-Math.PI;
    const rise=THREE.MathUtils.smoothstep(elevation,0,.55);
    let color=mix([241,217,199],[140,178,205],rise);
    const glow=Math.pow(Math.max(0,Math.cos(phi+2.27)),8)*Math.exp(-Math.pow((elevation+.04)/.38,2))*.18;
    color=mix(color,[246,222,177],glow);
    const distant=-.05+.055*Math.sin(phi*3+.4)+.035*Math.cos(phi*7-1.2)+.016*Math.sin(phi*11);
    const near=-.18+.065*Math.sin(phi*2-.8)+.035*Math.cos(phi*5+.3);
    const silhouette=(ridge:number)=>1-THREE.MathUtils.smoothstep(elevation,ridge-.009,ridge+.009);
    color=mix(color,[172,176,195],silhouette(distant)*.55);
    color=mix(color,[141,160,181],silhouette(near)*.44);
    color=mix(color,[202,195,189],THREE.MathUtils.smoothstep(-elevation,.40,1.1));
    const i=(y*width+x)*4;bytes.set([...color.map(Math.round),255],i);
  }
  const sky=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);
  sky.name='Castle | warm horizon and distant hills';sky.colorSpace=THREE.SRGBColorSpace;
  sky.mapping=THREE.EquirectangularReflectionMapping;sky.wrapS=THREE.RepeatWrapping;
  sky.magFilter=sky.minFilter=THREE.LinearFilter;sky.generateMipmaps=false;sky.needsUpdate=true;
  return sky;
}
