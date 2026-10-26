import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Conservative visible-scene budget; optional scenery is removed before core geometry. */
export function sceneCost(scene: THREE.Scene) {
  let calls = 0, triangles = 0, textureBytes = 0, maxTextureSide = 0;
  let opaqueCalls=0,opaqueTriangles=0,hasTransmission=false;
  const textures = new Set<THREE.Texture>();
  scene.traverseVisible(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.geometry || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const passes = materials.reduce((sum, material) => sum + (material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1), 0);
    calls += Array.isArray(mesh.material) ? Math.max(mesh.geometry.groups.length, passes) : passes;
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3 * instances * Math.max(1, passes / materials.length);
    for(const material of materials){
      const transmission=material instanceof THREE.MeshPhysicalMaterial?material.transmission:0;
      if(transmission>0)hasTransmission=true;
      else if(!material.transparent){opaqueCalls++;if(mesh.isMesh)opaqueTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position?.count??0)/3*instances;}
    }
    materials.forEach(material => Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }));
  });
  if (scene.environment) textures.add(scene.environment);
  textures.forEach(texture => {
    const images = Array.isArray(texture.image) ? texture.image : [texture.image];
    images.forEach(image => {
      if (!image) return;
      const { width = 0, height = 0, depth = 1 } = image;
      maxTextureSide = Math.max(maxTextureSide, width, height);
      // Float/half-float textures cost more than RGBA8.
      const channelBytes = texture.type === THREE.FloatType ? 4 : texture.type === THREE.HalfFloatType ? 2 : 1;
      textureBytes += width * height * depth * 4 * channelBytes * (texture.generateMipmaps ? 4 / 3 : 1);
    });
  });
  // Three shares one transmission target; its opaque prepass is real work, not a free material flag.
  if(hasTransmission){calls+=opaqueCalls;triangles+=opaqueTriangles;textureBytes+=1024*1024*8*4/3;}
  return { calls, triangles, textureBytes, maxTextureSide };
}
export function withinSceneBudget(cost: ReturnType<typeof sceneCost>, low: boolean) {
  return cost.calls <= (low ? 50 : 100) && cost.triangles <= (low ? 50000 : 100000)
    && cost.textureBytes <= (low ? 32 : 64) * 1024 * 1024 && cost.maxTextureSide <= (low ? 1024 : 2048);
}

export function batchStaticTable(root: THREE.Group) {
  const groups = new Map<string, THREE.Mesh[]>();
  root.children.forEach(object => {
    if (!object.visible || !(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const key = `${object.material.id}:${object.renderOrder}:${object.castShadow}:${object.receiveShadow}:${Object.keys(object.geometry.attributes).sort().join(',')}`;
    groups.set(key, [...(groups.get(key) || []), object]);
  });
  groups.forEach(meshes => {
    if (meshes.length < 2) return;
    const parts = meshes.map(mesh => { mesh.updateMatrix(); return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix); });
    const geometry = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!geometry) return;
    const first = meshes[0];
    const batch = new THREE.Mesh(geometry, first.material);
    batch.name = 'minitool-static-table-batch'; batch.renderOrder = first.renderOrder;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    meshes.forEach(mesh => { mesh.visible = false; });
    root.add(batch);
  });
}
