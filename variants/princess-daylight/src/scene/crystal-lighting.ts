/** R5 perimeter spotlight crown: four neutral bed beams and four colored rim accents.
 * Physical track/neck joins, two fixture batches; no new shadow maps or animation. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export const CRYSTAL_SPOTS = [
  {x:-.86,z:-.88,tx:-.22,tz:-.58,color:0xfff8ef,intensity:4.2,angle:.44,role:'bed'},
  {x:.86,z:-.88,tx:.22,tz:-.58,color:0xfff8ef,intensity:4.2,angle:.44,role:'bed'},
  {x:-.86,z:0,tx:-.72,tz:0,color:0xfff5e5,intensity:1.35,angle:.22,role:'accent'},
  {x:.86,z:0,tx:.72,tz:0,color:0xfff5e5,intensity:1.35,angle:.22,role:'accent'},
  {x:-.86,z:.88,tx:-.22,tz:.58,color:0xfff8ef,intensity:4.2,angle:.44,role:'bed'},
  {x:.86,z:.88,tx:.22,tz:.58,color:0xfff8ef,intensity:4.2,angle:.44,role:'bed'},
  {x:0,z:-1.48,tx:0,tz:-1.35,color:0xfff5e5,intensity:1.35,angle:.22,role:'accent'},
  {x:0,z:1.48,tx:0,tz:1.35,color:0xfff5e5,intensity:1.35,angle:.22,role:'accent'},
] as const;
export function createCrystalLighting(){
  const group=new THREE.Group();group.name='crystal-ceiling-lighting';
  const trim:THREE.BufferGeometry[]=[],diffusers:THREE.BufferGeometry[]=[];
  // Rounded rectangle follows the actual eight head anchors; ellipse gaps are eliminated.
  const outline=new THREE.Shape();outline.moveTo(-.68,-1.48);outline.lineTo(.68,-1.48);
  outline.absarc(.68,-1.30,.18,-Math.PI/2,0,false);outline.lineTo(.86,1.30);
  outline.absarc(.68,1.30,.18,0,Math.PI/2,false);outline.lineTo(-.68,1.48);
  outline.absarc(-.68,1.30,.18,Math.PI/2,Math.PI,false);outline.lineTo(-.86,-1.30);
  outline.absarc(-.68,-1.30,.18,Math.PI,Math.PI*1.5,false);
  const points=outline.getPoints(6),path=new THREE.CurvePath<THREE.Vector3>();
  for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(new THREE.Vector3(points[i-1].x,1.82,points[i-1].y),new THREE.Vector3(points[i].x,1.82,points[i].y)));
  trim.push(new THREE.TubeGeometry(path,128,.009,6,true));
  const up=new THREE.Vector3(0,1,0);
  for(const {x,z,tx,tz,color,intensity,angle,role} of CRYSTAL_SPOTS){
    const light=new THREE.SpotLight(color,intensity,4,angle,.62,2);
    light.position.set(x,1.76,z);light.target.position.set(tx,-.04,tz);
    light.name=role==='accent'?'ivory-rim-neutral-accent':'crystal-bed-directed-spot';
    light.userData.lightingRole=role;group.add(light,light.target);
    const direction=light.target.position.clone().sub(light.position).normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(up,direction);
    const housing=new THREE.CylinderGeometry(.037,.030,.095,12);housing.applyQuaternion(q);housing.translate(x,1.76,z);trim.push(housing);
    const trackAnchor=new THREE.Vector3(x,1.82,z),headAnchor=light.position.clone().addScaledVector(direction,-.0475);
    const neckDirection=headAnchor.clone().sub(trackAnchor),neckCenter=trackAnchor.clone().add(headAnchor).multiplyScalar(.5);
    const neck=new THREE.CylinderGeometry(.007,.007,neckDirection.length()+.008,6);
    neck.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,neckDirection.normalize()));neck.translate(neckCenter.x,neckCenter.y,neckCenter.z);trim.push(neck);
    light.userData.fixtureAnchors={track:trackAnchor.toArray(),head:headAnchor.toArray()};
    const lens=new THREE.CircleGeometry(.026,12);lens.rotateX(-Math.PI/2);lens.applyQuaternion(q);
    const at=light.position.clone().addScaledVector(direction,.049);lens.translate(at.x,at.y,at.z);diffusers.push(lens);
  }
  const metal=new THREE.Mesh(mergeGeometries(trim)!,new THREE.MeshStandardMaterial({color:0xd2b578,metalness:.8,roughness:.28}));metal.name='crystal-ceiling-gold-rings';group.add(metal);
  const glow=new THREE.Mesh(mergeGeometries(diffusers)!,new THREE.MeshStandardMaterial({color:0xfff7e9,emissive:0xffefdb,emissiveIntensity:.75,roughness:.7}));glow.name='crystal-ceiling-diffusers';group.add(glow);
  [...trim,...diffusers].forEach(g=>g.dispose());
  updateCrystalCeilingVisibility(group);
  return group;
}
/** Fixtures remain retracted at every camera/quality level; illumination is unchanged. */
export function updateCrystalCeilingVisibility(root:THREE.Group,_camera?:THREE.Camera){
  root.traverse(child=>{if(child instanceof THREE.Mesh)child.visible=false;});
}
