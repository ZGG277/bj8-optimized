import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {createCrystalLighting,updateCrystalCeilingVisibility} from './crystal-lighting';
import {sceneCost} from '../minitool/render-guard';
describe('fixed ceiling lighting',()=>{it('uses eight bounded directed perimeter spots and two shared fixture batches',()=>{
const root=createCrystalLighting(),scene=new THREE.Scene();scene.add(root);
const lights=root.children.filter(o=>o instanceof THREE.SpotLight) as THREE.SpotLight[];
expect(lights).toHaveLength(8);expect(lights.filter(o=>o.position.y>1.7)).toHaveLength(8);
for(const light of lights){expect(light.castShadow).toBe(false);expect(light.intensity).toBeLessThan(4.3);}
const cost=sceneCost(scene);expect(cost.calls).toBe(0);expect(cost.triangles).toBeLessThan(3000);
const camera=new THREE.PerspectiveCamera();camera.position.set(0,4,0);camera.lookAt(0,0,0);updateCrystalCeilingVisibility(root,camera);expect(root.children.filter(o=>o instanceof THREE.Mesh).every(o=>!o.visible)).toBe(true);expect(lights.every(o=>o.visible)).toBe(true);camera.position.set(3,1,4);camera.lookAt(0,0,0);updateCrystalCeilingVisibility(root,camera);expect(root.children.filter(o=>o instanceof THREE.Mesh).every(o=>!o.visible)).toBe(true);root.userData.lowQuality=true;updateCrystalCeilingVisibility(root,camera);expect(root.children.filter(o=>o instanceof THREE.Mesh).every(o=>!o.visible)).toBe(true);expect(lights.every(o=>o.visible)).toBe(true);
root.traverse(o=>{if(o instanceof THREE.Mesh){expect(o.castShadow).toBe(false);o.geometry.dispose();(o.material as THREE.Material).dispose();}});
});});

describe('spotlight spatial and thermal contract',()=>{
  it('aims every narrow cone at its adjacent rail, without broad area sources',()=>{
    const root=createCrystalLighting();root.updateMatrixWorld(true);
    const spots=root.children.filter(o=>o instanceof THREE.SpotLight) as THREE.SpotLight[];
    expect(root.children.some(o=>o instanceof THREE.RectAreaLight)).toBe(false);
    expect(spots).toHaveLength(8);
    for(const spot of spots){
      expect(spot.position.y).toBeGreaterThan(1.7);
      expect(spot.angle).toBeLessThan(.45);expect(spot.penumbra).toBeGreaterThan(.5);
      expect(spot.target.parent).toBe(root);expect(spot.target.position.y).toBeLessThan(0);
      expect(spot.position.clone().sub(spot.target.position).length()).toBeLessThan(spot.distance);
      expect(Math.abs(spot.position.x)>.8||Math.abs(spot.position.z)>1.4).toBe(true);
      expect(spot.castShadow).toBe(false);
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
  });
});

describe('perimeter fixture and distinct illumination roles',()=>{
 it('mounts every head under a real track surface and uses neutral bed and rim beams without pink casts',()=>{
  const root=createCrystalLighting();root.updateMatrixWorld(true);
  const metal=root.getObjectByName('crystal-ceiling-gold-rings') as THREE.Mesh;
  const spots=root.children.filter(o=>o instanceof THREE.SpotLight) as THREE.SpotLight[];
  expect(spots.filter(s=>s.userData.lightingRole==='bed')).toHaveLength(4);
  const accents=spots.filter(s=>s.userData.lightingRole==='accent');expect(accents).toHaveLength(4);
  expect(new Set(accents.map(s=>s.color.getHex())).size).toBe(1);expect(accents.every(s=>s.color.getHex()===0xfff5e5)).toBe(true);
  for(const spot of spots){
   const hits=new THREE.Raycaster(new THREE.Vector3(spot.position.x,1.95,spot.position.z),new THREE.Vector3(0,-1,0),0,.25).intersectObject(metal);
   expect(hits.length).toBeGreaterThan(0);expect(hits[0].point.y).toBeGreaterThan(1.82);
   const [a,b]=[spot.userData.fixtureAnchors.track,spot.userData.fixtureAnchors.head].map(v=>new THREE.Vector3(...v as [number,number,number]));
   expect(a.distanceTo(b)).toBeLessThan(.04);
   if(spot.userData.lightingRole==='bed'){
    expect(spot.color.getHex()).toBe(0xfff8ef);expect(Math.abs(spot.target.position.x)).toBeLessThan(.3);
   }else expect(spot.angle).toBeLessThan(.25);
  }
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
 });
});
