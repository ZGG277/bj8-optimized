import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStudioEnvironment } from './studio-environment';
import { createEmptyWorldShell } from './world-shell';
import { WORLD_VISUALS } from './world-registry';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { loadAsync = loadAsync; } }));

function asset() {
  const model = new THREE.Group();
  const table = new THREE.Group(); table.name = 'BJ8_TableShell'; table.position.set(.2, .3, .4);
  table.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  const room = new THREE.Group(); room.name = 'BJ8_Room'; room.position.set(0, -.5, 0);
  const floorMaterial = new THREE.MeshStandardMaterial(); floorMaterial.name = 'BJ8_Floor_Stone';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMaterial); floor.name = 'floor'; room.add(floor);
  const pendant = new THREE.Group(); pendant.name = 'BJ8_Pendant';
  model.add(table, room, pendant);
  return { scene: model, table, floor, room, pendant };
}

beforeEach(() => { loadAsync.mockReset(); });
describe('公共资产装配与世界隔离', () => {
  it.each(['galaxy', 'bamboo', 'aurora-lake'] as const)('%s 使用专属暗静区且保留原桌体和操作边界', async worldId => {
    const gltf = asset();
    const scene = new THREE.Group();
    const world = new THREE.Group(); world.name = WORLD_VISUALS[worldId].asset!.shellName;
    const floor = new THREE.Group(); floor.name = WORLD_VISUALS[worldId].asset!.quietName;
    floor.add(new THREE.Mesh(new THREE.PlaneGeometry(6, 8), new THREE.MeshStandardMaterial()));
    scene.add(world, floor);
    loadAsync.mockImplementation((url: string) => Promise.resolve(url === WORLD_VISUALS[worldId].asset!.url ? { scene } : gltf));
    const floorFactory = vi.spyOn(WORLD_VISUALS[worldId], 'quietZone');
    const environment = createStudioEnvironment(new THREE.Texture(), vi.fn(), worldId);
    expect(await environment.ready).toBe(true);
    expect(await environment.worldShell.ready).toBe(true);
    expect(environment.worldShell.root.userData.blenderAsset).toBe('ready');
    expect(environment.quietZone.children).toEqual([floor]);
    environment.root.updateMatrixWorld(true);
    expect(floorFactory).toHaveBeenCalledTimes(1);
    expect(environment.quietZone.getObjectByName('quiet-platform')).toBeTruthy();
    expect(environment.root.userData.worldId).toBe(worldId);
    expect(gltf.table.parent).toBe(gltf.scene);
    expect(gltf.table.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([.2, .3, .4]);
    expect(gltf.room.parent?.visible).toBe(false);
    expect(gltf.pendant.parent?.visible).toBe(false);
    const released = vi.fn();
    (gltf.table.children[0] as THREE.Mesh).geometry.addEventListener('dispose', released);
    environment.dispose();
    expect(released).not.toHaveBeenCalled();
    floorFactory.mockRestore();
  });
  it('室内拆出地面、房间和灯具时保留桌体对象与世界变换', async () => {
    const gltf = asset(); loadAsync.mockResolvedValue(gltf);
    const environment = createStudioEnvironment(new THREE.Texture(), vi.fn(), 'studio');
    expect(await environment.ready).toBe(true);
    environment.root.updateMatrixWorld(true);
    expect(gltf.table.parent).toBe(gltf.scene);
    expect(gltf.table.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([.2, .3, .4]);
    expect(gltf.floor.parent).toBe(environment.quietZone);
    expect(gltf.floor.getWorldPosition(new THREE.Vector3()).y).toBe(-.5);
    expect(gltf.room.parent).toBe(environment.worldShell.root);
    environment.setCameraHeight(2); expect(gltf.pendant.visible).toBe(false);
    environment.setCameraHeight(1); expect(gltf.pendant.visible).toBe(true);
    environment.dispose();
  });
  it('云海与空壳共用桌体和静区，关闭壳体不释放借用的桌体', async () => {
    const gltf = asset(); loadAsync.mockResolvedValue(gltf);
    const environment = createStudioEnvironment(new THREE.Texture(), vi.fn(), 'cloud-sea', createEmptyWorldShell);
    await environment.ready;
    expect(gltf.table.parent).toBe(gltf.scene);
    expect(environment.quietZone.getObjectByName('quiet-platform')).toBeTruthy();
    expect(gltf.room.parent?.visible).toBe(false);
    const released = vi.fn(); (gltf.table.children[0] as THREE.Mesh).geometry.addEventListener('dispose', released);
    environment.worldShell.dispose();
    expect(released).not.toHaveBeenCalled();
    expect(environment.root.getObjectByName('BJ8_TableShell')).toBe(gltf.table);
    environment.dispose();
  });
  it.each(['cloud-sea', 'galaxy', 'bamboo', 'aurora-lake'] as const)('%s 外围构造失败仍装配真实桌体与静区', async worldId => {
    loadAsync.mockResolvedValue(asset());
    const environment = createStudioEnvironment(new THREE.Texture(), vi.fn(), worldId, () => { throw new Error('shell failed'); });
    expect(await environment.ready).toBe(true);
    expect(environment.root.userData.shellState).toBe('fallback');
    expect(environment.root.getObjectByName('BJ8_TableShell')).toBeTruthy();
    expect(environment.quietZone.getObjectByName('quiet-platform')).toBeTruthy();
    environment.dispose();
  });
  it('GLB 加载失败时保留台底与独立平台', async () => {
    loadAsync.mockImplementation(() => Promise.reject(new Error('asset failed')));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const environment = createStudioEnvironment(new THREE.Texture(), vi.fn(), 'cloud-sea');
    expect(await environment.ready).toBe(false);
    expect(environment.root.getObjectByName('studio-fallback')?.visible).toBe(true);
    expect(environment.quietZone.getObjectByName('quiet-platform')).toBeTruthy();
    environment.dispose(); warning.mockRestore();
  });
  it('卸载后晚到的 GLB 被释放，不挂回场景，也不触发重绘', async () => {
    let finish!: (value: ReturnType<typeof asset>) => void;
    loadAsync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const redraw = vi.fn(), environment = createStudioEnvironment(new THREE.Texture(), redraw, 'cloud-sea');
    const gltf = asset(), released = vi.fn();
    (gltf.table.children[0] as THREE.Mesh).geometry.addEventListener('dispose', released);
    environment.dispose(); finish(gltf);
    expect(await environment.ready).toBe(false);
    expect(released).toHaveBeenCalledTimes(1);
    expect(environment.root.getObjectByName('BJ8_TableShell')).toBeUndefined();
    expect(redraw).not.toHaveBeenCalled();
  });
});
