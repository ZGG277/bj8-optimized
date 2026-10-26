import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
// Source assets stay immutable; runtime geometry scales to the shared physical radius.
const authoredRadius=.0451485;
const glb=(name:string)=>{const b=readFileSync(new URL('../src/scene/assets/daylight/'+name,import.meta.url));expect(b.toString('ascii',0,4)).toBe('glTF');expect(b.readUInt32LE(8)).toBe(b.length);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
describe('daylight source asset contracts',()=>{
 for(const [tier,limit] of [['balanced',26000],['hot',14000],['refined',32000]] as const)it(`${tier} retains furniture within geometry allowance`,()=>{
  const d=glb(`table-${tier}.glb`);const triangles=d.meshes.flatMap((m:any)=>m.primitives).reduce((sum:number,p:any)=>sum+d.accessors[p.indices].count/3,0);
  expect(triangles).toBeLessThan(limit);expect(triangles).toBeGreaterThan(5000);
  for(const term of ['gold','Pearl','cloth','Crystal'])expect(d.materials.some((m:any)=>m.name.includes(term))).toBe(true);
  for(const a of d.accessors)for(const v of [...(a.min??[]),...(a.max??[])])expect(Number.isFinite(v)).toBe(true);
 });
 for(const tier of ['quality','hot'])it(`${tier}: all sixteen numbered assets retain radius and identity`,()=>{
  const d=glb(`balls-${tier}.glb`);const textureIds=new Set();
  for(let n=0;n<16;n++){
   const node=d.nodes.find((v:any)=>v.name===`ball-${n}`);expect(node).toBeTruthy();
   const p=d.meshes[node.mesh].primitives[0],position=d.accessors[p.attributes.POSITION];
   for(let axis=0;axis<3;axis++){expect(position.max[axis]).toBeCloseTo(authoredRadius,5);expect(position.min[axis]).toBeCloseTo(-authoredRadius,5);}
   const material=d.materials[p.material];expect(material.name).toMatch(new RegExp(String(n).padStart(2,'0')+'$'));textureIds.add(material.pbrMetallicRoughness.baseColorTexture.index);
  }
  expect(textureIds.size).toBe(16);
 });
});
