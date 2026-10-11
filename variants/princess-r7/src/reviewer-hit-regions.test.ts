import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {Scene3D} from './Scene3D';
import {cameraPoseAt} from './camera-view';
import {TABLE,POCKETS} from './physics';
import {createCrystalStructure} from './scene/crystal-style';
import {createTableFrameGeometry} from './pocket-render/frame-geometry';
import {pocketSeamContract} from './pocket-render/seam-contract';
import {pocketRenderProfile} from './pocket-render/profile';
import {createCrystalLighting,updateCrystalCeilingVisibility} from './scene/crystal-lighting';
import {setCrystalOpticsQuality} from './scene/gem-optics';
const tableGroup=new T.Group(), environment=new T.Group();
const structure=createCrystalStructure(); environment.add(structure);tableGroup.add(environment);
const contracts=POCKETS.map(p=>pocketSeamContract(p,pocketRenderProfile(p)));
tableGroup.add(new T.Mesh(createTableFrameGeometry(contracts),new T.MeshBasicMaterial()));
const scenery=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({side:T.DoubleSide}));scenery.rotation.x=-Math.PI/2;scenery.position.y=-1;environment.add(scenery);
describe('independent live Scene3D table hit region',()=>{
 for(const [w,h] of [[390,844],[844,390],[1280,800]])for(const level of [0,.08,.16,.3,.42,.65,.9,1])for(const az of [0,Math.PI/2,Math.PI,-Math.PI/2])it(`${w}x${h} level=${level} az=${az}`,()=>{
 const rect={left:37,top:59,width:w,height:h};const camera=new T.PerspectiveCamera(46,w/h,.01,2000);const p=cameraPoseAt(0,.55,az,0,level,w/h,{top:.13,bottom:.08,left:.06,right:.17});camera.position.set(p.position.x,p.position.y,p.position.z);camera.lookAt(p.lookAt.x,p.lookAt.y,p.lookAt.z);camera.updateMatrixWorld(true);
 const stub={camera,renderer:{domElement:{getBoundingClientRect:()=>rect}},tableGroup,studioEnvironment:{root:environment},raycaster:new T.Raycaster(),tablePlane:new T.Plane(new T.Vector3(0,1,0),0)};
 const hit=(x:number,y:number)=>Scene3D.prototype.hitVisibleTable.call(stub as any,x,y);
 const project=(v:T.Vector3)=>{const q=v.clone().project(camera);return {x:rect.left+(q.x+1)*w/2,y:rect.top+(1-q.y)*h/2,z:q.z}};
 for(const x of [-TABLE.width*.45,0,TABLE.width*.45])for(const z of [-TABLE.length*.45,0,TABLE.length*.45]){const q=project(new T.Vector3(x,0,z));if(q.z>=-1&&q.z<=1)expect(hit(q.x,q.y),`bed ${x},${z}`).toBe(true);}
 const corners=[[2,2],[w-2,2],[2,h-2],[w-2,h-2]];if(level>=.65)expect(corners.some(([x,y])=>!hit(rect.left+x,rect.top+y)),'blank surroundings remain camera-owned').toBe(true);
 // Project triangle centroids from genuine R7 geometry; the mesh itself must own these screen points.
 structure.traverse(o=>{if(!(o instanceof T.Mesh)||!o.visible)return;const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i+=Math.max(3,Math.floor(a.count/30/3)*3)){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld),q=project(v);if(q.z>=-1&&q.z<=1&&q.x>rect.left+1&&q.x<rect.left+w-1&&q.y>rect.top+1&&q.y<rect.top+h-1){ // vertex exact edge is numerically fragile; move to adjacent triangle centroid
 if(i+2<a.count){v.add(new T.Vector3().fromBufferAttribute(a,i+1).applyMatrix4(o.matrixWorld)).add(new T.Vector3().fromBufferAttribute(a,i+2).applyMatrix4(o.matrixWorld)).divideScalar(3);const c=project(v);expect(hit(c.x,c.y),'visible structure centroid').toBe(true);}
 }}});
 });
 it('keeps eight lights and zero fixture meshes through all quality and camera transitions',()=>{const scene=new T.Scene(),root=createCrystalLighting();scene.add(root);for(const low of [false,true,false,true,false]){setCrystalOpticsQuality(scene,low);for(const y of [.16,.7,1.76,2,6]){const camera=new T.PerspectiveCamera();camera.position.set(2,y,4);camera.lookAt(0,0,0);updateCrystalCeilingVisibility(root,camera);expect(root.children.filter(o=>o instanceof T.Mesh).every(o=>!o.visible)).toBe(true);expect(root.children.filter(o=>o instanceof T.SpotLight&&o.visible)).toHaveLength(8);}}});
});
