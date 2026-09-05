// 发布证据：原样复用已审计的 CPU 场景加载器，仅检查实体可见性，不修改产品。
const fs = require('node:fs');
const loader = fs.readFileSync('shots/pocket-trim-implementation-20260905/audit-geometry.cjs', 'utf8').split('const output =')[0];
const { meshes, triangles, THREE } = new Function('require', loader + '\nreturn {meshes,triangles,THREE};')(require);
const rows = [];
for (let p = 0; p < 6; p++) {
  const trim = meshes.find(m => m.name === 'pocket-top-trim-' + p);
  const faces = triangles(trim.geometry).filter(t => t.every(v => v.y >= .045 - 1e-6));
  const samples = [0, .125, .25, .375, .5, .625, .75, .875, 1].map(f => faces[Math.round(f * (faces.length - 1))].reduce((a,v) => a.add(v), new THREE.Vector3()).multiplyScalar(1/3));
  for (const elevation of [15, 45, 80]) for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    const e = elevation * Math.PI/180, a = azimuth * Math.PI/180;
    const offset = new THREE.Vector3(Math.cos(a)*Math.cos(e), Math.sin(e), Math.sin(a)*Math.cos(e));
    const hits = samples.map(target => {
      const ray = new THREE.Raycaster(target.clone().add(offset), offset.clone().negate());
      const hit = ray.intersectObjects(meshes, false)[0];
      return hit ? hit.object.name : null;
    });
    rows.push({pocket:p,elevation,azimuth,visibleTrim:hits.filter(n=>n===trim.name).length,occluders:[...new Set(hits.filter(n=>n!==trim.name))],missing:hits.filter(n=>!n).length});
  }
}
const result = {method:'Actual Scene3D meshes, 12 azimuths x 3 elevations x 6 pockets x 9 cap-face samples; occlusion is reported, not mistaken for a missing surface',rows,rays:rows.length*9,missing:rows.reduce((n,r)=>n+r.missing,0)};
console.log(JSON.stringify(result,null,2));
if (result.missing) process.exitCode = 1;
