/**
 * [INPUT]: 天空与环境共用或独立纹理的最小场景。
 * [OUTPUT]: 检查天空进入显存预算且共用资源不重复计算。
 * [POS]: 渲染预算回归；无需WebGL或浏览器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import {it,expect} from 'vitest';
import {sceneCost} from './render-guard';
it('背景计入显存，共用环境和背景时只计一次',()=>{
  const scene=new THREE.Scene(),sky=new THREE.DataTexture(new Uint8Array(512*256*4),512,256);
  sky.generateMipmaps=false;scene.background=sky;
  expect(sceneCost(scene).textureBytes).toBe(512*256*4);
  scene.environment=sky;
  expect(sceneCost(scene).textureBytes).toBe(512*256*4);
  expect(sceneCost(scene).maxTextureSide).toBe(512);
  sky.dispose();
});
