import * as THREE from 'three';
/** Flat water: same 96-point, 900m boundary as the GLB; ripples are fragment-shader only. */
export function createLakeWaterGeometry() {
  return new THREE.CircleGeometry(900, 96).rotateX(-Math.PI / 2).translate(0, -.76, 0);
}
/** Visual tessellation only. Physics and pocket dimensions continue sharing TABLE.ballRadius. */
export function createBallRenderGeometry(radius: number, miniTool: boolean, hot: boolean) {
  return new THREE.SphereGeometry(radius, hot ? 16 : miniTool ? 20 : 48, hot ? 10 : miniTool ? 12 : 32);
}
