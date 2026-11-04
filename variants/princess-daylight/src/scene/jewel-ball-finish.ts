/**
 * [INPUT]: 既有宝石材质/UV、球号、热档与已就绪的统一霞鹜文楷。
 * [OUTPUT]: 原色宝石及珠光腰带，深色台呢下仍清晰的透光/表面反射；黑8只重绘号码图。
 * [POS]: 材质/纹理适配层，保留原GLB、球径、光学与批次预算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md。
 */
import * as THREE from 'three';
import { canvasFont, UI_FONT_FAMILY } from '../typography';
/** Authored atlas stations: opposite faces at u=.25/.75, v=.5. */
function paintNumbers(ctx:CanvasRenderingContext2D,w:number,h:number,number:number,color:string){
  ctx.font=canvasFont(h*.18,700);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  for(const u of [.25,.75])ctx.fillText(String(number),w*u,h*.5,w*.18);
}
export function applyObsidianNumberFont(m:THREE.MeshPhysicalMaterial){
  if(!m.map)return;
  const original=m.map,source=original.image as HTMLCanvasElement|ImageBitmap,w=source.width,h=source.height;
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);
  // The authored black-8 map has a flat body colour; preserve it outside the two number patches.
  const bg=ctx.getImageData(0,0,1,1).data;ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;
  for(const u of [.25,.75])ctx.fillRect(w*(u-.1),h*.34,w*.2,h*.32);
  paintNumbers(ctx,w,h,8,'#fff2d1');
  const map:THREE.Texture=new THREE.CanvasTexture(c);map.copy(original);map.source=new THREE.Source(c);map.needsUpdate=true;
  m.map=map;m.userData.sourceTextures=[...(m.userData.sourceTextures??[]),original];m.userData.numberFont=UI_FONT_FAMILY;
}
export const JEWEL_COLORS = ['#f4be21','#216ce2','#e9384b','#8946cd','#f57e24','#18b66b','#bd3855'] as const;
export function jewelColor(number:number){return number===8?'#202838':JEWEL_COLORS[(number-1)%8]??'#f8f1e4';}
export function pearlBelt(number:number,v:number){return number>=9&&Math.abs(v-.5)<.115;}
export function applyJewelFinish(m:THREE.MeshPhysicalMaterial,number:number,hot:boolean){
  const source=m.map!.image as HTMLCanvasElement|ImageBitmap,w=source.width,h=source.height;
  const maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;
  const mc=maskCanvas.getContext('2d')!;mc.fillStyle='#ffffff';mc.fillRect(0,0,w,h);paintNumbers(mc,w,h,number,'#000000');
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
    // Keep the pearl belt soft; the clear body needs a sharper transmitted image on the darker felt.
    const r=belt?90:16,p=belt?Math.round(255*(1-ink)):0;pixels[2].data.set([p,r,0,255],i);
  }
  const textures=canvases.map((c,i)=>{contexts[i].putImageData(pixels[i],0,0);const t=new THREE.CanvasTexture(c);t.flipY=m.map!.flipY;t.wrapS=THREE.RepeatWrapping;t.anisotropy=4;return t;});
  textures[0].colorSpace=THREE.SRGBColorSpace;
  m.userData.sourceTextures=[m.map,m.transmissionMap,m.roughnessMap,m.metalnessMap,m.emissiveMap];
  m.userData.numberFont=UI_FONT_FAMILY;
  [m.map,m.transmissionMap,m.roughnessMap]=textures;
  m.iridescenceMap=textures[2];m.emissiveMap=textures[1];
  m.metalnessMap=null;m.color.set(0xffffff);m.metalness=0;m.roughness=1;
  m.transmission=hot?0:.82;m.ior=1.52;m.thickness=.075;
  m.attenuationColor.set(color).lerp(new THREE.Color(0xffffff),.16);m.attenuationDistance=.50;
  m.emissive.set(color);m.emissiveIntensity=hot?.035:0;
  m.clearcoat=.28;m.clearcoatRoughness=.10;m.envMapIntensity=1.25;
  if(!hot){
    m.onBeforeCompile=shader=>{
      const transmission=THREE.ShaderChunk.transmission_fragment
        .replace('material.thickness = thickness;', 'material.thickness = thickness * max(0.12, dot(normal, normalize(vViewPosition)));')
        .replace('material.transmissionAlpha = mix(', `
          #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
            vec3 skyDirection = refract(-v, n, 1.0 / material.ior);
            vec3 skyLight = textureCubeUV(envMap, envMapRotation * skyDirection, 0.08).rgb;
            transmitted.rgb += skyLight * material.attenuationColor * material.diffuseContribution * 0.56;
          #endif
          material.transmissionAlpha = mix(`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission);
    };
    m.customProgramCacheKey=()=> 'clear-bright-gem-v7';
  }
  m.sheen=0;m.sheenColorMap=null;
  m.iridescence=number>=9?.22:0;m.iridescenceIOR=1.32;m.iridescenceThicknessRange=[260,390];
  m.userData.finish=number>=9?'colored-gem-with-pearl-belt':'colored-clear-gem';
  m.userData.finishVersion='clear-bright-gem-v7';
}
