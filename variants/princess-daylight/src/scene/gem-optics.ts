/** B material optics: one smooth sphere, a smooth clearcoat above fine base-normal facets.
 * No internal diamond mesh, shader injection, external image or independent animation loop. */
import * as THREE from 'three';
import { TABLE } from '../physics';

function dataTexture(data:Uint8Array,w:number,h:number){
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function hash(x:number,y:number,z:number){let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
export function applyGemOptics(material:THREE.MeshPhysicalMaterial,number:number){
  const pearl=number===0,black=number===8,topaz=number>=9;
  if(black){material.emissive.set(0x58637c);material.emissiveIntensity=.045;material.roughness=.32;material.metalness=.025;material.clearcoat=.38;material.clearcoatRoughness=.3;material.envMapIntensity=.65;return;}
  material.clearcoat=1;material.transparent=false;material.opacity=1;material.depthWrite=true;
  if(pearl){
    material.roughness=.28;material.clearcoatRoughness=.23;material.metalness=.055;
    material.iridescence=.95;material.iridescenceIOR=1.38;material.iridescenceThicknessRange=[180,620];
    material.sheen=.16;material.sheenRoughness=.85;material.sheenColor.set(0xf5e5d2);
    const w=64,h=32,d=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const wave=Math.sin(x*.22+Math.sin(y*.19)*1.2)*.5+Math.cos(y*.25+x*.08)*.35;
      const v=Math.round(128+wave*57);d.set([v,v,v,255],(y*w+x)*4);
    }
    material.iridescenceThicknessMap=dataTexture(d,w,h);
    // Soft nacre domains underneath the angle-dependent thin film, never hard color facets.
    const pw=512,ph=256,nacre=new Uint8Array(pw*ph*4);
    for(let y=0;y<ph;y++)for(let x=0;x<pw;x++){
      const phi=x/pw*Math.PI*2,theta=y/(ph-1)*Math.PI,nx=Math.cos(phi)*Math.sin(theta),ny=Math.cos(theta),nz=Math.sin(phi)*Math.sin(theta);
      const pink=(Math.sin(nx*9+ny*4+Math.sin(nz*7))*.5+.5)*.44;
      const blue=(Math.cos(ny*8-nz*5+Math.sin(nx*4))*.5+.5)*.43,warm=1-pink-blue;
      nacre.set([Math.round(255*warm+240*pink+185*blue),Math.round(241*warm+195*pink+225*blue),Math.round(224*warm+240*pink+255*blue),255],(y*pw+x)*4);
    }
    material.map?.dispose();material.map=dataTexture(nacre,pw,ph);material.map.colorSpace=THREE.SRGBColorSpace;
    return;
  }
  material.metalness=.03;material.roughness=.115;material.clearcoatRoughness=.075;
  material.ior=1.72;material.transmission=topaz?.94:.95;material.thickness=TABLE.ballRadius*1.75;
  material.attenuationColor.set(topaz?0xffe4a3:0xf57890);material.attenuationDistance=.24;
  material.dispersion=.12;material.envMapIntensity=1.65;
  // Gentle body emission represents internal scattering; a separate visible core sits inside.
  material.emissive.set(topaz?0xffb927:0xff264e);material.emissiveIntensity=topaz?.085:.14;
  const w=256,h=128,normals=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const phi=x/w*Math.PI*2,theta=y/(h-1)*Math.PI;
    const cx=Math.floor(Math.cos(phi)*Math.sin(theta)*15),cy=Math.floor(Math.cos(theta)*15),cz=Math.floor(Math.sin(phi)*Math.sin(theta)*15);
    const nx=Math.round(128+(hash(cx,cy,cz)-.5)*54),ny=Math.round(128+(hash(cz+57,cx-13,cy+91)-.5)*54);
    normals.set([nx,ny,252,255],(y*w+x)*4);
  }
  material.normalMap=dataTexture(normals,w,h);material.normalScale.set(.35,.35);
  // Both gem groups have the same polished, faceted body across every latitude.
  // Only the numeral inlay added by crystalShellMaterial may mask transmission.
  material.userData.crystalOptics={transmission:material.transmission,dispersion:material.dispersion};
}
/** Digital ivory-white lacquer, never animal material. Opaque at every quality tier. */
export function applyFrameOptics(material:THREE.MeshPhysicalMaterial,_facets=false){
  material.color.set(0xf7efdf);material.transparent=false;material.opacity=1;material.depthWrite=true;
  material.metalness=0;material.transmission=0;material.dispersion=0;material.iridescence=0;
  material.clearcoat=.38;material.clearcoatRoughness=.19;material.roughness=.32;
  material.envMapIntensity=.65;material.userData.finish='digital-ivory-white';
  delete material.userData.crystalOptics;
}
/** A hot device or exceeded scene budget can remove the ONE shared refraction pass. */
export function setCrystalOpticsQuality(scene:THREE.Scene,low:boolean){
  const seen=new Set<THREE.Material>();
  scene.traverse(o=>{
    if(o.name==='crystal-ceiling-lighting')o.userData.lowQuality=low;
    if(!(o instanceof THREE.Mesh))return;
    if(o.name==='crystal-fine-gold-seams')o.visible=!low;
    if(o.name==='crystal-ceiling-gold-rings'||o.name==='crystal-ceiling-diffusers')o.visible=false;
    if(o.userData.optionalGemOptics)o.visible=!low;
    for(const material of Array.isArray(o.material)?o.material:[o.material]){
      if(seen.has(material)||!(material instanceof THREE.MeshPhysicalMaterial))continue;seen.add(material);
      const saved=material.userData.crystalOptics;if(!saved)continue;
      const target=low?0:saved.transmission;
      if(material.transmission===target)continue;
      material.transmission=target;material.dispersion=low?0:saved.dispersion;
      if(saved.iridescence!==undefined)material.iridescence=low?0:saved.iridescence;
      material.transparent=Boolean(low&&saved.alphaFallback);material.opacity=material.transparent?.72:1;
      material.depthWrite=!material.transparent;material.needsUpdate=true;
    }
  });
}

/** Fine reflective fracture planes distributed through the WHOLE gem volume.
 * They do not form a closed core/diamond or change the smooth sphere silhouette. */
export function createGemVolumeFacets(radius:number){
  const p:number[]=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<96;i++){
    const az=hash(i,41,71)*Math.PI*2,z=hash(i,89,19)*2-1,r=radius*.73*Math.cbrt(hash(i,73,31));
    const center=new THREE.Vector3(Math.cos(az)*Math.sqrt(1-z*z),z,Math.sin(az)*Math.sqrt(1-z*z)).multiplyScalar(r);
    const normal=new THREE.Vector3(hash(i,91,7)*2-1,hash(i,123,27)*2-1,hash(i,93,77)*2-1).normalize();
    const tangent=new THREE.Vector3().crossVectors(normal,Math.abs(normal.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize();
    const bitangent=new THREE.Vector3().crossVectors(normal,tangent),size=radius*(.085+hash(i,37,5)*.075);
    a.copy(center).addScaledVector(tangent,size);b.copy(center).addScaledVector(tangent,-size*.68).addScaledVector(bitangent,size*.78);c.copy(center).addScaledVector(tangent,-size*.34).addScaledVector(bitangent,-size*.82);
    p.push(...a.toArray(),...b.toArray(),...c.toArray());
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.computeVertexNormals();return geometry;
}
