/*
[INPUT]: 依赖浏览器 Canvas API 与 Three.js CanvasTexture
[OUTPUT]: 对外提供台呢、木纹、皮革、袋腔暗口、球体与母球的程序化贴图工厂
[POS]: 渲染资源层；台呢与袋口纹理使用固定种子保持视觉回归稳定，不持有场景或对局状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * 程序化贴图：绒布（带倒顺毛）、木纹、法线噪声
 * 全部在 Canvas 上生成，无外部资源依赖
 */
import * as THREE from 'three';

/** Mulberry32：小型、无分配的固定种子随机源，只用于程序化视觉资产。 */
function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const CLOTH_COLOR_SEED = 0x42a11ce;
const CLOTH_SURFACE_SEED = 0x8f31d07;
const LEATHER_SEED = 0x1ea7e4;

/** 带方向性的台呢绒布贴图（颜色 + 高度噪声） */
export function makeClothMaps(widthPx = 1024, heightPx = 2048): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d')!;

  const colorRandom = makeSeededRandom(CLOTH_COLOR_SEED);

  // 底色：比赛绿在长边上呈现微弱倒顺毛，中场受顶灯影响稍亮。
  const base = ctx.createLinearGradient(0, 0, 0, heightPx);
  base.addColorStop(0, '#084b34');
  base.addColorStop(0.22, '#0a5b3d');
  base.addColorStop(0.5, '#0d6846');
  base.addColorStop(0.78, '#0b5e40');
  base.addColorStop(1, '#074730');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // 边缘的擦光少于中场，避免台呢读成一块均匀的绿色塑料片。
  const edgeShade = ctx.createLinearGradient(0, 0, widthPx, 0);
  edgeShade.addColorStop(0, 'rgba(0, 20, 12, 0.18)');
  edgeShade.addColorStop(0.18, 'rgba(0, 20, 12, 0.03)');
  edgeShade.addColorStop(0.5, 'rgba(125, 190, 154, 0.035)');
  edgeShade.addColorStop(0.82, 'rgba(0, 20, 12, 0.03)');
  edgeShade.addColorStop(1, 'rgba(0, 20, 12, 0.18)');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // 低频绒面色差：面积小、透明度低，只打破数字渐变的完美感。
  const areaScale = (widthPx * heightPx) / (1024 * 2048);
  const patches = Math.max(90, Math.round(420 * areaScale));
  for (let i = 0; i < patches; i += 1) {
    const x = colorRandom() * widthPx;
    const y = colorRandom() * heightPx;
    const radius = (12 + colorRandom() * 44) * Math.sqrt(Math.max(0.2, areaScale));
    ctx.fillStyle = colorRandom() > 0.5
      ? `rgba(210,235,218,${0.004 + colorRandom() * 0.012})`
      : `rgba(0,24,14,${0.006 + colorRandom() * 0.014})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.34 + colorRandom() * 0.22), colorRandom() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 绒纤维：稳定的短笔触沿长边倾倒，亮/暗成对才能在不同视角读出绒毛方向。
  const strokes = Math.max(1200, Math.round(18000 * areaScale));
  for (let i = 0; i < strokes; i++) {
    const x = colorRandom() * widthPx;
    const y = colorRandom() * heightPx;
    const len = 1.4 + colorRandom() * 4.2;
    const angle = Math.PI / 2 + (colorRandom() - 0.5) * 0.58;
    const bright = colorRandom();
    ctx.strokeStyle = bright > 0.5
      ? `rgba(222,244,228,${0.018 + colorRandom() * 0.042})`
      : `rgba(0,27,16,${0.026 + colorRandom() * 0.05})`;
    ctx.lineWidth = 0.65 + colorRandom() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;

  // 法线/粗糙度直接在半分辨率建场：比“全图随机点再抽样”更稳定，并减少约 16MB 启动期临时数组。
  const nw = 512, nh = 1024;
  const height = new Float32Array(nw * nh);
  const rough = new Float32Array(nw * nh);
  const surfaceRandom = makeSeededRandom(CLOTH_SURFACE_SEED);
  for (let y = 0; y < nh; y += 1) {
    const lengthT = y / (nh - 1);
    const centerWear = Math.exp(-(((lengthT - 0.5) / 0.24) ** 2));
    for (let x = 0; x < nw; x += 1) {
      const idx = y * nw + x;
      const longRidge = Math.sin(x * 0.43 + Math.sin(y * 0.026) * 0.72) * 0.055;
      const napWave = Math.sin(y * 0.19 + x * 0.012) * 0.025;
      height[idx] = longRidge + napWave + (surfaceRandom() - 0.5) * 0.07;
      rough[idx] = 228 - centerWear * 7 + (surfaceRandom() - 0.5) * 13;
    }
  }

  // 在高度场中埋入纵向短纤维，使法线实际包含方向性，而不是大面积的中性蓝。
  const surfaceFibres = 15000;
  for (let i = 0; i < surfaceFibres; i += 1) {
    const startX = Math.floor(surfaceRandom() * nw);
    const startY = Math.floor(surfaceRandom() * nh);
    const length = 2 + Math.floor(surfaceRandom() * 6);
    const drift = (surfaceRandom() - 0.5) * 0.7;
    const lift = (surfaceRandom() - 0.42) * 0.28;
    for (let step = 0; step < length; step += 1) {
      const x = Math.round(startX + drift * step);
      const y = startY + step;
      if (x < 0 || x >= nw || y >= nh) break;
      const idx = y * nw + x;
      const fade = 1 - step / length;
      height[idx] += lift * fade;
      rough[idx] += (lift > 0 ? -3.5 : 2.5) * fade;
    }
  }

  const nCanvas = document.createElement('canvas');
  nCanvas.width = nw;
  nCanvas.height = nh;
  const nCtx = nCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(nw, nh);
  const hAt = (x: number, y: number) => {
    const px = Math.min(nw - 1, Math.max(0, x));
    const py = Math.min(nh - 1, Math.max(0, y));
    return height[py * nw + px];
  };
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const dx = hAt(x + 1, y) - hAt(x - 1, y);
      const dy = hAt(x, y + 1) - hAt(x, y - 1);
      const idx = (y * nw + x) * 4;
      nImg.data[idx] = Math.max(88, Math.min(168, 128 - dx * 105));
      nImg.data[idx + 1] = Math.max(94, Math.min(162, 127 - dy * 78));
      nImg.data[idx + 2] = 255;
      nImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.anisotropy = 8;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;

  // 粗糙度：整体是高粗糙呢面，中场长期走球区只有极轻微磨平。
  const rCanvas = document.createElement('canvas');
  rCanvas.width = nw;
  rCanvas.height = nh;
  const rCtx = rCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const idx = (y * nw + x) * 4;
      const value = rough[y * nw + x];
      const v = Math.max(196, Math.min(246, value));
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = v;
      rImg.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.anisotropy = 8;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;

  return { map, normalMap, roughnessMap };
}

/** 深色木纹贴图 */
export function makeWoodTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3a2413';
  ctx.fillRect(0, 0, size, size);

  // 木纹：横向波状条纹
  for (let i = 0; i < 90; i++) {
    const y0 = Math.random() * size;
    const amp = 2 + Math.random() * 6;
    const freq = 0.008 + Math.random() * 0.02;
    const phase = Math.random() * Math.PI * 2;
    const light = Math.random() > 0.45;
    ctx.strokeStyle = light
      ? `rgba(140,90,50,${0.10 + Math.random() * 0.16})`
      : `rgba(20,10,5,${0.12 + Math.random() * 0.18})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
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
    const x = Math.random() * size;
    const y = Math.random() * size;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, 14 + Math.random() * 10);
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

  const random = makeSeededRandom(LEATHER_SEED);
  ctx.fillStyle = '#b6a58e';
  ctx.fillRect(0, 0, size, size);
  const pores = Math.max(800, Math.round(size * size * 0.055));
  for (let i = 0; i < pores; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.35 + random() * 0.75;
    ctx.fillStyle = random() > 0.36
      ? `rgba(255,244,220,${0.025 + random() * 0.055})`
      : `rgba(38,24,14,${0.045 + random() * 0.075})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.45 + random() * 0.45), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 压制皮革保留少量不规则细折，不用高对比“石子纹”喧宾夺主。
  const creases = Math.max(24, Math.round(size * 0.18));
  ctx.lineCap = 'round';
  for (let i = 0; i < creases; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 5 + random() * 16;
    const angle = random() * Math.PI;
    ctx.strokeStyle = `rgba(54,35,22,${0.025 + random() * 0.035})`;
    ctx.lineWidth = 0.45 + random() * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle + 0.55) * length * 0.52,
      y + Math.sin(angle + 0.55) * length * 0.52,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 袋腔顶面的透明暗口：边缘留出皮圈/网袋层次，黑色只沉到袋底。 */
export function makePocketMouthTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center - size * 0.025,
    size * 0.035,
    center,
    center,
    size * 0.49,
  );
  gradient.addColorStop(0, 'rgba(1, 1, 1, 0.99)');
  gradient.addColorStop(0.48, 'rgba(5, 4, 3, 0.97)');
  gradient.addColorStop(0.72, 'rgba(19, 13, 9, 0.78)');
  gradient.addColorStop(0.9, 'rgba(55, 38, 26, 0.34)');
  gradient.addColorStop(1, 'rgba(92, 67, 46, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const BALL_COLORS: Record<number, string> = {
  1: '#f0c419', 2: '#1656b8', 3: '#d42e1e', 4: '#5b2d90', 5: '#ef7d1a', 6: '#0d7a46', 7: '#8e1f2f', 8: '#141414',
  9: '#f0c419', 10: '#1656b8', 11: '#d42e1e', 12: '#5b2d90', 13: '#ef7d1a', 14: '#0d7a46', 15: '#8e1f2f',
};

/** 球体贴图（等距柱状 2:1，双半球号码） */
export function makeBallTexture(number: number, group: string): THREE.CanvasTexture {
  const w = 512, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const color = BALL_COLORS[number];
  ctx.fillStyle = group === 'stripe' ? '#f6f1e2' : color;
  ctx.fillRect(0, 0, w, h);

  if (group === 'stripe') {
    ctx.fillStyle = color;
    ctx.fillRect(0, h * 0.30, w, h * 0.40);
  }

  // 轻微做旧
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(60,50,30,${Math.random() * 0.02})`;
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
  const w = 512, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fbf7ec';
  ctx.fillRect(0, 0, w, h);
  // 白球红点
  for (const [cx, cy] of [[w * 0.25, h * 0.5], [w * 0.75, h * 0.5]]) {
    ctx.fillStyle = 'rgba(200,60,40,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, h * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
