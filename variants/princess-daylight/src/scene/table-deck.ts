/**
 * [INPUT]: 六袋共享边界、既有下架与共享暖象牙纹理。
 * [OUTPUT]: 连续承托/4mm圆润暖象牙上缘与帮面中央的六组对称卷草金丝镶嵌，不沿最外缘描边。
 * [POS]: 球桌视觉装配；金丝合成一个平面批次，留在实体帮面内，不改裁口与碰撞。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POCKETS } from '../physics';
import { pocketSeamContract } from '../pocket-render/seam-contract';
import { pocketRenderProfile } from '../pocket-render/profile';
import { createTableFrameGeometry, frameContours } from '../pocket-render/frame-geometry';
import { fairyRailMaterial } from './fairy-table-finish';
import { TABLE_RENDER } from '../pocket-render/cushion-geometry';
import type { WarmIvoryMaps } from './warm-ivory';

export const DECK_BOTTOM = -.10;

/** 帮面镶嵌以六段实体帮的中线定位，远离袋口、台呢和最外缘。 */
export function railFaceFiligreePaths(contracts: Parameters<typeof frameContours>[0]) {
  const {halfW,halfL,expansion}=frameContours(contracts);
  const x=halfW+expansion*.5-TABLE_RENDER.railWidth*.5;
  const z=halfL+expansion*.5-TABLE_RENDER.railWidth*.5;
  const local:THREE.Vector2[][]=[];
  const curve=(a:number[],b:number[],c:number[],d:number[],steps=10)=>new THREE.CubicBezierCurve(
    new THREE.Vector2(...a as [number,number]),new THREE.Vector2(...b as [number,number]),
    new THREE.Vector2(...c as [number,number]),new THREE.Vector2(...d as [number,number])).getPoints(steps);
  local.push([...curve([-.14,0],[-.05,.88],[.05,.88],[.14,0]),...curve([.14,0],[.05,-.88],[-.05,-.88],[-.14,0]).slice(1)]);
  for(const u of [-1,1])for(const v of [-1,1]){
    const mirror=(points:THREE.Vector2[])=>points.map(p=>new THREE.Vector2(p.x*u,p.y*v));
    local.push(mirror([...curve([.14,0],[.34,1.08],[.8,1.05],[.91,.10]),...curve([.91,.10],[.89,-.36],[.65,-.22],[.72,.12]).slice(1)]));
    local.push(mirror([...curve([.38,.56],[.46,.94],[.61,1.02],[.63,.71],8),...curve([.63,.71],[.54,.50],[.44,.47],[.38,.56],8).slice(1)]));
  }
  const panels=[
    ...[-1,1].flatMap(side=>[-1,1].map(end=>({x:x*side,z:.68*end,alongX:false,span:.34}))),
    ...[-1,1].map(end=>({x:0,z:z*end,alongX:true,span:.34})),
  ];
  return panels.flatMap(panel=>local.map(path=>path.map(p=>new THREE.Vector3(
    panel.x+(panel.alongX?p.x*panel.span:p.y*.021),.0678,
    panel.z+(panel.alongX?p.y*.021:p.x*panel.span)))));
}

/** 1.7mm 平面金属嵌丝；没有圆管壳体或额外透射/阴影批次。 */
function filigreeRibbon(path:THREE.Vector3[]) {
  const positions:number[]=[];
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<1e-8)continue;
    const nx=-dz/length*.00085,nz=dx/length*.00085;
    for(const p of [[a.x+nx,a.y,a.z+nz],[b.x+nx,b.y,b.z+nz],[a.x-nx,a.y,a.z-nz],
      [a.x-nx,a.y,a.z-nz],[b.x+nx,b.y,b.z+nz],[b.x-nx,b.y,b.z-nz]])positions.push(...p);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();return geometry;
}

/** Clip only the upper visual deck. Interpolate existing UV/normals at the
 * horizontal contact plane; no asset bytes, physical boundary or camera change. */
export function clipAuthoredUpperDeck(root: THREE.Group) {
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const source = o.geometry as THREE.BufferGeometry, g = source.index ? source.toNonIndexed() : source.clone();
    const p = g.getAttribute('position'), attributes = Object.entries(g.attributes);
    const output = new Map(attributes.map(([name]) => [name, [] as number[]]));
    const world = (i: number) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
    for (let i = 0; i < p.count; i += 3) {
      const triangle = [0, 1, 2].map(k => ({
        y: world(i+k).y,
        values: attributes.map(([, a]) => Array.from({length:a.itemSize}, (_, j) => a.getComponent(i+k,j))),
      }));
      const polygon: typeof triangle = [];
      for (let k = 0; k < 3; k++) {
        const a = triangle[k], b = triangle[(k+1)%3], insideA = a.y <= DECK_BOTTOM, insideB = b.y <= DECK_BOTTOM;
        if (insideA) polygon.push(a);
        if (insideA !== insideB) {
          const t = (DECK_BOTTOM-a.y)/(b.y-a.y);
          polygon.push({y:DECK_BOTTOM,values:a.values.map((v, n) => v.map((x, j) => x+(b.values[n][j]-x)*t))});
        }
      }
      for (let k=1;k+1<polygon.length;k++) for (const v of [polygon[0],polygon[k],polygon[k+1]]) {
        attributes.forEach(([name], n) => output.get(name)!.push(...v.values[n]));
      }
    }
    const replacement = new THREE.BufferGeometry();
    attributes.forEach(([name,a]) => replacement.setAttribute(name,new THREE.Float32BufferAttribute(output.get(name)!,a.itemSize)));
    replacement.computeBoundingSphere(); replacement.computeBoundingBox();
    o.geometry = replacement; if (!replacement.getAttribute('position').count) o.visible=false;
    source.dispose(); g.dispose();
  });
}

/** Ivory support, 1.5 mm elastic gasket, and a polished warm ivory upper rail.
 * They share one hole contour and touch at exact height planes, with no floating
 * independent pocket pieces and no extra opacity/transmission shell. */
export function addContinuousTableDeck(root: THREE.Group, hot: boolean, ivory: THREE.Material, maps?: WarmIvoryMaps) {
  const contracts = POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p)));
  const inverse = root.matrixWorld.clone().invert();
  const deck = new THREE.Group(); deck.name='continuous-six-pocket-deck';
  const add = (name:string,bottom:number,top:number,radius:number,material:THREE.Material) => {
    const g=createTableFrameGeometry(contracts,{bottom,top,radius}); g.applyMatrix4(inverse);
    const m=new THREE.Mesh(g,material);m.name=name;m.receiveShadow=true;m.castShadow=!hot;
    deck.add(m);return m;
  };
  add('continuous-ivory-support',DECK_BOTTOM,.0345,.002,ivory);
  add('continuous-recessed-gasket',.0345,.036,0,new THREE.MeshStandardMaterial({color:0x54665e,roughness:.88}));
  // 4mm 倒圆只收进上沿外缘；袋口内轮廓和最大包络不动。
  const bevel=.004;
  const rail=add('continuous-transparent-upper-rail',.036,.0675,bevel,fairyRailMaterial(hot,maps));
  rail.userData.fairyRole='upper-rail'; // Keep the stable mesh identity for existing inspection tools.
  const pieces=railFaceFiligreePaths(contracts).map(filigreeRibbon);
  const geometry=mergeGeometries(pieces,false)!;geometry.applyMatrix4(inverse);
  const trim=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({
    color:0xc29a52,metalness:.88,roughness:.34,envMapIntensity:.82,
  }));pieces.forEach(g=>g.dispose());trim.name='rail-face-gold-filigree';trim.receiveShadow=true;deck.add(trim);
  trim.userData.filigreePanels=6;
  root.add(deck);return deck;
}
