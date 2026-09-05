// CPU-only evidence. Product source is evaluated unchanged; only texture/Canvas calls are inert.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const THREE = require('three'), ts = require('typescript');
const cache = new Map(), hashes = {};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const code = fs.readFileSync(file, 'utf8');
  hashes[path.relative(process.cwd(), file)] = crypto.createHash('sha256').update(code).digest('hex');
  const mod = { exports: {} }; cache.set(file, mod);
  function req(id) {
    if (id === './textures' && file.endsWith('/Scene3D.ts')) return {
      makeClothMaps: () => ({ map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() }),
      makeWoodTexture: () => new THREE.Texture(), makeLeatherTexture: () => new THREE.Texture(),
    };
    if (id.startsWith('.')) {
      let target = path.resolve(path.dirname(file), id);
      if (fs.existsSync(target + '.ts')) target += '.ts';
      return target.endsWith('.ts') ? load(target) : require(target);
    }
    return require(id);
  }
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'module', 'require', js)(mod.exports, mod, req);
  return mod.exports;
}
global.document = { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const { Scene3D } = load('src/Scene3D.ts');
const { POCKETS, pocketLocalToWorld } = load('src/physics.ts');
const { pocketSeamContract } = load('src/pocket-render/seam-contract.ts');
const { pocketRenderProfile } = load('src/pocket-render/profile.ts');
const scene = Object.create(Scene3D.prototype); scene.tableGroup = new THREE.Group(); scene.scene = new THREE.Scene(); scene.buildTable();
scene.tableGroup.updateMatrixWorld(true);
const meshes = scene.tableGroup.children.filter(o => o.isMesh);
function triangles(g) {
  const a = g.attributes.position, index = g.index;
  return Array.from({ length: (index?.count ?? a.count) / 3 }, (_, i) => [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(a, index ? index.getX(i * 3 + k) : i * 3 + k)));
}
const down = (p, list, y = .2) => new THREE.Raycaster(new THREE.Vector3(p.x, y, p.z), new THREE.Vector3(0, -1, 0)).intersectObjects(list, false);
function metrics(g) {
  const edges = new Map(); let volume=0, degenerate=0;
  const key=v=>[v.x,v.y,v.z].map(n=>Math.round(n/1e-6)).join(',');
  for(const [a,b,c] of triangles(g)) {
    if(b.clone().sub(a).cross(c.clone().sub(a)).length()<=1e-10) degenerate++;
    volume+=a.dot(b.clone().cross(c))/6;
    const vs=[a,b,c]; for(let i=0;i<3;i++) {
      const x=key(vs[i]),y=key(vs[(i+1)%3]),k=[x,y].sort().join('|');
      const e=edges.get(k)||{count:0,direction:0};e.count++;e.direction+=x<y?1:-1;edges.set(k,e);
    }
  }
  return {triangles:triangles(g).length,degenerate,nonManifoldEdges:[...edges.values()].filter(e=>e.count!==2).length,inconsistentEdges:[...edges.values()].filter(e=>e.direction!==0).length,signedVolume:volume};
}
const output = { method: 'Unmodified Scene3D.buildTable, texture stubs, no WebGL or app constructor', sourceFiles: hashes, tableMeshCount: meshes.length, pockets: [] };
output.wood=metrics(scene.tableGroup.getObjectByName('table-wood-frame').geometry);
for (const p of POCKETS) {
  const contract = pocketSeamContract(p, pocketRenderProfile(p));
  const trim = scene.tableGroup.getObjectByName('pocket-top-trim-' + p.index);
  const g = trim.geometry, tris = triangles(g), top = tris.filter(t => t.every(v => v.y >= .045 - 1e-6));
  const cross = (a, b, c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  let intersections = 0;
  for (let i = 1; i < contract.stations.length; i++) for (let j = 1; j < contract.stations.length; j++) {
    const a=contract.stations[i-1].inner,b=contract.stations[i].inner,c=contract.stations[j-1].outer,d=contract.stations[j].outer;
    if (cross(a,b,c)*cross(a,b,d)<-1e-18&&cross(c,d,a)*cross(c,d,b)<-1e-18) intersections++;
  }
  const jaws=meshes.filter(m=>m.name.startsWith('cushion-p'+p.index+'-'));
  const jawTop=jaws.flatMap(m=>triangles(m.geometry)).filter(t=>t.every(v=>Math.abs(v.y-.038)<1e-6)).map(t=>new THREE.Triangle(...t));
  const support={boundaryChecks:0,maxBoundaryDistance:0,interiorChecks:0,interiorMisses:0,maxInteriorHeightError:0,boundaryTolerance:1e-6};
  for(const rows of [contract.stations.slice(0,contract.jawEndIndices[0]+1),contract.stations.slice(contract.jawEndIndices[1])]) {
    for(const s of rows) for(const across of [0,.05,.5,.95,1]) {
      const point=new THREE.Vector3(s.inner.x+(s.outer.x-s.inner.x)*across,s.seatY,s.inner.z+(s.outer.z-s.inner.z)*across);
      const distance=Math.min(...jawTop.map(t=>t.closestPointToPoint(point,new THREE.Vector3()).distanceTo(point)));
      support.boundaryChecks++;support.maxBoundaryDistance=Math.max(support.maxBoundaryDistance,distance);
    }
    for(let i=1;i<rows.length;i++) for(const along of [.05,.5,.95]) for(const across of [.05,.5,.95]) {
      const a=rows[i-1],b=rows[i];
      const inner={x:a.inner.x+(b.inner.x-a.inner.x)*along,z:a.inner.z+(b.inner.z-a.inner.z)*along};
      const outer={x:a.outer.x+(b.outer.x-a.outer.x)*along,z:a.outer.z+(b.outer.z-a.outer.z)*along};
      const point={x:inner.x+(outer.x-inner.x)*across,z:inner.z+(outer.z-inner.z)*across};
      const hit=down(point,jaws,b.seatY+.0001)[0]; support.interiorChecks++;
      if(!hit) support.interiorMisses++;else support.maxInteriorHeightError=Math.max(support.maxInteriorHeightError,Math.abs(hit.point.y-b.seatY));
    }
  }
  const endProbes=[];
  for (const [row,s] of contract.stations.entries()) if(s.supported) for(const t of [.05,.5,.95]) {
    const point={x:s.inner.x+(s.outer.x-s.inner.x)*t,z:s.inner.z+(s.outer.z-s.inner.z)*t};
    const h=down(point,jaws,s.seatY+.0001)[0];
    const nearest = h ? 0 : Math.min(...jaws.flatMap(m=>triangles(m.geometry).map(([a,b,c])=>new THREE.Triangle(a,b,c).closestPointToPoint(new THREE.Vector3(point.x,s.seatY,point.z),new THREE.Vector3()).distanceTo(new THREE.Vector3(point.x,s.seatY,point.z)))));
    endProbes.push({row,t,hit:h?.object.name??null,y:h?.point.y??null,distanceToJaw:nearest});
  }
  const axes=[];for(let mm=125;mm<=160;mm+=.5) { const h=down(pocketLocalToWorld(p,mm/1000,0),meshes)[0];axes.push({depthMm:mm,first:h?.object.name??null,y:h?.point.y??null}); }
  const occludedTop=[];
  for(const [i,t] of top.entries()) {
    const center=t.reduce((sum,v)=>sum.add(v),new THREE.Vector3()).multiplyScalar(1/3);
    const h=down(center,meshes)[0]; if(!h||h.object!==trim) occludedTop.push({triangle:i,first:h?.object.name??null,above:h?h.point.y-center.y:null});
  }
  output.pockets.push({pocket:p.index,kind:p.kind,stations:contract.stations,frameOpening:contract.frameOpening,triangles:tris.length,weltTriangles:triangles(scene.tableGroup.getObjectByName('pocket-lip-'+p.index).geometry).length,leather:metrics(g),welt:metrics(scene.tableGroup.getObjectByName('pocket-lip-'+p.index).geometry),topTriangleCount:top.length,topDown:top.filter(([a,b,c])=>b.clone().sub(a).cross(c.clone().sub(a)).y<0).length,intersections,occludedTop,support,endProbes,axes});
}
fs.writeFileSync('shots/pocket-trim-implementation-20260905/geometry-audit.json',JSON.stringify(output,null,2));
const before=JSON.parse(fs.readFileSync('shots/pocket-trim-research-20260905/geometry-analysis.json','utf8'));
const summary={method:output.method,beforeTableMeshCount:before.meshes,tableMeshCount:output.tableMeshCount,wood:output.wood,pockets:output.pockets.map(p=>({p:p.pocket,kind:p.kind,stations:p.stations.length,leather:p.leather,welt:p.welt,topTriangleCount:p.topTriangleCount,topDown:p.topDown,intersections:p.intersections,occludedTop:p.occludedTop.length,support:p.support,rawBoundaryRayMisses:p.endProbes.filter(v=>!v.hit)})),unchangedLoadedSourceFiles:Object.entries(output.sourceFiles).filter(([file,sha])=>before.sourceFiles[file]===sha).map(([file,sha256])=>({file,sha256}))};
fs.writeFileSync('shots/pocket-trim-implementation-20260905/geometry-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.pockets.map(p=>({p:p.p,support:p.support,topDown:p.topDown,intersections:p.intersections,occludedTop:p.occludedTop})),null,2));
