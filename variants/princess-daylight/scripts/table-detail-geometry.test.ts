import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe,it,expect } from 'vitest';
import { CUSHION_SEGMENTS, POCKETS } from '../src/physics';
import { cushionOffsetPoint } from '../src/pocket-render/cushion-offset';
import { CUSHION_PROFILE, makeCushionGeometry, createTableUnderlapGeometry } from '../src/pocket-render/cushion-geometry';
import { clipAuthoredUpperDeck, addContinuousTableDeck, DECK_BOTTOM } from '../src/scene/table-deck';
import { splitFairyTableParts, retireAuthoredPocketAssembly } from '../src/scene/fairy-table-finish';
function tableFixture(hot: boolean) {
  const file = readFileSync(new URL(`../src/scene/assets/daylight/table-${hot ? 'hot' : 'refined'}.glb`, import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const binary = file.subarray(28 + jsonLength);
  const attribute = (index: number) => {
    const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
    const size = accessor.type === 'VEC3' ? 3 : 1;
    const bytes = accessor.componentType === 5123 ? 2 : 4;
    const values: number[] = [];
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < size; k++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * bytes) + k * bytes;
      values.push(accessor.componentType === 5126 ? binary.readFloatLE(offset)
        : bytes === 2 ? binary.readUInt16LE(offset) : binary.readUInt32LE(offset));
    }
    return { values, size };
  };
  const root = new THREE.Group();
  for (const primitive of doc.meshes[0].primitives) {
    const p = attribute(primitive.attributes.POSITION);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p.values, p.size));
    geometry.setIndex(attribute(primitive.indices).values);
    const material = new THREE.MeshPhysicalMaterial({ name: doc.materials[primitive.material].name });
    root.add(new THREE.Mesh(geometry, material));
  }
  root.rotation.y = -Math.PI / 2; root.position.set(-.81006, -.718, -1.44506);
  root.updateMatrixWorld(true);
  return root;
}

const key=(v:THREE.Vector3)=>v.toArray().map(x=>x.toFixed(6)).join(',');
function metrics(gs:THREE.BufferGeometry[]){
 const edges=new Map<string,number>(),triangles=new Set<string>();let degenerate=0,duplicates=0,count=0;
 for(const g of gs){const p=g.getAttribute('position');for(let i=0;i<(g.index?.count??p.count);i+=3){
  const a=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,g.index?.getX(i+k)??i+k));
  if(a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])).lengthSq()<1e-20)degenerate++;
  const tri=a.map(key).sort().join('|');if(triangles.has(tri))duplicates++;triangles.add(tri);count++;
  for(let k=0;k<3;k++){const e=[key(a[k]),key(a[(k+1)%3])].sort().join('|');edges.set(e,(edges.get(e)??0)+1);}
 }}return {triangles:count,degenerate,duplicates,boundaryEdges:[...edges.values()].filter(n=>n===1).length,nonManifoldEdges:[...edges.values()].filter(n=>n>2).length};
}
const evidence:any={};
describe('D2 actual six-pocket geometry',()=>{
 it('removes all twelve folded rail-jaw offsets without moving any physical nose',()=>{
  let backwards=0;for(const s of CUSHION_SEGMENTS)for(const [offset] of CUSHION_PROFILE){
   const a=cushionOffsetPoint(s,s.a,offset,CUSHION_SEGMENTS),b=cushionOffsetPoint(s,s.b,offset,CUSHION_SEGMENTS);
   if((b.x-a.x)*(s.b.x-s.a.x)+(b.z-a.z)*(s.b.z-s.a.z)<-1e-12){backwards++;}
   if(offset===0){expect(a).toEqual(s.a);expect(b).toEqual(s.b);}
  }evidence.backwards=backwards;expect(backwards).toBe(0);
 });
 it('has no degenerate or duplicate triangles or open seams in the complete cushion assembly',()=>{
  const after=CUSHION_SEGMENTS.map(s=>makeCushionGeometry(s));
  evidence.cushions={d2:metrics(after)};
  expect(evidence.cushions.d2.degenerate).toBe(0);expect(evidence.cushions.d2.duplicates).toBe(0);
  expect(evidence.cushions.d2.boundaryEdges).toBe(0);expect(evidence.cushions.d2.nonManifoldEdges).toBe(0);
  const under=createTableUnderlapGeometry();evidence.underlap=metrics([under]);expect(evidence.underlap.degenerate).toBe(0);expect(evidence.underlap.boundaryEdges).toBe(0);under.dispose();
  after.forEach(g=>g.dispose());
 });
 it('keeps all complete lower-body triangles and creates a continuous seated transparent deck for both LODs',()=>{
  evidence.deck=[];
  for(const hot of [false,true]){
   const root=tableFixture(hot);splitFairyTableParts(root,hot);retireAuthoredPocketAssembly(root);
   const lower=()=>{const rows:string[]=[];root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.name.startsWith('continuous-'))return;const g=o.geometry,p=g.getAttribute('position');for(let i=0;i<(g.index?.count??p.count);i+=3){const a=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,g.index?.getX(i+k)??i+k).applyMatrix4(o.matrixWorld));if(a.every(v=>v.y<-.2))rows.push(a.map(key).join('|'));}});return rows;};
   const before=lower();clipAuthoredUpperDeck(root);expect(lower()).toEqual(before);
   const deck=addContinuousTableDeck(root,hot,new THREE.MeshPhysicalMaterial({color:0xe0cfac}));root.updateMatrixWorld(true);
   const meshes=deck.children as THREE.Mesh[],rows=[];
   for(const m of meshes.slice(0,3)){
    const g=m.geometry.clone().applyMatrix4(m.matrixWorld);g.computeBoundingBox();const data=metrics([g]);rows.push({name:m.name,...data,bounds:g.boundingBox});
    expect(data.degenerate,m.name).toBe(0);expect(data.boundaryEdges,m.name).toBe(0);
    for(const p of POCKETS){const ray=new THREE.Raycaster(new THREE.Vector3(p.mouthCenter.x,.15,p.mouthCenter.z),new THREE.Vector3(0,-1,0));expect(ray.intersectObject(m).length).toBe(0);}
    g.dispose();
   }
   expect(rows[0].bounds!.min.y).toBeCloseTo(DECK_BOTTOM,6);
   expect(rows[0].bounds!.max.y).toBeCloseTo(rows[1].bounds!.min.y,6);
   expect(rows[1].bounds!.max.y).toBeCloseTo(rows[2].bounds!.min.y,6);
   evidence.deck.push({hot,rows});
  }
  
 });
});
