/*
[INPUT]: 静区尺寸和固定种子的三维密度场
[OUTPUT]: 连续体积云海：密度侵蚀、自遮光、暮色散射与近台薄雾
[POS]: 单次绘制的独立 World Shell；不修改比赛灯光、全局雾或时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import { createCloudNoiseData } from './cloud-density';
import { ownedWorldShell, type WorldShellContext, type WorldShell } from './world-shell';

const vertexShader = /* glsl */ `
  varying vec3 vShellPosition;
  void main() {
    vShellPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp sampler3D;
  uniform sampler3D cloudNoiseMap;
  uniform vec2 quietHalfSize;
  uniform float quietFloorY;
  varying vec3 vShellPosition;
  const vec3 sunlight = vec3(-0.62, 0.43, -0.65);

  float terraceDistance(vec2 p) {
    vec2 q = abs(p) - (quietHalfSize - vec2(0.65));
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.65;
  }

  float densityAt(vec3 p) {
    float shore = terraceDistance(p.xz);
    float broad = texture(cloudNoiseMap, p * vec3(0.030, 0.046, 0.030) + vec3(0.13, 0.4, 0.27)).r;
    float detail = texture(cloudNoiseMap, p * 0.15 + vec3(0.31, 0.16, 0.42)).r;
    float height = -3.6 + broad * 5.8;
    // Near the table, the cloud ceiling stays below the quiet terrace.
    height = mix(-1.15, height, smoothstep(0.2, 8.0, shore));
    float body = smoothstep(-0.12, 0.48, height - p.y - (1.0 - detail) * 0.65);
    float bottom = smoothstep(-6.0, -3.9, p.y);
    float shoreFade = smoothstep(-0.45, 0.85, shore);
    float distantFade = 1.0 - smoothstep(36.0, 44.0, length(p.xz));
    return body * bottom * shoreFade * distantFade;
  }

  vec3 skyColor(vec3 ray) {
    float glow = pow(max(dot(normalize(vec3(ray.x, 0.08, ray.z)), normalize(vec3(-0.62, 0.0, -0.65))), 0.0), 9.0);
    vec3 horizon = mix(vec3(0.24, 0.31, 0.40), vec3(0.59, 0.40, 0.30), glow * 0.68);
    vec3 sky = mix(horizon, vec3(0.055, 0.095, 0.17), smoothstep(0.0, 0.8, max(ray.y, 0.0)));
    return mix(sky, vec3(0.10, 0.145, 0.20), smoothstep(0.0, 0.65, -ray.y));
  }

  void main() {
    vec3 origin = cameraPosition;
    vec3 ray = normalize(vShellPosition - origin);
    vec3 sky = skyColor(ray);
    float vertical = abs(ray.y) < 0.0001 ? (ray.y < 0.0 ? -0.0001 : 0.0001) : ray.y;
    float tA = (-6.0 - origin.y) / vertical;
    float tB = (3.5 - origin.y) / vertical;
    float start = max(0.0, min(tA, tB));
    float finish = min(70.0, max(tA, tB));
    // The fully opaque inner terrace covers these rays. Skip hidden volume work.
    if (ray.y < -0.0001) {
      float floorT = (quietFloorY - origin.y) / ray.y;
      if (floorT > 0.0 && terraceDistance((origin + ray * floorT).xz) < -0.75) finish = -1.0;
    }
    vec3 accumulated = vec3(0.0);
    float transmission = 1.0;
    // Stable screen-space dithering, no temporal noise or animation loop.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = start + jitter * 0.18;
    for (int i = 0; i < 64; i++) {
      if (t > finish || transmission < 0.025) break;
      float stepLength = 0.18 + t * 0.042;
      vec3 p = origin + ray * t;
      float density = densityAt(p);
      if (density > 0.015) {
        float above = densityAt(p + sunlight * 0.8);
        float higher = densityAt(p + sunlight * 2.1);
        float lighting = exp(-above * 1.4 - higher * 1.9);
        float rim = pow(max(dot(ray, sunlight), 0.0), 6.0) * 0.14;
        vec3 cloud = mix(vec3(0.10, 0.15, 0.23), vec3(0.60, 0.58, 0.55), lighting);
        cloud += vec3(0.09, 0.12, 0.17) * smoothstep(-4.5, 1.0, p.y);
        cloud += vec3(0.24, 0.15, 0.08) * rim;
        float shore = smoothstep(0.0, 5.8, terraceDistance(p.xz));
        cloud *= mix(0.20, 1.0, shore);
        cloud = mix(cloud, skyColor(normalize(vec3(ray.x, 0.015, ray.z))), smoothstep(14.0, 55.0, t) * 0.78);
        float alpha = 1.0 - exp(-density * stepLength * 1.65);
        accumulated += transmission * alpha * cloud;
        transmission *= 1.0 - alpha;
      }
      t += stepLength;
    }
    gl_FragColor = vec4(accumulated + transmission * sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createCloudSeaShell({ layout }: WorldShellContext): WorldShell {
  const root = new THREE.Group();
  root.name = 'world-shell-cloud-sea';
  const noiseData = createCloudNoiseData();
  const noise = new THREE.Data3DTexture(noiseData, 64, 64, 64);
  noise.name = 'cloud-density-64';
  noise.format = THREE.RedFormat;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    name: 'cloud-sea-volume', vertexShader, fragmentShader,
    uniforms: {
      cloudNoiseMap: { value: noise },
      quietHalfSize: { value: new THREE.Vector2(layout.width / 2, layout.length / 2) },
      quietFloorY: { value: layout.floorY },
    },
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), material);
  sky.name = 'cloud-sea-sky';
  sky.renderOrder = -1;
  sky.raycast = () => {};
  root.userData.volume = { size: 64, bytes: noiseData.byteLength, maxSteps: 64, animated: false };
  root.add(sky);
  return ownedWorldShell(root, [noise]);
}
