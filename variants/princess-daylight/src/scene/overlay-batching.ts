import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Merge flat plan markers without changing position, colour, opacity or meaning. */
export function batchOverlayRings(root: THREE.Group) {
  const rings=root.children.filter((object): object is THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial> => object instanceof THREE.Mesh && object.geometry.type==='RingGeometry' && object.material instanceof THREE.MeshBasicMaterial);
  if(rings.length<2)return;
  const parts=rings.map(ring=>{
    ring.updateMatrix();const geometry=(ring.geometry.index?ring.geometry.toNonIndexed():ring.geometry.clone()).applyMatrix4(ring.matrix);
    const count=geometry.getAttribute('position').count,colors=new Float32Array(count*4),c=ring.material.color;
    for(let i=0;i<count;i++)colors.set([c.r,c.g,c.b,ring.material.opacity],i*4);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));return geometry;
  });
  const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());if(!geometry)return;
  const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1,side:THREE.FrontSide,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='plan-ring-batch';mesh.frustumCulled=false;
  const materials=new Set<THREE.Material>();
  for(const ring of rings){root.remove(ring);ring.geometry.dispose();materials.add(ring.material);}
  materials.forEach(item=>item.dispose());root.add(mesh);return mesh;
}
