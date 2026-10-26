import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBlenderWorld } from './blender-world';
import { createEmptyWorldShell } from './world-shell';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { loadAsync = loadAsync; } }));
const asset = { url: 'local-world.glb', shellName: 'World', quietName: 'Quiet' };
function fixture() {
  const scene = new THREE.Group(), world = new THREE.Group(), quiet = new THREE.Group();
  world.name = 'World'; quiet.name = 'Quiet';
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  world.add(new THREE.Mesh(geometry, material)); quiet.add(new THREE.Mesh(geometry, material));
  scene.add(world, quiet);
  return { scene, world, quiet, material, geometry };
}
beforeEach(() => { loadAsync.mockReset(); });
describe('Blender 世界资源装配', () => {
  it.each(['Bamboo', 'Aurora'])('%s 只对不透明世界材质加入距离雾，不改透明光幕', async suffix => {
    const f = fixture(); f.world.name = 'BJ8_World_' + suffix;
    const transparent = new THREE.MeshStandardMaterial({ transparent: true });
    const initialCompile = transparent.onBeforeCompile;
    f.world.add(new THREE.Mesh(new THREE.PlaneGeometry(), transparent));
    loadAsync.mockResolvedValue(f);
    const shell = attachBlenderWorld(createEmptyWorldShell(), new THREE.Group(), { ...asset, shellName: f.world.name }, vi.fn());
    expect(await shell.ready).toBe(true);
    const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <opaque_fragment>' };
    f.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('\nworldHazeDepth = length(');
    expect(shader.fragmentShader).toContain('\n#include <opaque_fragment>');
    expect(f.material.customProgramCacheKey()).toBe('blender-world-haze-' + f.world.name);
    expect(transparent.onBeforeCompile).toBe(initialCompile);
    shell.dispose();
  });
  it('加载成功后替换临时地面，完整模型共享资源只回收一次', async () => {
    const f = fixture(); loadAsync.mockResolvedValue(f);
    const quiet = new THREE.Group(), fallback = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
    quiet.add(fallback);
    const fallbackReleased = vi.fn(); fallback.geometry.addEventListener('dispose', fallbackReleased);
    const shell = attachBlenderWorld(createEmptyWorldShell(), quiet, asset, vi.fn());
    expect(await shell.ready).toBe(true);
    expect(quiet.children).toEqual([f.quiet]);
    expect(fallbackReleased).toHaveBeenCalledTimes(1);
    const events = [f.material, f.material.map!, f.geometry].map(resource => {
      const listener = vi.fn(); resource.addEventListener('dispose', listener); return listener;
    });
    shell.dispose(); shell.dispose();
    events.forEach(listener => expect(listener).toHaveBeenCalledTimes(1));
    expect(quiet.children).toHaveLength(0);
  });
  it('加载失败保留临时暗地面，并明确返回未就绪', async () => {
    loadAsync.mockImplementation(() => Promise.reject(new Error('missing model')));
    const quiet = new THREE.Group(), fallback = new THREE.Group(); quiet.add(fallback);
    const shell = attachBlenderWorld(createEmptyWorldShell(), quiet, asset, vi.fn());
    expect(await shell.ready).toBe(false);
    expect(quiet.children).toEqual([fallback]);
    expect(shell.root.userData.blenderAsset).toBe('fallback');
    shell.dispose();
  });
  it('卸载后晚到的模型只释放，不挂回世界或触发重绘', async () => {
    let resolve!: (value: ReturnType<typeof fixture>) => void;
    loadAsync.mockReturnValue(new Promise(done => { resolve = done; }));
    const redraw = vi.fn(), quiet = new THREE.Group();
    const shell = attachBlenderWorld(createEmptyWorldShell(), quiet, asset, redraw);
    shell.dispose();
    const f = fixture(), released = vi.fn(); f.geometry.addEventListener('dispose', released);
    resolve(f);
    expect(await shell.ready).toBe(false);
    expect(released).toHaveBeenCalledTimes(1);
    expect(quiet.children).toHaveLength(0);
    expect(redraw).not.toHaveBeenCalled();
  });
});
