/** One continuous seated deck around the six unchanged pocket/cushion openings.
 * Removes the deformed authored upper fragments; lower body and legs stay put. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POCKETS } from '../physics';
import { pocketSeamContract } from '../pocket-render/seam-contract';
import { pocketRenderProfile } from '../pocket-render/profile';
import { createTableFrameGeometry, frameContours } from '../pocket-render/frame-geometry';
import { fairyRailMaterial } from './fairy-table-finish';

export const DECK_BOTTOM = -.10;

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

/** Ivory support, 1.5 mm elastic gasket, and the same .88 clear glass style.
 * They share one hole contour and touch at exact height planes, with no floating
 * independent pocket pieces and no extra opacity/transmission shell. */
export function addContinuousTableDeck(root: THREE.Group, hot: boolean, ivory: THREE.Material) {
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
  const glass=add('continuous-transparent-upper-rail',.036,.0675,.002,fairyRailMaterial(hot));
  glass.userData.fairyRole='upper-rail';
  // Keep the thin champagne edging, using the same rounded perimeter as glass.
  const {outer,directions,expansion}=frameContours(contracts);
  const path=outer.map((p,i)=>new THREE.Vector3(p.x+directions[i].x*(.003-.002+expansion),.0675,p.z+directions[i].z*(.003-.002+expansion)));
  const pieces:THREE.BufferGeometry[]=[];
  for(let i=0;i<path.length;i++){
    const a=path[i],b=path[(i+1)%path.length],delta=b.clone().sub(a),length=delta.length();
    if(length<1e-7)continue;
    const g=new THREE.CylinderGeometry(.0008,.0008,length,6,1,false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());g.applyMatrix4(inverse);pieces.push(g);
  }
  const trim=new THREE.Mesh(mergeGeometries(pieces,false)!,new THREE.MeshPhysicalMaterial({
    color:0xc8ac75,metalness:.82,roughness:.34,envMapIntensity:.72,
  }));pieces.forEach(g=>g.dispose());trim.name='continuous-champagne-perimeter';deck.add(trim);
  root.add(deck);return deck;
}
