const fs=require('node:fs');const data=JSON.parse(fs.readFileSync('shots/pocket-trim-research-20260905/geometry-analysis.json','utf8'));
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function intersects(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;}
const summaries=[];
for(const p of data.pockets){const crosses=[],outerSelf=[];for(let i=0;i<48;i++)for(let j=0;j<48;j++){if(intersects(p.outer[i],p.outer[i+1],p.inner[j],p.inner[j+1]))crosses.push([i,j]);if(j>i+1&&intersects(p.outer[i],p.outer[i+1],p.outer[j],p.outer[j+1]))outerSelf.push([i,j]);}
const signs=p.topTriangles.map(t=>cross(...t));let majority=Math.sign(signs.reduce((s,v)=>s+v,0));const inverted=signs.map((v,i)=>Math.sign(v)!==majority?{triangle:i,station:Math.floor(i/2),area:Math.abs(v)/2}:null).filter(Boolean);
summaries.push({index:p.index,kind:p.kind,outerCrossInner:crosses,outerSelf,minorityTriangleCount:inverted.length,minorityTriangleAreaMm2:inverted.reduce((s,v)=>s+v.area,0),inverted,firstInner:p.inner[0],firstOuter:p.outer[0],lastInner:p.inner[48],lastOuter:p.outer[48]});}
fs.writeFileSync('shots/pocket-trim-research-20260905/topology-summary.json',JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries.filter(p=>p.index===0||p.index===2),null,2));
