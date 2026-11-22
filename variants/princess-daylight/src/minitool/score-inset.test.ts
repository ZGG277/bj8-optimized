import { expect,it } from 'vitest';
import { headerGeometry } from './score-inset';
const rect=(left:number,right:number)=>({left,right,top:34,bottom:66,width:right-left,height:32});
it('uses the free interval between native buttons at their actual height',()=>{
  expect(headerGeometry({windowWidth:390,menuButtons:{back:rect(8,40),share:rect(318,384)}},390)).toEqual({left:44,right:76,top:34,height:32});
});
it('fits alongside a capsule even on a compact first row',()=>{
  expect(headerGeometry({windowWidth:390,menuButtons:{capsule:rect(280,380)}},390)?.right).toBe(114);
  expect(headerGeometry({windowWidth:200,menuButtons:{capsule:rect(80,195)}},200)?.top).toBe(34);
});
