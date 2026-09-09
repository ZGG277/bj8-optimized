import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster} from 'three';
const out='assets/blender/billiards-room-v1/repair-evidence';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function load(p){const b=await readFile(p);const root=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;root.updateMatrixWorld(true);return root;}
const before=await load(`${out}/original-billiards-room-v1.glb`),after=await load('src/scene/assets/billiards-room-v1.glb');
let preserved=0;
before.traverse(o=>{if(!o.isMesh)return;const n=after.getObjectByName(o.name);assert(n,`Missing original mesh ${o.name}`);
 assert.deepEqual(n.matrixWorld.toArray(),o.matrixWorld.toArray());
 for(const name of Object.keys(o.geometry.attributes))assert.deepEqual(n.geometry.attributes[name].array,o.geometry.attributes[name].array,`${o.name} ${name} changed`);
 assert.deepEqual(n.geometry.index.array,o.geometry.index.array);preserved++;
});
const underlap=after.getObjectByName('BJ8_ClothUnderlap'),aprons=after.getObjectByName('BJ8_MiddlePocketAprons');
assert(underlap&&aprons);
const refs=JSON.parse(await readFile('assets/blender/table-craft-v2/runtime-surface-reference.json','utf8'));
let supported=0;
for(const r of refs.filter(r=>r.name.startsWith('cushion-'))){
 const p=r.positions,at=i=>new Vector3(p[3*i],p[3*i+1],p[3*i+2]);
 const front=at(8).add(at(9)).multiplyScalar(.5),back=at(0).add(at(1)).multiplyScalar(.5);
 const sample=front.lerp(back,.2);sample.y=.0001;
 const hit=new Raycaster(sample,new Vector3(0,-1,0),0,.002).intersectObject(underlap)[0];
 assert(hit,`${r.name} still lacks underlap`);assert(Math.abs(hit.point.y+.0004)<1e-7);supported++;
}
for(const sign of [-1,1]){
 assert(new Raycaster(new Vector3(sign*.9,-.12,0),new Vector3(-sign,0,0),0,.3).intersectObject(aprons).length,'Middle apron still open');
 assert.equal(new Raycaster(new Vector3(sign*.68,.01,0),new Vector3(0,-1,0),0,.3).intersectObjects([underlap,aprons]).length,0,'Side pocket cavity blocked');
}
const originalBlendSha=digest(await readFile('assets/blender/billiards-room-v1/quiet-room-v1.blend'));
assert.equal(originalBlendSha,'48f168d82800b1d75c722ffc32ad1818acf4a70f83559deeb62205364eaf41f5');
const report={passed:true,preservedOriginalMeshes:preserved,unchangedOriginalBlendSha256:originalBlendSha,supportedCushionSegments:supported,closedMiddleAprons:2,sidePocketCavityChecks:2,files:{}};
for(const p of ['src/scene/assets/billiards-room-v1.glb','assets/blender/billiards-room-v1/quiet-room-v1-repaired.blend','assets/blender/billiards-room-v1/repair-table.py']){const b=await readFile(p);report.files[p]={bytes:b.length,sha256:digest(b)};}
await writeFile(`${out}/structure-and-hashes.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
