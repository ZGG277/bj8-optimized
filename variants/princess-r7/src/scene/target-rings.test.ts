import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTargetRingBatch } from './target-rings';
import { createInitialWorld, TABLE } from '../physics';
import { sceneCost } from '../minitool/render-guard';
describe('legal gem target markers', () => {
  it('preserves fourteen open-table positions using one draw call', () => {
    const world=createInitialWorld(()=>.5), batch=createTargetRingBatch(TABLE.ballRadius);
    const targets=new Set(world.balls.filter(b=>b.number>0&&b.number!==8).map(b=>b.number));
    batch.sync(world,targets,true,false);expect(batch.mesh.count).toBe(14);expect(batch.mesh.visible).toBe(true);
    const scene=new THREE.Scene();scene.add(batch.mesh);expect(sceneCost(scene).calls).toBe(1);
    const matrix=new THREE.Matrix4();batch.mesh.getMatrixAt(0,matrix);
    const first=world.balls.find(b=>targets.has(b.number))!;
    expect(matrix.elements[12]).toBeCloseTo(first.x);expect(matrix.elements[13]).toBeCloseTo(.0025);expect(matrix.elements[14]).toBeCloseTo(first.z);
    const normals=batch.mesh.geometry.getAttribute('normal');expect(normals.getY(0)).toBeCloseTo(1);
  });
  it('hides markers during rolling, opponent and plan views, then restores the same legal set', () => {
    const world=createInitialWorld(()=>.5),batch=createTargetRingBatch(TABLE.ballRadius),targets=new Set([1,2,3]);
    world.balls.find(b=>b.number===2)!.active=false;
    batch.sync(world,targets,true,false);expect(batch.mesh.count).toBe(2);
    batch.sync(world,targets,false,false);expect(batch.mesh.count).toBe(0);
    batch.sync(world,targets,true,true);expect(batch.mesh.count).toBe(0);
    world.moving=true;batch.sync(world,targets,true,false);expect(batch.mesh.count).toBe(0);
    world.moving=false;batch.sync(world,targets,true,false);expect(batch.mesh.count).toBe(2);
  });
});
