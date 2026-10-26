import {it,expect} from 'vitest';
import * as T from 'three';
import {Scene3D} from './Scene3D';
import {cameraPoseAt} from './camera-view';
import {TABLE} from './physics';
import {createCrystalStructure} from './scene/crystal-style';
it('a visible object ball upper hemisphere stays table-owned at low camera',()=>{
 const camera=new T.PerspectiveCamera(46,390/844,.01,100);const p=cameraPoseAt(0,.55,0,0,0,390/844);camera.position.set(p.position.x,p.position.y,p.position.z);camera.lookAt(p.lookAt.x,p.lookAt.y,p.lookAt.z);camera.updateMatrixWorld(true);
 const tableGroup=new T.Group(),environment=new T.Group();environment.add(createCrystalStructure());tableGroup.add(environment);
 const ball=new T.Mesh(new T.SphereGeometry(TABLE.ballRadius,16,12),new T.MeshBasicMaterial());ball.position.set(0,TABLE.ballRadius,-TABLE.length/2+.12);ball.updateMatrixWorld(true);
 const stub={camera,renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})}},tableGroup,studioEnvironment:{root:environment},ballMeshes:[ball],raycaster:new T.Raycaster(),tablePlane:new T.Plane(new T.Vector3(0,1,0),0)};
 const v=new T.Vector3(0,TABLE.ballRadius*1.7,ball.position.z).project(camera),x=(v.x+1)*390/2,y=(1-v.y)*844/2;expect(x).toBeGreaterThan(20);expect(y).toBeGreaterThan(20);expect(x).toBeLessThan(370);expect(y).toBeLessThan(824);
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(v.x,v.y),camera);expect(ray.intersectObject(ball).length).toBeGreaterThan(0);
 expect(Scene3D.prototype.hitVisibleTable.call(stub as any,x,y)).toBe(true);
});
