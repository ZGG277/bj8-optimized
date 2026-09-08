/*
[INPUT]: 依赖浏览器 Canvas API 与 Three.js CanvasTexture
[OUTPUT]: 对外提供米制无缝台呢、细皮革、木纹、清晰球号与六点母球的程序化贴图工厂
[POS]: 渲染资源层；只生成纹理，不持有场景或对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 程序化贴图：绒布（带倒顺毛）、木纹、法线噪声
 * 全部在 Canvas 上生成，无外部资源依赖
 */
import * as THREE from 'three';

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** 确定性二维噪声；避免每次加载时台呢的明暗和质感随机变化。 */
function clothNoise(x: number, y: number, seed: number) {
  let hash = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (seed >>> 1), 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

/** 小型确定性 PRNG：同一种资源在刷新、截图门禁和不同设备上保持同一纹理。 */
function textureRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一块 160mm 的无缝细呢：台面与包库共享相同的真实纹理尺度。 */
export const CLOTH_TILE_METRES = 0.16;
export function makeClothMaps(size = 512): {
  map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture;
} {
  const contexts = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas.getContext('2d')!;
  });
  const data = contexts.map(ctx => ctx.createImageData(size, size));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // 整数周期保证接缝连续；高频纤维在远景由 mipmap 自然退场。
    const px = x / size * Math.PI * 2, py = y / size * Math.PI * 2;
    const warp = Math.sin(px * 128 + Math.sin(py * 64) * .22);
    const weft = Math.sin(py * 192);
    const nap = Math.sin(py * 4 + Math.sin(px * 2) * .3);
    const grain = clothNoise(x, y, 0x73a21) - .5;
    const tone = warp * .65 + weft * .4 + grain * 1.3 + nap * .25;
    const i = (y * size + x) * 4;
    data[0].data.set([clampByte(10 + tone * .6), clampByte(91 + tone), clampByte(60 + tone * .7), 255], i);
    data[1].data.set([clampByte(128 + Math.cos(px * 128) * 9),
      clampByte(128 + Math.cos(py * 192) * 13 + nap * 2), 255, 255], i);
    const rough = clampByte(239 + warp * 3 + grain * 5 + nap * 2);
    data[2].data.set([rough, rough, rough, 255], i);
  }
  const maps = contexts.map((ctx, i) => {
    ctx.putImageData(data[i], 0, 0);
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.setScalar(1 / CLOTH_TILE_METRES);
    texture.anisotropy = 8;
    return texture;
  });
  return { map: maps[0], normalMap: maps[1], roughnessMap: maps[2] };
}

/** 深色木纹贴图 */
export function makeWoodTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = textureRandom(0x57_4f_4f_44 ^ size);

  ctx.fillStyle = '#3a2413';
  ctx.fillRect(0, 0, size, size);

  // 木纹：横向波状条纹
  for (let i = 0; i < 90; i++) {
    const y0 = random() * size;
    const amp = 2 + random() * 6;
    const freq = 0.008 + random() * 0.02;
    const phase = random() * Math.PI * 2;
    const light = random() > 0.45;
    ctx.strokeStyle = light
      ? `rgba(140,90,50,${0.10 + random() * 0.16})`
      : `rgba(20,10,5,${0.12 + random() * 0.18})`;
    ctx.lineWidth = 1 + random() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 4) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.7 + phase * 2) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 木节
  for (let i = 0; i < 4; i++) {
    const x = random() * size;
    const y = random() * size;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, 14 + random() * 10);
    grad.addColorStop(0, 'rgba(25,12,6,0.55)');
    grad.addColorStop(0.6, 'rgba(60,35,18,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 30, y - 30, 60, 60);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 皮革贴图（袋口边） */
export function makeLeatherTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = textureRandom(0x4c_45_41_54 ^ size);

  ctx.fillStyle = '#e4dccb';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = random() > 0.5
      ? `rgba(255,247,227,${0.10 + random() * 0.10})`
      : `rgba(42,29,18,${0.06 + random() * 0.10})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const BALL_COLORS: Record<number, string> = {
  1: '#f0c419', 2: '#1656b8', 3: '#d42e1e', 4: '#5b2d90', 5: '#ef7d1a', 6: '#0d7a46', 7: '#8e1f2f', 8: '#141414',
  9: '#f0c419', 10: '#1656b8', 11: '#d42e1e', 12: '#5b2d90', 13: '#ef7d1a', 14: '#0d7a46', 15: '#8e1f2f',
};

/** 球体贴图（等距柱状 2:1，双半球号码） */
export function makeBallTexture(number: number, group: string): THREE.CanvasTexture {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const random = textureRandom(0x42_41_4c_4c ^ number);

  const color = BALL_COLORS[number];
  ctx.fillStyle = group === 'stripe' ? '#f6f1e2' : color;
  ctx.fillRect(0, 0, w, h);

  if (group === 'stripe') {
    ctx.fillStyle = color;
    ctx.fillRect(0, h * 0.30, w, h * 0.40);
  }

  // 轻微做旧
  for (let i = 0; i < 500; i++) {
    const x = random() * w;
    const y = random() * h;
    ctx.fillStyle = `rgba(60,50,30,${random() * 0.02})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // 号码徽标：赤道上相对两侧各一个
  const badgeR = h * 0.14;
  for (const cx of [w * 0.25, w * 0.75]) {
    ctx.fillStyle = '#f8f3e6';
    ctx.beginPath();
    ctx.arc(cx, h * 0.5, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#151515';
    ctx.font = `700 ${badgeR * 1.15}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), cx, h * 0.52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeCueBallTexture(): THREE.CanvasTexture {
  const w = 1024, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fbf7ec';
  ctx.fillRect(0, 0, w, h);
  // 六个球面测量点，直接随现有物理角速度旋转；两极用球面距离绘制，避免 UV 拉长。
  const dots = [[0, 0], [Math.PI / 2, 0], [Math.PI, 0], [-Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]];
  const pixels = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const lat = (0.5 - y / h) * Math.PI;
    const lon = x / w * Math.PI * 2;
    const inside = dots.some(([dlon, dlat]) => Math.sin(lat) * Math.sin(dlat)
      + Math.cos(lat) * Math.cos(dlat) * Math.cos(lon - dlon) > Math.cos(.061));
    if (inside) pixels.data.set([166, 36, 29, 255], (y * w + x) * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
