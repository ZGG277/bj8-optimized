/** Crystal R3: original visual-only geometry/materials. Metres, y-up.
 * Physics, pocket apertures, saved data and control semantics are not inputs to mutation.
 * Alpha/Fresnel-like clearcoat is intentionally cheaper than screen-space refraction.
 * Event glints and pocket bursts are owned by impact-feedback.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TABLE, POCKETS, pocketLocalToWorld } from '../physics';
import { createTableUnderlapGeometry } from '../pocket-render/cushion-geometry';
import { pocketRenderProfile } from '../pocket-render/profile';
import { pocketSeamContract } from '../pocket-render/seam-contract';
import { tableFrameEnvelope } from '../pocket-render/frame-geometry';
import { applyGemOptics, applyFrameOptics, createGemVolumeFacets } from './gem-optics';
import { GEM_BODY_COLORS } from '../textures';
/** Selected B: one smooth whole-gem surface; never an outer shell enclosing a diamond. */
export function crystalShellMaterial(number:number){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d')!;
  const pearl=number===0,obsidian=number===8,topaz=number>=9;
  ctx.fillStyle=pearl?'#fff5e4':obsidian?'#151b29':topaz?GEM_BODY_COLORS.topaz:GEM_BODY_COLORS.ruby;ctx.fillRect(0,0,512,256);
  if(number){ctx.font='bold 46px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const x of [128,384]){ctx.fillStyle=topaz?'#755015':'#291703';ctx.fillText(String(number),x+1,130);ctx.fillStyle=topaz?'#593710':obsidian?'#fff0cc':'#f8dfac';ctx.fillText(String(number),x,128);}
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshPhysicalMaterial({map,color:0xffffff,roughness:pearl?.18:obsidian?.105:.09,metalness:pearl?.08:obsidian?.1:.2,clearcoat:1,clearcoatRoughness:pearl?.09:.035,envMapIntensity:1.25,transparent:false,opacity:1,depthWrite:true,side:THREE.FrontSide});
  if(pearl){material.iridescence=.38;material.iridescenceIOR=1.3;material.iridescenceThicknessRange=[180,400];}
  applyGemOptics(material,number);
  if(number>0&&number!==8){
    // Small numeral-only inlays preserve the IDs without a badge or equatorial belt.
    const labelMask=document.createElement('canvas');labelMask.width=256;labelMask.height=128;
    const labelCtx=labelMask.getContext('2d')!;labelCtx.fillStyle='#ffffff';labelCtx.fillRect(0,0,256,128);
    labelCtx.fillStyle='#000000';labelCtx.font='bold 23px Georgia, serif';labelCtx.textAlign='center';labelCtx.textBaseline='middle';
    labelCtx.fillText(String(number),64,64);labelCtx.fillText(String(number),192,64);
    material.transmissionMap=new THREE.CanvasTexture(labelMask);
  }
  material.userData.ballFinish=pearl?'pearl':obsidian?'obsidian-eight':topaz?'yellow-topaz-gem':'ruby-gem';material.userData.wholeGemSurface=true;
  return material;
}
/** R2 keeps the actual green fibre cloth. Only the furniture becomes crystal. */
export function styleCrystalTable(root:THREE.Group){
  const glass=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.055,metalness:.12,clearcoat:1,clearcoatRoughness:.025,transparent:true,opacity:.46,depthWrite:false,envMapIntensity:1.75,flatShading:true});
  applyFrameOptics(glass);
  const gold=new THREE.MeshStandardMaterial({color:0xe3b657,metalness:.82,roughness:.19});
  const dark=new THREE.MeshStandardMaterial({color:0x102b4e,roughness:.62});
  const retired=new Set<THREE.Material>();
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
    const previous=o.material;
    if(o.name==='table-cloth' || o.name.startsWith('cushion-')){
      // Retain makeClothMaps' actual fibre color, normal and roughness maps.
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for(const material of materials) if(material instanceof THREE.MeshPhysicalMaterial){
        material.transparent=false;material.opacity=1;material.depthWrite=true;
        material.metalness=0;material.roughness=.94;material.clearcoat=0;
        material.specularIntensity=.12;material.specularColor.set(0x93b8a0);
        material.sheen=.4;material.sheenRoughness=1;material.sheenColor.set(0x49765b);
        material.normalScale.set(.3,.3);material.envMapIntensity=.1;
      }
      o.userData.crystalRole='princess-soft-green-cloth';
    }
    else if(o.name==='table-wood-frame'){o.material=glass;o.userData.crystalRole='digital-ivory-white-frame';}
    else if(o.name.startsWith('pocket-top-trim-')||o.name.startsWith('pocket-lip-'))o.material=gold;
    else if(o.name.startsWith('pocket-net-'))o.material=dark;
    // The cloth wrap below the bed remains opaque green: cloth has a real substrate.
    if(previous!==o.material)(Array.isArray(previous)?previous:[previous]).forEach(m=>retired.add(m));
  });
  root.userData.retiredVisualMaterials=[...retired];
  const structure=createCrystalStructure(glass,gold);
  // Keep furniture out of static-table batching so its roles remain inspectable.
  root.add(structure);
}

/** Closed, genuinely rounded apron section. All radii are metres, with no boxes at corners.
 * The sweep is indexed and has analytic section normals: clearcoat stays smooth across fillets.
 */
function roundedApronGeometry(halfX:number,halfZ:number,cornerRadius:number,width:number,height:number,fillet:number,y:number,pocketNotches=false){
  let outline:{x:number;z:number;nx:number;nz:number}[]=[];
  for(let corner=0;corner<4;corner++){
    const start=corner*Math.PI/2,cx=Math.cos(start+Math.PI/4)>0?halfX-cornerRadius:-halfX+cornerRadius;
    const cz=Math.sin(start+Math.PI/4)>0?halfZ-cornerRadius:-halfZ+cornerRadius;
    for(let step=0;step<=6;step++){
      const angle=start+step*Math.PI/12,nx=Math.cos(angle),nz=Math.sin(angle);
      outline.push({x:cx+cornerRadius*nx,z:cz+cornerRadius*nz,nx,nz});
    }
  }
  if(pocketNotches){
    const sampled:typeof outline=[];
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];sampled.push(a);
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.3)continue;
      // Two transition stations at either end retain the six-step rounded
      // corners. Five central stations shape each side-pocket saddle.
      const ts=[.07/length,.15/length,1-.15/length,1-.07/length];
      if(Math.abs(a.x-b.x)<1e-6)for(const z of [-.18,-.11,0,.11,.18])ts.push((z-a.z)/(b.z-a.z));
      for(const t of ts.filter(t=>t>0&&t<1).sort((a,b)=>a-b))sampled.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,nx:a.nx,nz:a.nz});
    }
    outline=sampled;
  }
  const wells=POCKETS.map(p=>{
    const profile=pocketRenderProfile(p);
    return {a:pocketLocalToWorld(p,profile.topCenterDepth,0),b:pocketLocalToWorld(p,profile.bottomCenterDepth,0),
      radius:Math.max(profile.topDepthRadius,profile.topLateralRadius,profile.bottomDepthRadius,profile.bottomLateralRadius)+width/2+.012,
      top:profile.wellBottomY-.004};
  });
  const topAt=(x:number,z:number)=>{
    let top=y+height/2;
    if(!pocketNotches)return top;
    for(const well of wells){
      const dx=well.b.x-well.a.x,dz=well.b.z-well.a.z;
      const t=THREE.MathUtils.clamp(((x-well.a.x)*dx+(z-well.a.z)*dz)/(dx*dx+dz*dz),0,1);
      const distance=Math.hypot(x-well.a.x-dx*t,z-well.a.z-dz*t);
      const blend=1-THREE.MathUtils.smoothstep(distance,well.radius,well.radius+.04);
      top=Math.min(top,THREE.MathUtils.lerp(y+height/2,well.top,blend));
    }
    return top;
  };
  const profile:{r:number;y:number;nr:number;ny:number}[]=[];
  for(let corner=0;corner<4;corner++){
    const start=corner*Math.PI/2,cr=Math.cos(start+Math.PI/4)>0?width/2-fillet:-width/2+fillet;
    const cy=Math.sin(start+Math.PI/4)>0?height/2-fillet:-height/2+fillet;
    for(let step=0;step<=2;step++){
      const a=start+step*Math.PI/4;profile.push({r:cr+fillet*Math.cos(a),y:cy+fillet*Math.sin(a),nr:Math.cos(a),ny:Math.sin(a)});
    }
  }
  const positions:number[]=[],normals:number[]=[],uv:number[]=[],indices:number[]=[],n=profile.length;
  for(let i=0;i<outline.length;i++)for(const p of profile){
    const c=outline[i],bottom=y-height/2,scale=(topAt(c.x,c.z)-bottom)/height;
    positions.push(c.x+c.nx*p.r,bottom+(p.y+height/2)*scale,c.z+c.nz*p.r);
    normals.push(c.nx*p.nr,p.ny,c.nz*p.nr);uv.push(i/outline.length,p.y/height+.5);
  }
  for(let i=0;i<outline.length;i++)for(let j=0;j<n;j++){
    const a=i*n+j,b=((i+1)%outline.length)*n+j,c=((i+1)%outline.length)*n+(j+1)%n,d=i*n+(j+1)%n;
    indices.push(a,d,b,b,d,c);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  if(pocketNotches)g.computeVertexNormals();
  return g;
}

/** A restrained Roman-column silhouette: molded capital/base, entasis and eight shallow flutes.
 * The grooves are actual radial geometry, smoothly run out before the collar and the foot.
 */
function crystalColumnGeometry(x:number,z:number){
  const profile:readonly (readonly [y:number,r:number,flute:number])[]=[
    [-.8155,.084,0],[-.808,.095,0],[-.793,.102,0],[-.782,.095,0],[-.77,.084,0],[-.749,.077,.001],
    [-.67,.081,.004],[-.53,.080,.004],[-.38,.074,.004],[-.322,.072,.001],
    [-.307,.080,0],[-.289,.085,0],[-.276,.100,0],[-.254,.110,0],[-.232,.108,0],[-.22,.100,0],
  ];
  const segments=32,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let row=0;row<profile.length;row++)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,[y,r,flute]=profile[row],radius=r-flute*(.5+.5*Math.cos(a*8));
    positions.push(x+Math.cos(a)*radius,y,z+Math.sin(a)*radius);uv.push(i/segments,row/(profile.length-1));
  }
  for(let row=0;row<profile.length-1;row++)for(let i=0;i<segments;i++){
    const a=row*segments+i,b=row*segments+(i+1)%segments,c=b+segments,d=a+segments;
    indices.push(a,d,b,b,d,c);
  }
  // Fan caps add no pole degenerates and have their own vertices/normals.
  for(const row of [0,profile.length-1]){
    const base=positions.length/3,[y,r]=profile[row];positions.push(x,y,z);uv.push(.5,.5);
    for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;positions.push(x+Math.cos(a)*r,y,z+Math.sin(a)*r);uv.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);}
    for(let i=0;i<segments;i++){const a=base+1+i,b=base+1+(i+1)%segments;indices.push(...(row===0?[base,a,b]:[base,b,a]));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** Low-poly brilliant cuts within the previous stone envelope, with real hard facet normals. */
export function cutCrystalGeometry(radius:number){
  const p:number[]=[],segments=8;
  const point=(r:number,y:number,i:number)=>new THREE.Vector3(Math.cos(i*Math.PI*2/segments)*radius*r,y*radius,Math.sin(i*Math.PI*2/segments)*radius*r);
  const face=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>{
    const normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));
    const center=a.clone().add(b).add(c);
    if(normal.dot(center)<0)[b,c]=[c,b];
    p.push(...a.toArray(),...b.toArray(),...c.toArray());
  };
  for(let i=0;i<segments;i++){
    const j=(i+1)%segments,t=point(.46,.5,i),tn=point(.46,.5,j),g=point(1,.04,i),gn=point(1,.04,j),l=point(.92,-.12,i),ln=point(.92,-.12,j);
    if(i>0 && i<segments-1) face(point(.46,.5,0),t,tn);
    face(t,g,gn);face(t,gn,tn);
    face(g,l,ln);face(g,ln,gn);face(l,point(0,-.85,0),ln);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(p.length/3*2),2));geometry.computeVertexNormals();return geometry;
}

/** R3 rounded double apron, gently fluted four-column base and warm undulating gold inlay.
 * Actual meshes only; original pocket geometry, ball contacts and play dimensions are untouched.
 */
export function createCrystalStructure(
  glass=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.055,metalness:.12,clearcoat:1,clearcoatRoughness:.025,transparent:true,opacity:.46,depthWrite:false,envMapIntensity:1.75,flatShading:false}),
  gold=new THREE.MeshStandardMaterial({color:0xe3b657,metalness:.82,roughness:.19}),
){
  applyFrameOptics(glass);glass.flatShading=false;
  // Keep the existing stable lookup name; explicit revision and shape contracts live in userData.
  const root=new THREE.Group();root.name='crystal-structure-r2';root.userData.visualOnly=true;
  const glassParts:THREE.BufferGeometry[]=[],goldParts:THREE.BufferGeometry[]=[],facetParts:THREE.BufferGeometry[]=[],seamParts:THREE.BufferGeometry[]=[];
  const frameEnvelope=tableFrameEnvelope(POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p))));
  const outerX=TABLE.width/2+.070+frameEnvelope.expansion,outerZ=TABLE.length/2+.070+frameEnvelope.expansion;
  const addBox=(arr:THREE.BufferGeometry[],w:number,h:number,d:number,x:number,y:number,z:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);arr.push(g);};
  const tube=(points:THREE.Vector3[],radius:number,segments:number,closed=false)=>goldParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed,'centripetal'),segments,radius,4,closed));
  const perimeter=(offset:number,y:number)=>{
    const points:THREE.Vector3[]=[],radius=.118+offset;
    for(let corner=0;corner<4;corner++){
      const start=corner*Math.PI/2,cx=Math.cos(start+Math.PI/4)>0?outerX-.118:-outerX+.118;
      const cz=Math.sin(start+Math.PI/4)>0?outerZ-.118:-outerZ+.118;
      for(let step=0;step<=6;step++){const a=start+step*Math.PI/12;points.push(new THREE.Vector3(cx+radius*Math.cos(a),y,cz+radius*Math.sin(a)));}
    }
    return points;
  };
  // Closed sweeps follow the enlarged rail envelope while retaining the same section.
  glassParts.push(roundedApronGeometry(outerX,outerZ,.118,.09,.11,.014,-.126,true));
  glassParts.push(roundedApronGeometry(outerX,outerZ,.118,.067,.033,.012,-.211));
  // Soft, continuous perimeter piping sits just within each rounded crystal shoulder.
  tube(perimeter(.038,-.080),.0018,40,true);
  tube(perimeter(.038,-.174),.0018,40,true);
  tube(perimeter(.028,-.223),.0017,40,true);
  for(const side of [-1,1]){
    // The closure sits behind the entire current well, including its deeper
    // lower ellipse, and joins the enlarged apron underneath the outer rail.
    const sidePocket=POCKETS.find(p=>p.kind==='side'&&p.outward.x===side)!;
    const well=pocketRenderProfile(sidePocket);
    const seamInner=Math.abs(sidePocket.x)+Math.max(well.topCenterDepth+well.topDepthRadius,
      well.bottomCenterDepth+well.bottomDepthRadius)+.002;
    const seamOuter=frameEnvelope.halfWidth-.006;
    const seamTop=-.003,seamBottom=well.wellBottomY-.005;
    addBox(seamParts,seamOuter-seamInner,seamTop-seamBottom,.32,side*(seamInner+seamOuter)/2,(seamTop+seamBottom)/2,0);
    // Gold is sunk 3 mm into the outer face, with 10–14 mm waves readable at table scale.
    for(const level of [-.106,-.146]){
      const points=Array.from({length:33},(_,i)=>new THREE.Vector3(side*(outerX+.042),level+Math.sin(i/32*Math.PI*4)*.010,-outerZ+.16+i*(2*outerZ-.32)/32));
      tube(points,.0019,28);
    }
    const endWave=Array.from({length:25},(_,i)=>new THREE.Vector3(-outerX+.16+i*(2*outerX-.32)/24,-.126+Math.sin(i/24*Math.PI*2)*.014,side*(outerZ+.042)));
    tube(endWave,.002,24);
    // Flush internal stones and plan-view waves remain below the rail top, clear of all six openings.
    for(const half of [-1,1]){
      const points=Array.from({length:21},(_,i)=>new THREE.Vector3(side*(TABLE.width/2+.089+Math.sin(i/20*Math.PI*2)*.009),.047,half*(.23+i*.85/20)));
      tube(points,.0016,20);
    }
    tube(Array.from({length:21},(_,i)=>new THREE.Vector3(-.55+i*1.1/20,.047,side*(TABLE.length/2+.088+Math.sin(i/20*Math.PI*2)*.008))),.0016,20);
    for(const sx of [-1,1]){
      const x=sx*(TABLE.width/2+.005),z=side*(TABLE.length/2+.005);
      glassParts.push(crystalColumnGeometry(x,z));
      // Two small gold astragals accent the column transitions; no heavy antique ornament.
      for(const [r,y] of [[.098,-.795],[.087,-.287]] as const){
        const ring=new THREE.TorusGeometry(r,.0022,4,24);ring.rotateX(Math.PI/2);ring.translate(x,y,z);goldParts.push(ring);
      }
    }
    // The small central jewel keeps a softly bowed gold bezel, rather than sharp gold mitres.
    const badge=new THREE.SphereGeometry(.064,16,8).toNonIndexed();badge.scale(1,.86,.25);badge.translate(0,-.193,side*(outerZ+.029));facetParts.push(badge);
    tube([
      new THREE.Vector3(0,-.132,side*(outerZ+.045)),new THREE.Vector3(.068,-.193,side*(outerZ+.045)),
      new THREE.Vector3(0,-.251,side*(outerZ+.045)),new THREE.Vector3(-.068,-.193,side*(outerZ+.045)),
    ],.002,20,true);
  }
  
  // Four fine gold rosettes on the broad end rails, safely outside the pocket mouths.
  for(const sz of [-1,1])for(const x of [-.32,.32]){
    const z=sz*(TABLE.length/2+.09);
    for(let petal=0;petal<4;petal++){
      const a=petal*Math.PI/2,points=Array.from({length:13},(_,i)=>{
        const t=i/12*Math.PI*2,u=.012*(1-Math.cos(t)),v=.008*Math.sin(t);
        return new THREE.Vector3(x+Math.cos(a)*u-Math.sin(a)*v,.047,z+Math.sin(a)*u+Math.cos(a)*v);
      });tube(points,.0014,12,true);
    }
  }
  for(const [name,arr,material] of [['crystal-tiered-frame-and-legs',glassParts,glass],['crystal-fine-gold-seams',goldParts,gold],['ivory-gold-inset-motifs',facetParts,gold],['crystal-middle-pocket-seam-caps',seamParts,new THREE.MeshStandardMaterial({color:0x30694f,roughness:.94})]] as const){
    const mesh=new THREE.Mesh(mergeGeometries([...arr],false)!,material);mesh.name=name;mesh.userData.visualOnly=true;mesh.castShadow=false;root.add(mesh);arr.forEach(g=>g.dispose());
  }
  root.userData.legCount=4;root.userData.apronHeight=.11;root.userData.footY=-.8155;
  root.userData.internalCutStyle='gold-inset-rosettes';root.userData.furnitureRevision=6;root.userData.apronCornerRadius=.118;root.userData.apronEdgeRadius=.014;
  root.userData.legStyle='light-roman-column';root.userData.legFluteCount=8;root.userData.maxFluteDepth=.004;
  root.userData.goldWaveAmplitude=.014;root.userData.goldInlayRadius=.002;
  return root;
}

export function styleCrystalEnvironment(root:THREE.Group){
  // R1 recoloured the inherited walnut block: its bulky silhouette was still the old table.
  // R2 replaces that furniture with the explicit structure above, without hiding the selected world.
  const inherited=root.getObjectByName('BJ8_TableShell');
  const underlap=root.getObjectByName('BJ8_ClothUnderlap');
  if(underlap && !underlap.userData.crystalSupportRetained){
    root.updateMatrixWorld(true);root.attach(underlap);root.updateMatrixWorld(true);underlap.userData.crystalSupportRetained=true;
    const retired:THREE.Material[]=[];
    const green=new THREE.MeshPhysicalMaterial({color:0x30694f,roughness:.94,sheen:.25,sheenColor:0x49765b,sheenRoughness:.9});
    underlap.traverse(o=>{if(o instanceof THREE.Mesh){
      retired.push(...(Array.isArray(o.material)?o.material:[o.material]));o.material=green;
      // Shared current pocket dimensions, expressed in this retained node's local frame.
      // Keep its world transform, replace the baked GLB opening, and release the old buffer once.
      const original=o.geometry;
      o.geometry=createTableUnderlapGeometry().applyMatrix4(o.matrixWorld.clone().invert().multiply(root.matrixWorld));
      original.dispose();o.userData.crystalSharedPocketSupport=true;
    }});
    underlap.userData.retiredVisualMaterials=retired;
  }
  if(inherited)inherited.visible=false;
  const fallback=root.getObjectByName('studio-fallback');
  fallback?.children.forEach(o=>{if(o instanceof THREE.Mesh && o.geometry.type==='BoxGeometry')o.visible=false;});
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
    for(const mat of Array.isArray(o.material)?o.material:[o.material]){
      if(mat instanceof THREE.MeshStandardMaterial && mat.name.includes('BJ8_Floor_')){mat.color.set(0xece5d7);mat.roughness=.3;mat.needsUpdate=true;}
    }
  });
}
export function createCrystalBallDetails(radius:number){
  const root=new THREE.Group();root.name='crystal-ball-details';
  // R6 visible lamp-like emissive cores inside the whole-gem shell. No per-ball PointLight.
  const coreGeometry=new THREE.SphereGeometry(radius*.24,16,10);
  const rubyCore=new THREE.InstancedMesh(coreGeometry,new THREE.MeshStandardMaterial({color:0xffcad0,emissive:0xff6475,emissiveIntensity:3.2,roughness:.3}),7);
  const topazCore=new THREE.InstancedMesh(coreGeometry,new THREE.MeshStandardMaterial({color:0xfff2c3,emissive:0xffdc7c,emissiveIntensity:2.5,roughness:.3}),7);
  rubyCore.name="ruby-internal-lamp-core";topazCore.name="topaz-internal-lamp-core";
  for(const mesh of [rubyCore,topazCore]){mesh.frustumCulled=false;mesh.userData.optionalGemOptics=true;mesh.userData.internalLamp=true;root.add(mesh);}
  const facetGeometry=createGemVolumeFacets(radius);
  const rubyVolume=new THREE.InstancedMesh(facetGeometry,new THREE.MeshPhysicalMaterial({color:0xea5477,metalness:.72,roughness:.14,envMapIntensity:1.6,side:THREE.DoubleSide}),7);
  const topazVolume=new THREE.InstancedMesh(facetGeometry,new THREE.MeshPhysicalMaterial({color:0xffd56b,metalness:.72,roughness:.14,envMapIntensity:1.6,side:THREE.DoubleSide}),7);
  rubyVolume.name='ruby-volume-microfacets';topazVolume.name='topaz-volume-microfacets';
  for(const mesh of [rubyVolume,topazVolume]){mesh.frustumCulled=false;mesh.userData.optionalGemOptics=true;root.add(mesh);}
  const m=new THREE.Matrix4(),s=new THREE.Vector3();
  return {root,sync(balls:readonly THREE.Mesh[]){
    for(let index=0;index<7;index++)for(const [volume,number] of [[rubyVolume,index+1],[topazVolume,index+9],[rubyCore,index+1],[topazCore,index+9]] as const){
      const ball=balls[number],k=ball?.visible?ball.scale.x:0;s.setScalar(k);m.compose(ball?.position??new THREE.Vector3(),ball?.quaternion??new THREE.Quaternion(),s);volume.setMatrixAt(index,m);
    }
    for(const mesh of [rubyVolume,topazVolume,rubyCore,topazCore])mesh.instanceMatrix.needsUpdate=true;
  }};
}
