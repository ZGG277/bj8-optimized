import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sceneSource from '../Scene3D.ts?raw';
import { cloneWorld, createInitialWorld, POCKETS, TABLE } from '../physics';
import { sceneCost } from '../minitool/render-guard';
import { createImpactFeedback } from './impact-feedback';

const R = TABLE.ballRadius;
const dispose: (() => void)[] = [];
afterEach(() => { dispose.splice(0).forEach(release => release()); });

function setup(reducedMotion = false) {
  const feedback = createImpactFeedback(R, reducedMotion);
  dispose.push(() => feedback.dispose());
  const geometry = new THREE.SphereGeometry(R, 12, 8);
  const material = new THREE.MeshBasicMaterial();
  dispose.push(() => { geometry.dispose(); material.dispose(); });
  const balls = Array.from({ length: 16 }, (_, i) => {
    const ball = new THREE.Mesh(geometry, material);
    ball.position.set(i / 20, R, -i / 20);
    return ball;
  });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 3);
  camera.lookAt(0, 0, 0);
  const stars = feedback.root.getObjectByName('crystal-eight-point-glints') as THREE.InstancedMesh;
  const rings = feedback.root.getObjectByName('pocket-entry-rings') as THREE.InstancedMesh;
  const particles = feedback.root.getObjectByName('pocket-entry-particles') as THREE.InstancedMesh;
  return { feedback, balls, camera, stars, rings, particles };
}

function collisionWorld(shot = 1) {
  const world = createInitialWorld();
  world.shot = shot;
  world.time = 1;
  world.events = [{ type: 'ball-collision', first: 0, second: 1, time: .125, speed: 1 }];
  return world;
}

function pocketWorld(shot = 1, ball = 2) {
  const world = createInitialWorld();
  world.shot = shot;
  world.time = 1;
  world.events = [{
    type: 'pocket', ball, pocket: 0, time: .8, speed: 1,
    entryX: POCKETS[0].x + .018, entryZ: POCKETS[0].z - .012,
    entryVx: .2, entryVz: -.8,
  }];
  return world;
}

function matrixOf(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

function visibleInstances(mesh: THREE.InstancedMesh) {
  let count = 0;
  for (let i = 0; i < mesh.count; i++) if (matrixOf(mesh, i).getMaxScaleOnAxis() > 0) count++;
  return count;
}

describe('impact feedback', () => {
  it('is mounted for daylight and fallback and owns the bounded render lifetime', () => {
    expect(sceneSource).toContain("if(!daylightEnabled()){this.crystalDetails = createCrystalBallDetails(R);");
    expect(sceneSource).toContain('this.impactFeedback = createImpactFeedback(R, this.motionPreference?.matches ?? false);');
    expect(sceneSource).toContain('this.scene.add(this.impactFeedback.root);');
    expect(sceneSource).toContain('this.impactFeedback?.observe(world);');
    expect(sceneSource).toContain('this.impactFeedback?.sync(this.ballMeshes, this.camera, dt);');
    expect(sceneSource).toContain('Boolean(this.impactFeedback?.active)');
    expect(sceneSource).toContain('this.impactFeedback?.setHot(tier === \'hot\');');
    expect(sceneSource).toContain('this.impactFeedback?.dispose();');
  });

  it('deduplicates cloned collision events, expires, and re-triggers on a later shot', () => {
    const { feedback, balls, camera, stars } = setup();
    const world = collisionWorld();
    feedback.observe(world);
    feedback.sync(balls, camera, .01);
    expect(matrixOf(stars, 0).getMaxScaleOnAxis()).toBeGreaterThan(0);
    expect(matrixOf(stars, 1).getMaxScaleOnAxis()).toBeGreaterThan(0);
    feedback.sync(balls, camera, .17);
    expect(feedback.active).toBe(false);
    feedback.observe(cloneWorld(world));
    expect(feedback.active).toBe(false);
    feedback.observe(collisionWorld(2));
    expect(feedback.active).toBe(true);
    feedback.sync(balls, camera, .23);
    const replay = collisionWorld(2);
    replay.time = 0;
    feedback.observe(replay);
    expect(feedback.active).toBe(true);
  });

  it('ignores low-speed contacts and hides glints with their source ball', () => {
    const { feedback, balls, camera, stars } = setup();
    const world = collisionWorld();
    world.events[0].speed = .1;
    feedback.observe(world);
    expect(feedback.active).toBe(false);
    balls[1].visible = false;
    feedback.observe(collisionWorld(2));
    feedback.sync(balls, camera, 0);
    expect(matrixOf(stars, 0).getMaxScaleOnAxis()).toBeGreaterThan(0);
    expect(matrixOf(stars, 1).getMaxScaleOnAxis()).toBe(0);
  });

  it('places the ring and particles at the real pocket entry and expires without new events', () => {
    const { feedback, balls, camera, rings, particles } = setup();
    const world = pocketWorld();
    const event = world.events[0];
    feedback.observe(world);
    feedback.sync(balls, camera, 0);
    const position = new THREE.Vector3().setFromMatrixPosition(matrixOf(rings, 0));
    expect(event.type).toBe('pocket');
    expect(position.x).toBeCloseTo(event.type === 'pocket' ? event.entryX : 0, 6);
    expect(position.z).toBeCloseTo(event.type === 'pocket' ? event.entryZ : 0, 6);
    expect(position.x).not.toBeCloseTo(POCKETS[0].x, 8);
    expect(visibleInstances(rings)).toBe(1);
    expect(visibleInstances(particles)).toBe(8);
    expect(feedback.active).toBe(true);
    feedback.sync(balls, camera, .6);
    expect(visibleInstances(rings)).toBe(0);
    expect(visibleInstances(particles)).toBe(0);
    expect(feedback.active).toBe(false);
  });

  it('does not restart a cloned pocket pulse and can reuse the same entry on the next shot', () => {
    const { feedback, balls, camera, rings } = setup();
    const world = pocketWorld();
    feedback.observe(world);
    feedback.sync(balls, camera, .2);
    const before = matrixOf(rings, 0).clone();
    feedback.observe(cloneWorld(world));
    feedback.sync(balls, camera, 0);
    expect(matrixOf(rings, 0).elements).toEqual(before.elements);
    feedback.sync(balls, camera, .4);
    expect(feedback.active).toBe(false);
    feedback.observe(pocketWorld(2));
    feedback.sync(balls, camera, 0);
    expect(feedback.active).toBe(true);
    expect(visibleInstances(rings)).toBe(1);
  });

  it('reduces hot-tier particles and suppresses spatial effects for reduced motion', () => {
    const hot = setup();
    hot.feedback.setHot(true);
    hot.feedback.observe(pocketWorld());
    hot.feedback.sync(hot.balls, hot.camera, 0);
    expect(visibleInstances(hot.rings)).toBe(1);
    expect(visibleInstances(hot.particles)).toBe(4);

    const reduced = setup(true);
    reduced.feedback.observe(pocketWorld());
    reduced.feedback.sync(reduced.balls, reduced.camera, 0);
    expect(visibleInstances(reduced.stars)).toBe(1);
    expect(visibleInstances(reduced.rings)).toBe(0);
    expect(visibleInstances(reduced.particles)).toBe(0);
    reduced.feedback.sync(reduced.balls, reduced.camera, .23);
    expect(reduced.feedback.active).toBe(false);
  });

  it('uses neutral pearl feedback for a cue-ball pocket', () => {
    const { feedback, balls, camera, rings, particles } = setup();
    feedback.observe(pocketWorld(1, 0));
    feedback.sync(balls, camera, 0);
    const ringColor = new THREE.Color(), particleColor = new THREE.Color();
    rings.getColorAt(0, ringColor);
    particles.getColorAt(0, particleColor);
    const neutral = new THREE.Color(0xdde7ea), particleNeutral = new THREE.Color(0xe6eef0);
    expect(ringColor.r).toBeCloseTo(neutral.r, 5);
    expect(ringColor.g).toBeCloseTo(neutral.g, 5);
    expect(ringColor.b).toBeCloseTo(neutral.b, 5);
    expect(particleColor.r).toBeCloseTo(particleNeutral.r, 5);
    expect(particleColor.g).toBeCloseTo(particleNeutral.g, 5);
    expect(particleColor.b).toBeCloseTo(particleNeutral.b, 5);
  });

  it('uses three instanced draw calls and releases all owned GPU resources', () => {
    const { feedback } = setup();
    const scene = new THREE.Scene();
    scene.add(feedback.root);
    expect(sceneCost(scene).calls).toBe(3);
    expect(feedback.root.children.every(object => object instanceof THREE.InstancedMesh)).toBe(true);
    const meshes = feedback.root.children as THREE.InstancedMesh[];
    const geometrySpies = meshes.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const materialSpies = meshes.map(mesh => vi.spyOn(mesh.material as THREE.Material, 'dispose'));
    const instanceSpies = meshes.map(mesh => vi.spyOn(mesh, 'dispose'));
    feedback.dispose();
    expect(feedback.root.parent).toBeNull();
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    instanceSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });
});
