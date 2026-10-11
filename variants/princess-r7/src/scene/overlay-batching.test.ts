import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import { batchOverlayRings } from './overlay-batching';
import { sceneCost } from '../minitool/render-guard';
describe('plan marker batch',()=>{
  it('keeps ten ring positions, triangle counts and individual RGBA while using one draw call',()=>{
    const group=new THREE.Group();let triangles=0;
    for(let i=0;i<10;i++){
      const ring=new THREE.Mesh(new THREE.RingGeometry(.01,.02,32),new THREE.MeshBasicMaterial({color:i%2?0xffaa22:0x2266ff,transparent:true,opacity:.2+i*.05,side:THREE.FrontSide}));
      ring.rotation.x=-Math.PI/2;ring.position.set(i*.1,.004,i*.2);triangles+=ring.geometry.index!.count/3;group.add(ring);
    }
    const mesh=batchOverlayRings(group)!;expect(group.children).toHaveLength(1);expect(mesh.geometry.getAttribute('position').count/3).toBe(triangles);
    const colors=mesh.geometry.getAttribute('color');expect(colors.itemSize).toBe(4);expect(colors.getW(0)).toBeCloseTo(.2);expect(colors.getW(colors.count-1)).toBeCloseTo(.65);
    mesh.geometry.computeBoundingBox();expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(.92);expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(.004);
    const scene=new THREE.Scene();scene.add(group);expect(sceneCost(scene).calls).toBe(1);
  });
  it('leaves unrelated lines and a lone marker intact',()=>{
    const group=new THREE.Group(),line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());group.add(line);
    expect(batchOverlayRings(group)).toBeUndefined();expect(group.children).toEqual([line]);
  });
});
