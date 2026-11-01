/**
 * [INPUT]: 真实球碰/落袋事件、球网格与相机；共享 POCKETS 只提供袋口尺寸。
 * [OUTPUT]: 实例化短 glint、entryX/entryZ 袋口光圈与金色/珠光粒子；减少动态只保留 glint，热档减半粒子。
 * [POS]: 纯视觉反馈层；事件去重、跨杆重置、有限生命周期和完整资源释放，不改物理、规则或相机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { POCKETS, type BilliardsWorld } from '../physics';

const COLLISION_GLINT_SECONDS = .16;
const POCKET_GLINT_SECONDS = .22;
const RING_SECONDS = .44;
const PARTICLE_SECONDS = .52;
const MAX_POCKET_PULSES = 6;
const PARTICLES_PER_PULSE = 8;
const HOT_PARTICLES_PER_PULSE = 4;

function starGeometry(radius: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const r = i % 2 ? radius * .12 : radius * (i % 4 === 0 ? 1 : .62);
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

type PocketPulse = {
  elapsed: number;
  entryX: number;
  entryZ: number;
  mouthWidth: number;
  seed: number;
  neutral: boolean;
};

export function createImpactFeedback(radius: number, reducedMotion = false) {
  const root = new THREE.Group();
  root.name = 'impact-feedback';

  const stars = new THREE.InstancedMesh(
    starGeometry(radius * .22),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .86, depthWrite: false }),
    16,
  );
  stars.name = 'crystal-eight-point-glints';
  stars.frustumCulled = false;
  stars.renderOrder = 5;

  const ringGeometry = new THREE.RingGeometry(.76, 1, 40, 1);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .72, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    MAX_POCKET_PULSES,
  );
  rings.name = 'pocket-entry-rings';
  rings.frustumCulled = false;
  rings.renderOrder = 4;

  const particles = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    MAX_POCKET_PULSES * PARTICLES_PER_PULSE,
  );
  particles.name = 'pocket-entry-particles';
  particles.frustumCulled = false;
  particles.renderOrder = 6;
  root.add(stars, rings, particles);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  const color = new THREE.Color();
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const mesh of [stars, rings, particles]) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.setMatrixAt(i, hiddenMatrix);
      if (mesh !== stars) mesh.setColorAt(i, color.set(0x000000));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const flashes = new Float32Array(16);
  let pulses: PocketPulse[] = [];
  let recent = new Set<string>();
  let lastShot = -1;
  let lastTime = -1;
  let hot = false;
  let reduced = reducedMotion;
  let disposed = false;

  const clearTransient = () => {
    flashes.fill(0);
    pulses = [];
  };

  return {
    root,
    get active() {
      return pulses.length > 0 || flashes.some(value => value > 0);
    },
    observe(world: BilliardsWorld) {
      if (disposed) return;
      if (world.shot !== lastShot || world.time < lastTime) {
        clearTransient();
        recent.clear();
      }
      lastShot = world.shot;
      lastTime = world.time;
      const next = new Set<string>();
      for (const [index, event] of world.events.entries()) {
        const key = JSON.stringify([world.shot, index, event]);
        next.add(key);
        if (recent.has(key)) continue;
        if (event.type === 'ball-collision' && event.speed > .2) {
          flashes[event.first] = Math.max(flashes[event.first], COLLISION_GLINT_SECONDS);
          flashes[event.second] = Math.max(flashes[event.second], COLLISION_GLINT_SECONDS);
        }
        if (event.type === 'pocket') {
          flashes[event.ball] = Math.max(flashes[event.ball], POCKET_GLINT_SECONDS);
          if (!reduced) {
            if (pulses.length >= MAX_POCKET_PULSES) pulses.shift();
            pulses.push({
              elapsed: 0,
              entryX: event.entryX,
              entryZ: event.entryZ,
              mouthWidth: POCKETS[event.pocket]?.mouthWidth ?? .12,
              seed: world.shot * 17 + index,
              neutral: event.ball === 0,
            });
          }
        }
      }
      recent = next;
    },
    setHot(value: boolean) {
      hot = value;
    },
    setReducedMotion(value: boolean) {
      reduced = value;
      if (reduced) pulses = [];
    },
    sync(balls: readonly THREE.Mesh[], camera: THREE.Camera, dt: number) {
      if (disposed) return;
      for (let i = 0; i < 16; i++) {
        flashes[i] = Math.max(0, flashes[i] - dt);
        const ball = balls[i];
        const k = ball?.visible ? ball.scale.x : 0;
        position.copy(ball?.position ?? new THREE.Vector3());
        offset.set(0, 0, radius * .8 * k).applyQuaternion(camera.quaternion);
        position.add(offset);
        const pulseScale = reduced ? 1.12 : 1 + flashes[i] * 2;
        scale.setScalar(flashes[i] > 0 ? k * pulseScale : 0);
        matrix.compose(position, camera.quaternion, scale);
        stars.setMatrixAt(i, matrix);
      }
      stars.instanceMatrix.needsUpdate = true;

      pulses = pulses.filter(pulse => (pulse.elapsed += dt) < PARTICLE_SECONDS);
      const particleLimit = hot ? HOT_PARTICLES_PER_PULSE : PARTICLES_PER_PULSE;
      for (let slot = 0; slot < MAX_POCKET_PULSES; slot++) {
        const pulse = pulses[slot];
        if (!pulse || pulse.elapsed >= RING_SECONDS || reduced) {
          rings.setMatrixAt(slot, hiddenMatrix);
          rings.setColorAt(slot, color.set(0x000000));
        } else {
          const progress = pulse.elapsed / RING_SECONDS;
          const ringRadius = pulse.mouthWidth * THREE.MathUtils.lerp(.18, .78, 1 - (1 - progress) ** 2);
          position.set(pulse.entryX, .005, pulse.entryZ);
          scale.set(ringRadius, 1, ringRadius);
          matrix.compose(position, identity, scale);
          rings.setMatrixAt(slot, matrix);
          color.set(pulse.neutral ? 0xdde7ea : 0xffd783).multiplyScalar((1 - progress) ** 1.5);
          rings.setColorAt(slot, color);
        }
        for (let local = 0; local < PARTICLES_PER_PULSE; local++) {
          const index = slot * PARTICLES_PER_PULSE + local;
          if (!pulse || local >= particleLimit || reduced) {
            particles.setMatrixAt(index, hiddenMatrix);
            particles.setColorAt(index, color.set(0x000000));
            continue;
          }
          const progress = pulse.elapsed / PARTICLE_SECONDS;
          const angle = local / PARTICLES_PER_PULSE * Math.PI * 2 + pulse.seed * .37;
          const speed = .09 + local % 3 * .025;
          position.set(
            pulse.entryX + Math.cos(angle) * speed * pulse.elapsed,
            .012 + (.20 + local % 4 * .035) * pulse.elapsed - .45 * pulse.elapsed ** 2,
            pulse.entryZ + Math.sin(angle) * speed * pulse.elapsed,
          );
          scale.setScalar(radius * .14 * (1 - progress * .65));
          matrix.compose(position, identity, scale);
          particles.setMatrixAt(index, matrix);
          color.set(pulse.neutral ? 0xe6eef0 : local % 2 ? 0xfff1d6 : 0xffc55c).multiplyScalar((1 - progress) ** 1.2);
          particles.setColorAt(index, color);
        }
      }
      rings.instanceMatrix.needsUpdate = true;
      particles.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const mesh of [stars, rings, particles]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
      clearTransient();
      recent.clear();
    },
  };
}
