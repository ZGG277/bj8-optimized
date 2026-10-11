/* 仅远景大气；新场景的地板、岩岸、竹林、行星与山脊均由 Blender GLB 提供。 */
import * as THREE from 'three';
import { createGalaxyShell } from './galaxy';
import { ownedWorldShell, type WorldShellContext } from './world-shell';

export function createGalaxyAtmosphere(context: WorldShellContext) {
  const shell = createGalaxyShell(context);
  const planet = shell.root.getObjectByName('galaxy-distant-planet');
  if (planet instanceof THREE.Mesh) {
    planet.removeFromParent();
    planet.geometry.dispose();
    for (const material of Array.isArray(planet.material) ? planet.material : [planet.material]) material.dispose();
  }
  return shell;
}

function atmosphere(name: string, low: THREE.ColorRepresentation, high: THREE.ColorRepresentation) {
  const root = new THREE.Group();
  root.name = 'world-shell-' + name;
  const material = new THREE.ShaderMaterial({
    name: name + '-atmosphere', side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { low: { value: new THREE.Color(low) }, high: { value: new THREE.Color(high) } },
    vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 direction; uniform vec3 low; uniform vec3 high;
      void main(){
        float height = smoothstep(-.1,.8,normalize(direction).y);
        gl_FragColor=vec4(mix(low,high,height),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 12), material);
  sky.renderOrder = -100;
  sky.raycast = () => {};
  root.add(sky);
  return ownedWorldShell(root);
}

export const createBambooAtmosphere = () => atmosphere('bamboo', 0x536368, 0x27383d);
export const createAuroraAtmosphere = () => atmosphere('aurora-lake', 0x192837, 0x070d1a);
