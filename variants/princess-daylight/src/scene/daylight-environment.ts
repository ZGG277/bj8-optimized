/** A single broad sky and warm sun reflection, replacing the multi-softbox studio. */
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
