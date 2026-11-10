import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {openingCastlePose,openingTablePose,openingCameraPose,openingBoundsPoints,OPENING_DURATION,OPENING_REVEAL_DURATION,OPENING_SAFETY,openingHidesFixtures} from './opening-camera';
import {filmLastFramePose,filmHandoffPose,FILM_HANDOFF_DURATION,filmPresentation} from './opening-camera';
import {projectFramingPoint,DEFAULT_CAMERA_SAFETY} from './camera-framing';
import {createCrystalStructure} from './scene/crystal-style';
import {cameraPoseAt} from './camera-view';
import sceneSource from './Scene3D.ts?raw';
import gameSource from './Game.tsx?raw';
const safety=OPENING_SAFETY;
describe('far to complete furniture opening',()=>{
 it('影片中心在比分栏下方画布中仍对齐全屏末帧',()=>{
  const h=750,w=390,centerY=(844/2-94)/h;
  const pose=filmLastFramePose(w/h,{frameAspect:w/844,centerY});
  const p=projectFramingPoint({x:0,y:.035,z:0},pose,w/h)!;
  expect(p.y).toBeCloseTo(1-2*centerY,2);
 });
 it('横屏末帧把母球留在画面下方，木框不铺满 16:9',()=>{
  const aspect=16/9, frame=filmPresentation('video');
  const pose=filmLastFramePose(aspect,{frameAspect:aspect,centerY:.5,...frame});
  const cue=projectFramingPoint({x:0,y:.035,z:.635},pose,aspect)!;
  const rack=projectFramingPoint({x:0,y:.035,z:-.635},pose,aspect)!;
  expect(cue.y).toBeLessThan(-.15); expect(rack.y).toBeGreaterThan(.15);
  expect(Math.abs(cue.x)).toBeLessThan(.02); expect(Math.abs(rack.x)).toBeLessThan(.02);
  const portrait=filmLastFramePose(aspect);
  expect(pose.position.y).toBeGreaterThan(portrait.position.y);
 });
 for(const aspect of [390/844,1280/900])it(`影片末帧同位，连续到第一视角 ${aspect}`,()=>{
  const end=cameraPoseAt(0,.64,0,0,0,aspect,DEFAULT_CAMERA_SAFETY);
  const start=filmLastFramePose(aspect);
  expect(filmHandoffPose(0,aspect,end)).toEqual(start);
  expect(filmHandoffPose(FILM_HANDOFF_DURATION,aspect,end)).toEqual(end);
  for(let t=0;t<=FILM_HANDOFF_DURATION;t+=.05){
    const p=filmHandoffPose(t,aspect,end);
    expect(p.position.y).toBeGreaterThanOrEqual(end.position.y-.000001);
    expect(Number.isFinite(p.position.y+p.lookAt.z)).toBe(true);
    const next=filmHandoffPose(Math.min(FILM_HANDOFF_DURATION,t+.001),aspect,end);
    expect(Math.hypot(next.position.x-p.position.x,next.position.y-p.position.y,next.position.z-p.position.z)).toBeLessThan(.05);
  }
 });
 for(const [w,h] of [[320,568],[390,844],[430,932],[844,390],[1024,768]]) it(`fits entire furniture and feet ${w}x${h}`,()=>{
  const aspect=w/h,near=openingTablePose(aspect,safety),end=cameraPoseAt(0,.64,0,0,1,aspect,safety);
  const root=createCrystalStructure();root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);
  for(const point of openingBoundsPoints()){expect(point.y).toBeGreaterThanOrEqual(-.87);}
  const bounds=openingBoundsPoints();expect(box.min.y).toBeGreaterThanOrEqual(Math.min(...bounds.map(p=>p.y)));expect(box.max.y).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.y)));
  expect(box.max.x).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.x)));expect(box.max.z).toBeLessThanOrEqual(Math.max(...bounds.map(p=>p.z)));
  for(let t=0;t<=OPENING_REVEAL_DURATION;t+=.05)for(const p of bounds){const ndc=projectFramingPoint(p,openingCameraPose(t,aspect,safety,end),aspect)!;expect(ndc.x).toBeGreaterThan(-1+2*safety.left);expect(ndc.x).toBeLessThan(1-2*safety.right);expect(ndc.y).toBeGreaterThan(-1+2*safety.bottom);expect(ndc.y).toBeLessThan(1-2*safety.top);}
  expect(openingCameraPose(OPENING_REVEAL_DURATION,aspect,safety,end)).toEqual(near);
  expect(openingCameraPose(OPENING_DURATION,aspect,safety,end)).toEqual(end);
 });
 it('starts farther than full furniture and eases without a discontinuity',()=>{
  const end=cameraPoseAt(0,.64,0,0,1,.5,DEFAULT_CAMERA_SAFETY),pose=(t:number)=>openingCameraPose(t,.5,DEFAULT_CAMERA_SAFETY,end);
  const distance=(p:ReturnType<typeof pose>)=>Math.hypot(p.position.x-p.lookAt.x,p.position.y-p.lookAt.y,p.position.z-p.lookAt.z);
  expect(distance(pose(0))).toBeCloseTo(distance(pose(OPENING_REVEAL_DURATION))*1.75);
  for(const t of [OPENING_REVEAL_DURATION,OPENING_DURATION]){const a=pose(t-.00001),b=pose(t+.00001);expect(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)).toBeLessThan(.0001);}
 });
 it('omits fixture meshes during handoff only, without changing lights',()=>{expect(openingHidesFixtures(1.7)).toBe(false);expect(openingHidesFixtures(OPENING_REVEAL_DURATION)).toBe(true);expect(openingHidesFixtures((OPENING_REVEAL_DURATION + OPENING_DURATION) / 2)).toBe(true);expect(openingHidesFixtures(OPENING_DURATION)).toBe(false);expect(openingHidesFixtures(null)).toBe(false);expect(sceneSource).toContain('fixture instanceof THREE.Mesh');});
 it('wires explicit restart only, early input, visibility and reduced-motion cleanup',()=>{
  expect(gameSource.match(/\.beginOpening\(/g)).toBeNull();
  expect(sceneSource).toContain("openingInputGate(document");
  expect(sceneSource).toContain("this.disposeOpeningInput?.()");
  expect(sceneSource).toContain('if (this.motionPreference?.matches) this.finishOpening()');
  expect(sceneSource).toContain('if (document.hidden) {\n      this.finishOpening()');
  expect(sceneSource).toContain('private unavailable(message: string) {\n    this.cancelStrike();\n    this.finishOpening()');
  expect(sceneSource).toContain("this.disposeMotionPreference?.()");
 });
});

 describe('castle architecture opening',()=>{for(const aspect of [390/844,844/390])it(`frames arches and table ${aspect}`,()=>{const pose=openingCastlePose(aspect);for(const x of [-4.4,4.4])for(const z of [-4.4,4.4])for(const y of [-.8,3.55]){const p=projectFramingPoint({x,y,z},pose,aspect)!;expect(Math.abs(p.x)).toBeLessThan(.91);expect(Math.abs(p.y)).toBeLessThan(.88);}});});
