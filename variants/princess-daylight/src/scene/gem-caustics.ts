/** Restrained sun-directed caustics on felt; keep contact shadows legible rather than a floating glow. */
import * as THREE from 'three';
import { TABLE, POCKETS } from '../physics';
import { jewelColor } from './jewel-ball-finish';

export function createGemCaustics() {
  const geometry = new THREE.PlaneGeometry(.18, .23);
  geometry.rotateX(-Math.PI / 2);
  const phases = new THREE.InstancedBufferAttribute(new Float32Array(16), 1);
  geometry.setAttribute('causticPhase', phases);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      feltHalf: { value: new THREE.Vector2(TABLE.width / 2, TABLE.length / 2) },
      pockets: { value: POCKETS.map(p => new THREE.Vector3(p.x, p.z, p.mouthWidth * .48)) },
      strength: { value: .32 },
    },
    vertexShader: `
      attribute float causticPhase;
      varying vec2 patchUv;
      varying vec2 feltPoint;
      varying vec3 tint;
      varying float phase;
      void main() {
        patchUv = uv; phase = causticPhase;
        tint = instanceColor;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        feltPoint = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec2 feltHalf;
      uniform vec3 pockets[6];
      uniform float strength;
      varying vec2 patchUv;
      varying vec2 feltPoint;
      varying vec3 tint;
      varying float phase;
      void main() {
        if (abs(feltPoint.x) > feltHalf.x - .003 || abs(feltPoint.y) > feltHalf.y - .003) discard;
        for (int i = 0; i < 6; i++) if (distance(feltPoint, pockets[i].xy) < pockets[i].z) discard;
        vec2 p = (patchUv - .5) * 2.0;
        float shift = sin(phase * 1.7) * .10;
        p.x += shift * (p.y + .2);
        float envelope = exp(-dot(p, p) * 2.8);
        float focus = exp(-dot((p - vec2(.02, .22)) * vec2(1.55, 1.0), (p - vec2(.02, .22)) * vec2(1.55, 1.0)) * 16.0);
        float bend = p.x * p.x * .95;
        float arc = exp(-pow((p.y - .18 + bend + shift) * 17.0, 2.0)) * exp(-p.x * p.x * 6.0);
        float arc2 = exp(-pow((p.y + .13 + bend * .52 - shift * .6) * 24.0, 2.0)) * exp(-p.x * p.x * 13.0);
        float rollingLight = .78 + .13 * sin(phase * 2.1) + .09 * sin(phase * 4.3);
        float energy = (focus * .64 + arc * .60 + arc2 * .24) * envelope * rollingLight * strength;
        float fringe = exp(-pow((p.y - .22 + bend + shift) * 14.0, 2.0)) * exp(-p.x * p.x * 7.0);
        vec3 colour = mix(tint, vec3(1.0, .97, .87), clamp(focus * .26 + arc * .12, 0.0, .38));
        colour += vec3(.035, .015, .025) * fringe;
        gl_FragColor = vec4(colour, clamp(energy, 0.0, .85));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 16);
  mesh.name = 'daylight-moving-caustics'; mesh.frustumCulled = false; mesh.renderOrder = 2;
  for (let n = 0; n < 16; n++) mesh.setColorAt(n, new THREE.Color(jewelColor(n)));
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const direction = new THREE.Vector3(), position = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    sync(balls: THREE.Mesh[]) {
      balls.forEach((ball, n) => {
        const visible = ball.visible && n !== 0 && n !== 8 && Math.abs(ball.position.y - TABLE.ballRadius) < .008;
        direction.set(.61, .37, .70).applyQuaternion(ball.quaternion);
        const phase = direction.x * 3.4 + direction.y * 2.2 + direction.z * 4.7 + n * 1.7;
        phases.setX(n, phase);
        // Opposite the shared sun (-3.8, 5.8, -4.5), close enough to remain attached to the ball.
        position.set(ball.position.x + .035, .0006, ball.position.z + .042);
        rotation.setFromAxisAngle(up, -.7 + Math.sin(phase) * .12);
        const size = visible ? ball.scale.x : 0;
        scale.set(size * (1 + Math.sin(phase * 1.3) * .06), 1, size);
        matrix.compose(position, rotation, scale); mesh.setMatrixAt(n, matrix);
      });
      phases.needsUpdate = true; mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); },
  };
}
