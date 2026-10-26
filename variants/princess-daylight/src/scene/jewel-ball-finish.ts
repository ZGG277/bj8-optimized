/** Clear, bright gem bodies with moderate transmission and low absorption. Opaque belts and numeral masks remain paired; hot tier stays opaque. */
import * as THREE from 'three';
export const JEWEL_COLORS = ['#f4be21','#216ce2','#e9384b','#8946cd','#f57e24','#18b66b','#bd3855'] as const;
export function jewelColor(number:number){return number===8?'#202838':JEWEL_COLORS[(number-1)%8]??'#f8f1e4';}
export function pearlBelt(number:number,v:number){return number>=9&&Math.abs(v-.5)<.115;}
export function applyJewelFinish(m:THREE.MeshPhysicalMaterial,number:number,hot:boolean,numberMask?:THREE.Texture){
  const source=m.map!.image as HTMLCanvasElement|ImageBitmap,w=source.width,h=source.height;
  const maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;
  const mc=maskCanvas.getContext('2d')!;mc.drawImage((numberMask??m.transmissionMap)!.image as HTMLCanvasElement|ImageBitmap,0,0,w,h);
  const numeral=mc.getImageData(0,0,w,h).data;
  const make=()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const base=make(),trans=make(),rough=make();
  const canvases=[base,trans,rough],contexts=canvases.map(c=>c.getContext('2d')!),pixels=contexts.map(c=>c.createImageData(w,h));
  const color=jewelColor(number),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,belt=pearlBelt(number,(y+.5)/h),ink=1-numeral[i]/255;
    const shimmer=Math.sin(x/w*14+y/h*24)*2+Math.sin(x/w*31-y/h*12)*1.5;
    const body=belt?[238+shimmer,230+shimmer,214+shimmer]:rgb.map(v=>v*.92+255*.08);
    const digit=belt?[62,50,41]:[255,242,209];
    pixels[0].data.set([...body.map((v,k)=>Math.round(v*(1-ink)+digit[k]*ink)),255],i);
    const t=belt?0:numeral[i];pixels[1].data.set([t,t,t,255],i);
    // Pack nacre into R and roughness into G; transmission also masks body emission.
    const r=belt?90:24,p=belt?Math.round(255*(1-ink)):0;pixels[2].data.set([p,r,0,255],i);
  }
  const textures=canvases.map((c,i)=>{contexts[i].putImageData(pixels[i],0,0);const t=new THREE.CanvasTexture(c);t.flipY=m.map!.flipY;t.wrapS=THREE.RepeatWrapping;t.anisotropy=4;return t;});
  textures[0].colorSpace=THREE.SRGBColorSpace;
  m.userData.sourceTextures=[m.map,m.transmissionMap,m.roughnessMap,m.metalnessMap,m.emissiveMap];
  [m.map,m.transmissionMap,m.roughnessMap]=textures;
  m.iridescenceMap=textures[2];m.emissiveMap=textures[1];
  m.metalnessMap=null;m.color.set(0xffffff);m.metalness=0;m.roughness=1;
  m.transmission=hot?0:.66;m.ior=1.52;m.thickness=.075;
  m.attenuationColor.set(color).lerp(new THREE.Color(0xffffff),.16);m.attenuationDistance=.50;
  m.emissive.set(color);m.emissiveIntensity=hot?.035:0;
  m.clearcoat=.28;m.clearcoatRoughness=.10;m.envMapIntensity=1.05;
  if(!hot){
    m.onBeforeCompile=shader=>{
      const transmission=THREE.ShaderChunk.transmission_fragment
        .replace('material.thickness = thickness;', 'material.thickness = thickness * max(0.12, dot(normal, normalize(vViewPosition)));')
        .replace('material.transmissionAlpha = mix(', `
          #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
            vec3 skyDirection = refract(-v, n, 1.0 / material.ior);
            vec3 skyLight = textureCubeUV(envMap, envMapRotation * skyDirection, 0.08).rgb;
            transmitted.rgb += skyLight * material.attenuationColor * material.diffuseContribution * 0.28;
          #endif
          material.transmissionAlpha = mix(`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission);
    };
    m.customProgramCacheKey=()=> 'clear-bright-gem-v6';
  }
  m.sheen=0;m.sheenColorMap=null;
  m.iridescence=number>=9?.22:0;m.iridescenceIOR=1.32;m.iridescenceThicknessRange=[260,390];
  m.userData.finish=number>=9?'colored-gem-with-pearl-belt':'colored-clear-gem';
}
