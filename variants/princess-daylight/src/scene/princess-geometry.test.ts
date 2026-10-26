import { describe, expect, it } from 'vitest';
import { createLakeWaterGeometry, createBallRenderGeometry } from './princess-geometry';
import { TABLE } from '../physics';
describe('bounded lake geometry, unchanged dimensions', () => {
  it('keeps the complete flat water boundary and upward normals with 96 triangles', () => {
    const geometry=createLakeWaterGeometry(),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    expect(geometry.index!.count/3).toBe(96);
    for(let i=0;i<p.count;i++){expect(p.getY(i)).toBeCloseTo(-.76,6);expect(n.getY(i)).toBeCloseTo(1,6);}
    geometry.computeBoundingBox();expect(geometry.boundingBox!.min.x).toBe(-900);expect(geometry.boundingBox!.max.z).toBe(900);
  });
  it('uses normal/mobile/hot tessellation without changing sphere or physical radii', () => {
    for(const [mini,hot,width,height] of [[false,false,48,32],[true,false,20,12],[true,true,16,10]] as const){
      const geometry=createBallRenderGeometry(TABLE.ballRadius,mini,hot);
      expect(geometry.parameters).toMatchObject({radius:TABLE.ballRadius,widthSegments:width,heightSegments:height});
      geometry.computeBoundingSphere();expect(geometry.boundingSphere!.radius).toBeCloseTo(TABLE.ballRadius,6);
    }
  });
});
