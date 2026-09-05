// Research-only CPU inspection. Executes unchanged source with inert texture/canvas stubs.
// No WebGLRenderer, app constructor, game loop, build, network, or product file mutation.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const THREE = require('three'); const ts = require('typescript');
const root=process.cwd(); const cache=new Map(); const inputHashes={};
const texture=()=>new THREE.Texture();
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const input=fs.readFileSync(file,'utf8');inputHashes[path.relative(root,file)]=crypto.createHash('sha256').update(input).digest('hex');
  const mod={exports:{}};cache.set(file,mod);
  const req=id=>{
    if(id==='./textures'&&file.endsWith('/Scene3D.ts'))return {makeClothMaps:()=>({map:texture(),normalMap:texture(),roughnessMap:texture()}),makeWoodTexture:texture,makeLeatherTexture:texture};
    if(id.startsWith('.')) {let loc=path.resolve(path.dirname(file),id);if(fs.existsSync(loc+'.ts'))loc+='.ts';if(loc.endsWith('.ts'))return load(loc);return require(loc);}
    return require(id);
  };
  const js=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require','module',js)(mod.exports,req,mod);return mod.exports;
}
global.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
const {Scene3D}=load('src/Scene3D.ts');const {POCKETS,pocketLocalToWorld,worldToPocketLocal}=load('src/physics.ts');
const {pocketRenderProfile}=load('src/pocket-render/profile.ts');
const obj=Object.create(Scene3D.prototype);obj.tableGroup=new THREE.Group();obj.scene=new THREE.Scene();obj.buildTable();obj.tableGroup.updateMatrixWorld(true);
const meshes=obj.tableGroup.children.filter(o=>o.isMesh); const frame=obj.tableGroup.getObjectByName('table-wood-frame');
const ray=new THREE.Raycaster();
const cast=(x,z,y=.2,objects=meshes)=>{ray.set(new THREE.Vector3(x,y,z),new THREE.Vector3(0,-1,0));return ray.intersectObjects(objects,false);};
const vec=(a,i)=>new THREE.Vector3().fromBufferAttribute(a,i);
const toLocal=(p,v)=>{const l=worldToPocketLocal(p,v);return [l.lateral*1000,l.depth*1000,v.y*1000];};
const output={method:'Unmodified Scene3D.buildTable; texture/canvas stubs only; CPU BufferGeometry/ray casts, no rendered look claims',sourceFiles:inputHashes,threeRevision:THREE.REVISION,meshes:meshes.length,pockets:[]};
for(const p of POCKETS){
  const trim=obj.tableGroup.getObjectByName('pocket-top-trim-'+p.index);const g=trim.geometry;const a=g.attributes.position;const idx=g.index;const profile=pocketRenderProfile(p);
  const inner=[],outer=[];for(let i=0;i<a.count;i+=4){outer.push(toLocal(p,vec(a,i)));inner.push(toLocal(p,vec(a,i+1)));}
  const counts={topUp:0,topDown:0,degenerateTop:0,topOccluded:0,rawOpenEdges:0};let area=0;const topTriangles=[];const edges=new Map();
  for(let i=0;i<idx.count;i+=3){let ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];for(let j=0;j<3;j++){const edge=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(',');edges.set(edge,(edges.get(edge)||0)+1);}
    const vs=ids.map(j=>vec(a,j));if(vs.every(v=>Math.abs(v.y-.048)<1e-6)){
      const cross=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0]));if(cross.y>1e-12)counts.topUp++;else if(cross.y < -1e-12)counts.topDown++;else counts.degenerateTop++;
      area+=Math.abs(cross.y)/2;
      const center=vs[0].clone().add(vs[1]).add(vs[2]).multiplyScalar(1/3);const hits=cast(center.x,center.z);if(hits[0]?.object!==trim)counts.topOccluded++;
      topTriangles.push(vs.map(v=>toLocal(p,v)));
    }
  }
  counts.rawOpenEdges=[...edges.values()].filter(n=>n!==2).length;
  const frontEndpoints=[0,48].map(i=>({station:i,section:[0,.5,1].map(t=>{const v=vec(a,i*4+1).lerp(vec(a,i*4),t);const hits=cast(v.x,v.z,.041,meshes.filter(m=>!m.name.startsWith('pocket-')));return {local:toLocal(p,v),below:hits.slice(0,2).map(h=>({name:h.object.name||('unnamed:'+h.object.geometry.type),y:h.point.y*1000}))};})}));
  const rearWoodGaps=[];for(let i=12;i<=36;i++){const inP=vec(a,i*4+1),outP=vec(a,i*4);const direction=outP.clone().sub(inP).normalize();let found=null;for(let mm=0;mm<=60;mm+=.25){const v=outP.clone().addScaledVector(direction,mm/1000);const h=cast(v.x,v.z,.1,[frame])[0];if(h){found={offsetMm:mm,y:h.point.y*1000};break;}}rearWoodGaps.push({station:i,outer:outer[i],firstWood:found});}
  const centerline=[];for(let d=-15;d<=160;d+=.25){const v=pocketLocalToWorld(p,d/1000,0);const hits=cast(v.x,v.z);centerline.push({d,first:hits[0]?{name:hits[0].object.name,y:hits[0].point.y*1000}:null});}
  const spans=[];for(const s of centerline){let name=s.first?(s.first.name||'unnamed-mesh'):'no-hit';if(spans.at(-1)?.name===name)spans.at(-1).end=s.d;else spans.push({name,start:s.d,end:s.d,y:s.first?.y});}
  const jaws=obj.tableGroup.children.filter(m=>m.isMesh&&m.name.startsWith('cushion-p'+p.index+'-'));
  const jawTop=[];for(const m of jaws){const attr=m.geometry.attributes.position;const id=m.geometry.index;for(let k=0;k<id.count;k+=3){const vs=[0,1,2].map(j=>vec(attr,id.getX(k+j)));if(vs.every(v=>Math.abs(v.y-.038)<1e-6))jawTop.push(vs.map(v=>toLocal(p,v)));}}
  const woodContour=frame.geometry.parameters.shapes.holes[0].getPoints(12).map(v=>toLocal(p,{x:v.x,z:-v.y,y:.045})).filter(v=>Math.abs(v[0])<200&&v[1]>-120&&v[1]<200);
  output.pockets.push({index:p.index,kind:p.kind,position:{x:p.x,z:p.z},outward:p.outward,profile,counts,areaMm2:area*1e6,inner,outer,topTriangles,jawTop,woodContour,frontEndpoints,rearWoodGaps,centerlineSpans:spans,capSide:trim.material.side});
}
fs.writeFileSync('shots/pocket-trim-research-20260905/geometry-analysis.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output.pockets.map(({index,kind,counts,frontEndpoints,rearWoodGaps})=>({index,kind,counts,tipUnderlays:frontEndpoints.map(e=>e.section.map(s=>s.below[0])),maxRearWoodGapMm:Math.max(...rearWoodGaps.map(g=>g.firstWood?.offsetMm??NaN))})),null,2));
