/*
[INPUT]: Three.js 球网格、台面与皮壳几何、米制球半径
[OUTPUT]: 米制表面 UV 和单次绘制的球底接触阴影
[POS]: 纯视觉接触层；读取最终显示球位，兼容真实对局、落袋及规划预览
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
import * as THREE from 'three';

/** 世界平面 UV，允许负值平铺，避免半张台呢被 ClampToEdge 拉成同一条纹。 */
export function applyClothUV(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = -p.getZ(i);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 袋口顶面和垂直皮裙分别展开；只写 UV，实际站点与所有三角形保持一致。 */
export function applyLeatherUV(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) / .035;
    uv[i * 2 + 1] = (ny >= nx && ny >= nz ? -p.getZ(i) : p.getY(i)) / .035;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 接触阴影只表达球与呢面遮光，不按速度制造拖尾，也不产生新的动画循环。 */
export function createBallContacts(radius: number, capacity = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(5, 15, 10, .66)');
  gradient.addColorStop(.28, 'rgba(5, 15, 10, .40)');
  gradient.addColorStop(.58, 'rgba(5, 15, 10, .12)');
  gradient.addColorStop(1, 'rgba(5, 15, 10, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const geometry = new THREE.PlaneGeometry(radius * 2.25, radius * 2.25);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'ball-contact-shadows';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = 1;
  const matrix = new THREE.Matrix4();
  return {
    mesh,
    sync(balls: readonly THREE.Mesh[]) {
      for (let i = 0; i < capacity; i++) {
        const ball = balls[i];
        // 入袋后、规划隐藏后同步消失；不在袋口画一张悬空黑片。
        const visible = ball?.visible && Math.abs(ball.position.y - radius) < .0005;
        matrix.makeScale(visible ? 1 : 0, 1, visible ? 1 : 0);
        matrix.setPosition(ball?.position.x ?? 0, .00025, ball?.position.z ?? 0);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
