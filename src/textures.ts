/*
[INPUT]: 依赖浏览器 Canvas API 与 Three.js CanvasTexture
[OUTPUT]: 对外提供确定性多尺度台呢、木纹、皮革、球体与母球的程序化贴图工厂
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

function configureClothTexture(texture: THREE.CanvasTexture, colorSpace: THREE.ColorSpace) {
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
}

/** 带方向性的台呢绒布贴图（均匀底色 + 细密经纬/倒毛 + 连续微法线）。 */
export function makeClothMaps(widthPx = 1024, heightPx = 2048): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d')!;
  const colorImage = ctx.createImageData(widthPx, heightPx);

  // 比赛绿保持近似均匀；只有 1~3 色阶的细纤维差异，不再制造可见的大块斑驳。
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const weave = Math.sin(y * 1.07 + x * 0.075) * 0.62
        + Math.sin(x * 1.73 - y * 0.035) * 0.28;
      const nap = Math.sin(y * 0.041 + Math.sin(x * 0.009) * 0.55) * 0.24;
      const grain = (clothNoise(x, y, 0x73a21) - 0.5) * 1.4;
      const tone = weave + nap + grain;
      const idx = (y * widthPx + x) * 4;
      colorImage.data[idx] = clampByte(10 + tone * 0.55);
      colorImage.data[idx + 1] = clampByte(91 + tone * 1.05);
      colorImage.data[idx + 2] = clampByte(60 + tone * 0.7);
      colorImage.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(colorImage, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  configureClothTexture(map, THREE.SRGBColorSpace);

  // 连续的细密经纬法线；不再用单像素尖峰，近景不会出现砂砾状噪点。
  const nw = 512, nh = 1024;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = nw;
  nCanvas.height = nh;
  const nCtx = nCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const primaryPhase = y * 1.11 + x * 0.17;
      const secondaryPhase = y * 2.41 - x * 0.08;
      const crossPhase = x * 1.79 + y * 0.04;
      const dx = Math.cos(primaryPhase) * 0.0408
        - Math.cos(secondaryPhase) * 0.008
        + Math.cos(crossPhase) * 0.1432;
      const dy = Math.cos(primaryPhase) * 0.2664
        + Math.cos(secondaryPhase) * 0.241
        + Math.cos(crossPhase) * 0.0032;
      const idx = (y * nw + x) * 4;
      nImg.data[idx] = clampByte(128 - dx * 18);
      nImg.data[idx + 1] = clampByte(128 - dy * 18);
      nImg.data[idx + 2] = 255;
      nImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nCanvas);
  configureClothTexture(normalMap, THREE.NoColorSpace);

  // 绒面整体高粗糙，仅保留轻微而连续的倒毛变化。
  const rCanvas = document.createElement('canvas');
  rCanvas.width = nw;
  rCanvas.height = nh;
  const rCtx = rCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const idx = (y * nw + x) * 4;
      const nap = Math.sin(y * 0.043 + Math.sin(x * 0.011) * 0.6) * 2.2;
      const weave = Math.sin(y * 1.11 + x * 0.17) * 1.1;
      const grain = (clothNoise(x, y, 0x19c87) - 0.5) * 1.4;
      const value = clampByte(238 + nap + weave + grain);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = value;
      rImg.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  configureClothTexture(roughnessMap, THREE.NoColorSpace);

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

  ctx.fillStyle = '#241407';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5
      ? `rgba(120,80,40,${0.04 + Math.random() * 0.08})`
      : `rgba(0,0,0,${0.05 + Math.random() * 0.09})`;
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
