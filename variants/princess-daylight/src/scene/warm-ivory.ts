/**
 * [INPUT]: 正常/热档预算；现有米制桌帮 UV，不读取外部素材。
 * [OUTPUT]: 可释放的暖象牙色图、R微起伏/G粗糙度合图与单层不透明材质。
 * [POS]: 开场末帧校色的奶油象牙工艺；固定种子周期骨纹，无裂纹、污渍、虹彩或透射。
 * [PROTOCOL]: 变更时更新此头部，然后检查 scene/CLAUDE.md。
 */
import * as THREE from 'three';

export interface WarmIvoryMaps { color: THREE.DataTexture; detail: THREE.DataTexture }

const smooth = (x: number) => x*x*x*(x*(x*6-15)+10);
const wrap = (x: number, size: number) => ((x % size) + size) % size;
function grainNoise(u: number, v: number, nx: number, ny: number, seed: number) {
  const x=u*nx, y=v*ny, ix=Math.floor(x), iy=Math.floor(y);
  const hash=(a:number,b:number)=>{
    let n=Math.imul(wrap(a,nx)+seed,374761393)^Math.imul(wrap(b,ny)+seed,668265263);
    n=Math.imul(n^(n>>>13),1274126177);
    return ((n^(n>>>16))>>>0)/4294967295*2-1;
  };
  const sx=smooth(x-ix),sy=smooth(y-iy);
  const a=hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx;
  const b=hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx;
  return a*(1-sy)+b*sy;
}

/** One 250 mm tile: quiet growth cloud, interrupted fibres and minute polish variation.
 * All frequencies wrap exactly; no screen-space grain or moving shader noise. */
export function createWarmIvoryMaps(hot=false): WarmIvoryMaps {
  const size=hot?256:512, color=new Uint8Array(size*size*4), detail=new Uint8Array(color.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    const cloud=grainNoise(u,v,4,4,17);
    const warp=grainNoise(u,v,4,6,39)*.014;
    const fibre=grainNoise(u+warp,v,72,8,71);
    const cross=grainNoise(u,v+warp,13,38,103);
    const pore=grainNoise(u,v,172,154,131);
    const tone=cloud*2.6+fibre*1.6+cross*.7+pore*.32;
    const i=(y*size+x)*4;
    // Warm cream remains a clean solid even in shadow; no dark aged veins.
    color.set([221+tone,203+tone*.94,166+tone*.8,255],i);
    detail.set([128+fibre*16+cross*7+pore*10,218+cloud*7-fibre*8+pore*5,0,255],i);
  }
  const texture=(bytes:Uint8Array,name:string,srgb:boolean)=>{
    const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
    t.name=name;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);
    t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
    t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;
    return t;
  };
  return {color:texture(color,'Warm ivory | clean bone colour',true),
    detail:texture(detail,'Warm ivory | microrelief and polish',false)};
}

/** The low clearcoat is a rubbed finish, not a resin shell; roughness map G
 * keeps the main reflection around .41, while 55 µm bump adds only fine relief. */
export function warmIvoryMaterial(hot=false,maps=createWarmIvoryMaps(hot),support=false) {
  const material=new THREE.MeshPhysicalMaterial({
    name:support?'Warm ivory | continuous support':'Warm ivory | upper rails',
    color:support?0xf3ead8:0xffffff,map:maps.color,
    bumpMap:maps.detail,bumpScale:hot?.00004:.000055,
    roughnessMap:maps.detail,roughness:support?.59:.48,metalness:0,
    clearcoat:support?.02:.045,clearcoatRoughness:.44,
    ior:1.49,specularIntensity:.38,envMapIntensity:.52,
    transmission:0,thickness:0,iridescence:0,
    transparent:false,opacity:1,side:THREE.FrontSide,depthWrite:true,
  });
  material.userData.ivoryFinish='opening-cream-ivory-20261104';
  return material;
}
