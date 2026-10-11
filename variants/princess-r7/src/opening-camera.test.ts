import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {openingTablePose,openingCameraPose,openingBoundsPoints,OPENING_DURATION,OPENING_SAFETY,openingHidesFixtures} from './opening-camera';
import {projectFramingPoint,DEFAULT_CAMERA_SAFETY} from './camera-framing';
import {createCrystalStructure} from './scene/crystal-style';
import {cameraPoseAt} from './camera-view';
import sceneSource from './Scene3D.ts?raw';
import gameSource from './Game.tsx?raw';
const safety=OPENING_SAFETY;
describe('far to complete furniture opening',()=>{
 for(const [w,h] of [[320,568],[390,844],[430,932],[844,390],[1024,768]]) it(`fits entire furniture and feet ${w}x${h}`,()=>{
  const aspect=w/h,near=openingTablePose(aspect,safety),end=cameraPoseAt(0,.64,0,0,1,aspect,safety);
  const root=createCrystalStructure();root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);
  for(const point of openingBoundsPoints()){expect(point.y).toBeGreaterThanOrEqual(-.87);}
  const bounds=openingBoundsPoints();expect(box.min.y).toBeGreaterThanOrEqual(Math.min(...bounds.map(p=>p.y)));expect(box.max.y).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.y)));
  expect(box.max.x).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.x)));expect(box.max.z).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.z)));
  for(let t=0;t<=1.95;t+=.05)for(const p of bounds){const ndc=projectFramingPoint(p,openingCameraPose(t,aspect,safety,end),aspect)!;expect(ndc.x).toBeGreaterThan(-1+2*safety.left);expect(ndc.x).toBeLessThan(1-2*safety.right);expect(ndc.y).toBeGreaterThan(-1+2*safety.bottom);expect(ndc.y).toBeLessThan(1-2*safety.top);}
  expect(openingCameraPose(1.7,aspect,safety,end)).toEqual(near);
  expect(openingCameraPose(OPENING_DURATION,aspect,safety,end)).toEqual(end);
 });
 it('starts farther than full furniture and eases without a discontinuity',()=>{
  const end=cameraPoseAt(0,.64,0,0,1,.5,DEFAULT_CAMERA_SAFETY),pose=(t:number)=>openingCameraPose(t,.5,DEFAULT_CAMERA_SAFETY,end);
  const distance=(p:ReturnType<typeof pose>)=>Math.hypot(p.position.x-p.lookAt.x,p.position.y-p.lookAt.y,p.position.z-p.lookAt.z);
  expect(distance(pose(0))).toBeCloseTo(distance(pose(1.5))*1.75);
  for(const t of [1.5,1.95,2.8]){const a=pose(t-.00001),b=pose(t+.00001);expect(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)).toBeLessThan(.0001);}
 });
 it('omits fixture meshes during handoff only, without changing lights',()=>{expect(openingHidesFixtures(1.7)).toBe(false);expect(openingHidesFixtures(1.95)).toBe(true);expect(openingHidesFixtures(2.35)).toBe(true);expect(openingHidesFixtures(2.8)).toBe(false);expect(openingHidesFixtures(null)).toBe(false);expect(sceneSource).toContain('fixture instanceof THREE.Mesh');});
 it('wires explicit restart only, early input, visibility and reduced-motion cleanup',()=>{
  expect(gameSource.match(/\.beginOpening\(/g)).toHaveLength(1);
  expect(sceneSource).toContain("openingInputGate(document");
  expect(sceneSource).toContain("this.disposeOpeningInput?.()");
  expect(sceneSource).toContain('if (this.motionPreference?.matches) this.finishOpening()');
  expect(sceneSource).toContain('if (document.hidden) {\n      this.finishOpening()');
  expect(sceneSource).toContain('private unavailable(message: string) {\n    this.finishOpening()');
  expect(sceneSource).toContain("this.motionPreference?.removeEventListener('change', this.onMotionPreference)");
 });
});
