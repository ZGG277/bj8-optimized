import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ownedWorldShell, QUIET_ZONE_LAYOUT } from './world-shell';
const { load, base } = vi.hoisted(() => ({ load: vi.fn(), base: vi.fn() }));
vi.mock('./glb-loader', () => ({ loadGlb: load }));
vi.mock('./castle-platform', () => ({ createCastlePlatform: base }));
import { createHunyuanTerrace } from './hunyuan-terrace';
function fixture() {
  const root = new THREE.Group(), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); root.add(mesh);
  return { root, texture, material, mesh };
}
beforeEach(() => {
  load.mockReset(); base.mockReset();
  base.mockImplementation(() => ownedWorldShell(new THREE.Group()));
});
describe('混元实验外围的资源边界', () => {
  it('只在球桌后方装配独立候选，完成后请求一帧', async () => {
    const f = fixture(), requestRender = vi.fn(); load.mockResolvedValue({ scene: f.root });
    const shell = createHunyuanTerrace({ layout: QUIET_ZONE_LAYOUT, requestRender });
    expect(await shell.ready).toBe(true);
    expect(f.root.position.toArray()).toEqual([0, -.69, -4.0]);
    expect(shell.root.userData.hunyuanAsset).toBe('ready');
    expect(requestRender).toHaveBeenCalledOnce();
    shell.dispose();
  });
  it('加载失败保留原平台，且仍可完成游戏场景初始化', async () => {
    load.mockRejectedValue(new Error('fixture missing asset'));
    const shell = createHunyuanTerrace({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });
    expect(await shell.ready).toBe(true);
    expect(shell.root.userData.hunyuanAsset).toBe('fallback');
    expect(shell.root.userData.assetState).toBe('ready'); shell.dispose();
  });
  it('高温只隐藏可选混元模型，恢复时仍显示同一模型', async () => {
    const f = fixture(); load.mockResolvedValue({ scene: f.root });
    const shell = createHunyuanTerrace({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });
    shell.setHot?.(true); await shell.ready;
    expect(f.root.visible).toBe(false); expect(shell.root.visible).toBe(true);
    shell.setHot?.(false); expect(f.root.visible).toBe(true); shell.dispose();
  });
  it('卸载后才到达的模型不回挂，独占资源只释放一次', async () => {
    let resolve!: (v: { scene: THREE.Group }) => void;
    load.mockReturnValue(new Promise(r => { resolve = r; }));
    const f = fixture();
    const disposeTexture = vi.spyOn(f.texture, 'dispose'), disposeGeometry = vi.spyOn(f.mesh.geometry, 'dispose');
    const shell = createHunyuanTerrace({ layout: QUIET_ZONE_LAYOUT, requestRender: vi.fn() });
    shell.dispose(); shell.dispose(); resolve({ scene: f.root }); await shell.ready;
    expect(disposeTexture).toHaveBeenCalledOnce(); expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(shell.root.children).toHaveLength(0);
  });
});
