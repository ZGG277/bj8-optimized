/*
[INPUT]: 只读静区尺寸和按需重绘回调
[OUTPUT]: WorldShell 资源合同、空壳与云海专属的暗石静区和雾化缓坡
[POS]: 外围视觉边界；无游戏状态、相机、renderer 或时钟
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';

export const QUIET_ZONE_LAYOUT = Object.freeze({ width: 6, length: 8, floorY: -.82, thickness: .18 });
export type WorldShellContext = Readonly<{
  layout: typeof QUIET_ZONE_LAYOUT;
  requestRender: () => void;
}>;
export type WorldShell = {
  root: THREE.Group;
  ready: Promise<boolean>;
  dispose: () => void;
};
export type WorldShellFactory = (context: WorldShellContext) => WorldShell;

/** 独占的程序化几何/材质在移出场景后释放；从不回收借用的基线资产。 */
export function ownedWorldShell(root: THREE.Group, textures: readonly THREE.Texture[] = []): WorldShell {
  let disposed = false;
  root.userData.assetState = 'ready';
  return {
    root,
    ready: Promise.resolve(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of new Set(textures)) texture.dispose();
      root.clear();
      root.userData.assetState = 'disposed';
    },
  };
}

export function createEmptyWorldShell(): WorldShell {
  const root = new THREE.Group();
  root.name = 'world-shell-empty';
  return ownedWorldShell(root);
}

/** 室内组借用同一次 GLB 加载的资源，由 Scene3D 最终统一去重释放。 */
export function createStudioWorldShell(): WorldShell {
  const root = new THREE.Group();
  root.name = 'world-shell-studio';
  return { root, ready: Promise.resolve(true), dispose() { root.userData.assetState = 'disposed'; } };
}

/** 室内沿用原石地面；云海用相同核心尺寸的冷灰石质静区及低落差外缘。 */
export function createQuietZone(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'quiet-zone';
  const { width, length, floorY, thickness } = QUIET_ZONE_LAYOUT;
  const rings = 24, segments = 128;
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      const extentX = width / 2 + 1.15, extentZ = length / 2 + 1.15;
      const x = Math.sign(c) * Math.pow(Math.abs(c), .42) * extentX * t;
      const z = Math.sign(s) * Math.pow(Math.abs(s), .42) * extentZ * t;
      const edge = Math.max(0, (t - .70) / .30);
      const drop = edge * edge * (3 - 2 * edge) * (thickness + .70);
      positions.push(x, floorY - drop, z);
      uv.push(x, z);
      if (ring < rings && i < segments) {
        const a = ring * (segments + 1) + i, b = a + segments + 1;
        if (ring > 0) indices.push(a, a + 1, b);
        indices.push(a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    name: 'cloud-slate-quiet', color: 0x242d34, roughness: .98, metalness: 0, fog: false,
    transparent: true, depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vQuietPosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvQuietPosition = position;');
    shader.fragmentShader = /* glsl */ `
      varying vec3 vQuietPosition;
      float stoneHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float stoneNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(stoneHash(i),stoneHash(i+vec2(1,0)),f.x),
          mix(stoneHash(i+vec2(0,1)),stoneHash(i+vec2(1,1)),f.x),f.y);
      }
      ${shader.fragmentShader}`
      .replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        vec2 stoneUV = vQuietPosition.xz;
        float mineral = stoneNoise(stoneUV * 2.4) * .55 + stoneNoise(stoneUV * 11.0) * .3 + stoneNoise(stoneUV * 68.0) * .15;
        diffuseColor.rgb *= .75 + mineral * .44;
      `)
      .replace('#include <opaque_fragment>', /* glsl */ `
        vec2 edgeQ = abs(vQuietPosition.xz) - vec2(2.35, 3.35);
        float edgeD = length(max(edgeQ,0.0)) + min(max(edgeQ.x,edgeQ.y),0.0) - .65;
        float mist = smoothstep(-.45, 1.2, edgeD + (stoneNoise(stoneUV * 2.2) - .5) * .35);
        outgoingLight = mix(outgoingLight, vec3(.038, .055, .078), mist * .90);
        diffuseColor.a *= 1.0 - smoothstep(-.1, 1.05, edgeD + (stoneNoise(stoneUV * 3.1) - .5) * .24);
        #include <opaque_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'cloud-slate-v2';
  const slab = new THREE.Mesh(geometry, material);
  slab.name = 'quiet-platform';
  slab.userData.coreLayout = QUIET_ZONE_LAYOUT;
  slab.receiveShadow = true;
  slab.raycast = () => {};
  root.add(slab);
  return root;
}
