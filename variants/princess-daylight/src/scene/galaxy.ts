/*
[INPUT]: World Shell 静区尺寸与静态场景上下文
[OUTPUT]: 倾斜银河、分层星云、细星与远行星，以及独立暗矿石静区
[POS]: 无动画、无交互的程序化宇宙 World Shell；不修改相机、灯光或游戏物理
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';
import {
  ownedWorldShell,
  QUIET_ZONE_LAYOUT,
  type WorldShell,
  type WorldShellContext,
} from './world-shell';

const GALAXY_SEED = 0x6a09e667;
const STAR_COUNT = 320;

const skyVertexShader = /* glsl */ `
  varying vec3 vGalaxyDirection;
  void main() {
    vGalaxyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */ `
  varying vec3 vGalaxyDirection;

  float galaxyHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float galaxyNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(galaxyHash(i), galaxyHash(i + vec3(1, 0, 0)), f.x),
          mix(galaxyHash(i + vec3(0, 1, 0)), galaxyHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(galaxyHash(i + vec3(0, 0, 1)), galaxyHash(i + vec3(1, 0, 1)), f.x),
          mix(galaxyHash(i + vec3(0, 1, 1)), galaxyHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float galaxyFbm(vec3 p) {
    float value = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 4; i++) {
      value += weight * galaxyNoise(p);
      p = p * 2.03 + vec3(1.7, 2.9, 4.1);
      weight *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 ray = normalize(vGalaxyDirection);
    vec3 galacticNormal = normalize(vec3(0.31, 0.86, -0.40));
    vec3 axisU = normalize(cross(galacticNormal, vec3(0.0, 0.0, 1.0)));
    vec3 axisV = cross(galacticNormal, axisU);
    float latitude = dot(ray, galacticNormal);
    float longitude = atan(dot(ray, axisV), dot(ray, axisU));

    float broadNoise = galaxyFbm(ray * 3.6 + vec3(2.1, 7.4, 1.3));
    float fineNoise = galaxyFbm(ray * 13.0 + vec3(8.6, 0.7, 4.8));
    float broadBand = exp(-abs(latitude) * 5.7);
    float brightRibbon = exp(-latitude * latitude * 92.0);
    float brokenClouds = smoothstep(0.28, 0.82, broadNoise + fineNoise * 0.28);
    float longVariation = 0.58 + 0.42 * sin(longitude * 2.0 + broadNoise * 5.2);
    float dustLane = smoothstep(0.46, 0.73, galaxyFbm(ray * 19.0 + vec3(3.2, 5.1, 9.7)));

    vec3 zenith = mix(vec3(0.0025, 0.0035, 0.012), vec3(0.012, 0.009, 0.032), ray.y * 0.5 + 0.5);
    vec3 color = zenith;
    color += vec3(0.027, 0.022, 0.064) * broadBand * (0.42 + brokenClouds * 0.58);
    color += vec3(0.080, 0.059, 0.115) * brightRibbon * brokenClouds * longVariation;
    color += vec3(0.030, 0.041, 0.078) * brightRibbon * (1.0 - dustLane) * 0.65;
    color *= 1.0 - brightRibbon * dustLane * 0.28;

    // A broad, offset violet veil gives the shell depth without reading as a flat gradient.
    float veil = exp(-pow(dot(ray, normalize(vec3(-0.62, 0.22, -0.75))) - 0.56, 2.0) * 11.0);
    veil *= smoothstep(0.34, 0.78, galaxyFbm(ray * 5.1 + vec3(11.0, 2.0, 6.0)));
    color += vec3(0.026, 0.013, 0.050) * veil;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const planetVertexShader = /* glsl */ `
  varying vec3 vPlanetNormal;
  varying vec3 vPlanetPosition;
  varying vec3 vPlanetLocal;
  void main() {
    vPlanetNormal = normalize(mat3(modelMatrix) * normal);
    vPlanetPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vPlanetLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const planetFragmentShader = /* glsl */ `
  varying vec3 vPlanetNormal;
  varying vec3 vPlanetPosition;
  varying vec3 vPlanetLocal;
  void main() {
    vec3 normal = normalize(vPlanetNormal);
    vec3 lightDirection = normalize(vec3(-0.36, 0.58, 0.72));
    vec3 viewDirection = normalize(cameraPosition - vPlanetPosition);
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.2);
    float bands = 0.5 + 0.5 * sin(vPlanetLocal.y * 11.0 + vPlanetLocal.x * 0.7);
    vec3 shadowColor = vec3(0.006, 0.008, 0.020);
    vec3 litColor = mix(vec3(0.070, 0.060, 0.115), vec3(0.105, 0.090, 0.145), bands * 0.22);
    vec3 color = mix(shadowColor, litColor, pow(diffuse, 0.72));
    color += vec3(0.055, 0.068, 0.115) * rim * 0.42;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function disableRaycast(object: THREE.Object3D): void {
  object.raycast = () => {};
}

function createStarField(): THREE.InstancedMesh {
  const geometry = new THREE.OctahedronGeometry(1, 0);
  geometry.name = 'galaxy-fine-star-geometry';
  const material = new THREE.MeshBasicMaterial({
    name: 'galaxy-fine-stars',
    color: 0xffffff,
    fog: false,
    toneMapped: false,
    depthWrite: false,
  });
  const stars = new THREE.InstancedMesh(geometry, material, STAR_COUNT);
  stars.name = 'galaxy-fine-stars';
  stars.renderOrder = -50;
  stars.frustumCulled = false;
  stars.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  disableRaycast(stars);

  const random = seededRandom(GALAXY_SEED);
  const galacticNormal = new THREE.Vector3(.31, .86, -.40).normalize();
  const axisU = new THREE.Vector3(0, 0, 1).cross(galacticNormal).normalize();
  const axisV = new THREE.Vector3().crossVectors(galacticNormal, axisU).normalize();
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();

  for (let i = 0; i < STAR_COUNT; i++) {
    if (random() < .58) {
      const longitude = random() * Math.PI * 2;
      const latitude = Math.pow(random() * 2 - 1, 3) * .32;
      const cosLatitude = Math.cos(latitude);
      direction.copy(axisU).multiplyScalar(Math.cos(longitude) * cosLatitude)
        .addScaledVector(axisV, Math.sin(longitude) * cosLatitude)
        .addScaledVector(galacticNormal, Math.sin(latitude));
    } else {
      const y = random() * 2 - 1;
      const radius = Math.sqrt(1 - y * y);
      const longitude = random() * Math.PI * 2;
      direction.set(Math.cos(longitude) * radius, y, Math.sin(longitude) * radius);
    }
    direction.normalize();
    position.copy(direction).multiplyScalar(33 + random() * 9.5);
    const rareBright = random() > .985 ? .055 : 0;
    const size = .025 + random() * .050 + rareBright;
    scale.setScalar(size);
    matrix.compose(position, rotation, scale);
    stars.setMatrixAt(i, matrix);

    const temperature = random();
    if (temperature < .22) color.setRGB(.54, .61, .84);
    else if (temperature > .91) color.setRGB(.78, .65, .72);
    else color.setRGB(.68, .72, .82);
    color.multiplyScalar(.72 + random() * .24);
    stars.setColorAt(i, color);
  }
  stars.instanceMatrix.needsUpdate = true;
  if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
  stars.userData.seed = GALAXY_SEED;
  stars.userData.starCount = STAR_COUNT;
  stars.userData.animated = false;
  return stars;
}

function createPlatformGeometry(): THREE.BufferGeometry {
  const { width, length, floorY, thickness } = QUIET_ZONE_LAYOUT;
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const segments = 96;
  const rings = 14;
  const positions: number[] = [0, floorY, 0];
  const uvs: number[] = [.5, .5];
  const indices: number[] = [];

  for (let ring = 1; ring <= rings; ring++) {
    const t = ring / rings;
    const bevel = Math.max(0, (t - .89) / .11);
    const smoothBevel = bevel * bevel * (3 - 2 * bevel);
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const x = Math.sign(c) * Math.pow(Math.abs(c), .38) * halfWidth * t;
      const z = Math.sign(s) * Math.pow(Math.abs(s), .38) * halfLength * t;
      positions.push(x, floorY - smoothBevel * thickness * .28, z);
      uvs.push(x / width + .5, z / length + .5);
    }
  }

  for (let i = 0; i < segments; i++) {
    indices.push(0, 1 + (i + 1) % segments, 1 + i);
  }
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = inner + segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = inner + i, b = inner + next, c = outer + i, d = outer + next;
      indices.push(a, b, d, a, d, c);
    }
  }

  const outerTop = 1 + (rings - 1) * segments;
  const outerBottom = positions.length / 3;
  for (let i = 0; i < segments; i++) {
    const source = (outerTop + i) * 3;
    positions.push(positions[source], floorY - thickness, positions[source + 2]);
    uvs.push(uvs[(outerTop + i) * 2], uvs[(outerTop + i) * 2 + 1]);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(outerTop + i, outerBottom + i, outerBottom + next,
      outerTop + i, outerBottom + next, outerTop + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'galaxy-quiet-platform-geometry';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createApronGeometry(): THREE.BufferGeometry {
  const { width, length, floorY, thickness } = QUIET_ZONE_LAYOUT;
  const segments = 96;
  const rings = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring++) {
    const edge = ring / rings;
    const eased = edge * edge * (3 - 2 * edge);
    const halfWidth = width / 2 + eased * 1.85;
    const halfLength = length / 2 + eased * 1.85;
    const exponent = .38 + edge * .14;
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      const irregular = 1 + eased * (.022 * Math.sin(angle * 7 + .8) + .014 * Math.sin(angle * 13 - .3));
      const x = Math.sign(c) * Math.pow(Math.abs(c), exponent) * halfWidth * irregular;
      const z = Math.sign(s) * Math.pow(Math.abs(s), exponent) * halfLength * irregular;
      const drop = thickness * .28 + eased * (.72 + thickness * .72);
      positions.push(x, floorY - drop, z);
      uvs.push(edge, i / segments);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    const inner = ring * segments;
    const outer = inner + segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = inner + i, b = inner + next, c = outer + i, d = outer + next;
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'galaxy-mist-apron-geometry';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createQuietPlatformMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: 'galaxy-obsidian-basalt',
    color: 0x11131c,
    roughness: .88,
    metalness: .08,
    fog: false,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vGalaxyStonePosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGalaxyStonePosition = position;');
    shader.fragmentShader = /* glsl */ `
      varying vec3 vGalaxyStonePosition;
      float stoneHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float stoneNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(stoneHash(i), stoneHash(i+vec2(1,0)), f.x),
          mix(stoneHash(i+vec2(0,1)), stoneHash(i+vec2(1,1)), f.x), f.y);
      }
      ${shader.fragmentShader}`
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec2 mineralUV = vGalaxyStonePosition.xz;
        float grain = stoneNoise(mineralUV * 7.0) * .62 + stoneNoise(mineralUV * 31.0) * .38;
        float vein = smoothstep(.82, .97, stoneNoise(mineralUV * vec2(1.7, 13.0) + vec2(4.2, .8)));
        diffuseColor.rgb *= .79 + grain * .19;
        diffuseColor.rgb += vec3(.024, .027, .050) * vein * .28;
      `);
  };
  material.customProgramCacheKey = () => 'galaxy-obsidian-basalt-v1';
  return material;
}

/** The galaxy gets its own dark mineral terrace; it never borrows the cloud-sea floor. */
export function createGalaxyQuietZone(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'quiet-zone';
  disableRaycast(root);

  const platform = new THREE.Mesh(createPlatformGeometry(), createQuietPlatformMaterial());
  platform.name = 'quiet-platform';
  platform.userData.coreLayout = QUIET_ZONE_LAYOUT;
  platform.receiveShadow = true;
  disableRaycast(platform);

  const apronMaterial = new THREE.ShaderMaterial({
    name: 'galaxy-quiet-cosmic-mist',
    vertexShader: /* glsl */ `
      varying vec2 vApronUv;
      varying vec3 vApronPosition;
      void main() {
        vApronUv = uv;
        vApronPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vApronUv;
      varying vec3 vApronPosition;
      float apronHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float mineral = apronHash(floor(vApronPosition.xz * 7.0));
        float edge = smoothstep(.02, .34, vApronUv.x) * (1.0 - smoothstep(.58, 1.0, vApronUv.x));
        float brokenEdge = 1.0 - smoothstep(.76, 1.02, vApronUv.x + (mineral - .5) * .10);
        vec3 color = mix(vec3(.016, .018, .030), vec3(.025, .020, .044), vApronUv.x);
        gl_FragColor = vec4(color, edge * brokenEdge * .54);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const apron = new THREE.Mesh(createApronGeometry(), apronMaterial);
  apron.name = 'galaxy-mist-apron';
  apron.renderOrder = -2;
  disableRaycast(apron);

  root.add(platform, apron);
  root.userData.animated = false;
  return root;
}

export function createGalaxyShell(_context: WorldShellContext): WorldShell {
  const root = new THREE.Group();
  root.name = 'world-shell-galaxy';
  disableRaycast(root);

  const skyMaterial = new THREE.ShaderMaterial({
    name: 'galaxy-deep-sky',
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), skyMaterial);
  sky.name = 'galaxy-deep-sky';
  sky.renderOrder = -100;
  disableRaycast(sky);

  const stars = createStarField();

  const planetMaterial = new THREE.ShaderMaterial({
    name: 'galaxy-distant-planet',
    vertexShader: planetVertexShader,
    fragmentShader: planetFragmentShader,
    fog: false,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(2.3, 24, 12), planetMaterial);
  planet.name = 'galaxy-distant-planet';
  planet.position.set(-20.5, 10.8, -33.5);
  planet.rotation.set(.08, -.34, -.06);
  planet.renderOrder = -20;
  disableRaycast(planet);

  root.add(sky, stars, planet);
  root.userData.galaxy = {
    seed: GALAXY_SEED,
    starCount: STAR_COUNT,
    drawCalls: 3,
    animated: false,
  };
  const owned = ownedWorldShell(root);
  let disposed = false;
  return {
    ...owned,
    dispose() {
      if (disposed) return;
      disposed = true;
      stars.dispose();
      owned.dispose();
    },
  };
}
