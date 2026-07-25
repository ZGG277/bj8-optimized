/*
 * 程序化贴图：绒布（带倒顺毛）、木纹、法线噪声
 * 全部在 Canvas 上生成，无外部资源依赖
 */
import * as THREE from 'three';

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

  const height = new Float32Array(widthPx * heightPx);
  const rough = new Float32Array(widthPx * heightPx);

  // 底色：比赛绿，沿长边有轻微倒顺毛渐变（一头亮一头暗）
  const base = ctx.createLinearGradient(0, 0, 0, heightPx);
  base.addColorStop(0, '#095236');
  base.addColorStop(0.5, '#0c6442');
  base.addColorStop(1, '#084e33');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // 绒纤维：大量短笔触，方向偏向纵向（倒毛方向）
  const strokes = 26000;
  for (let i = 0; i < strokes; i++) {
    const x = Math.random() * widthPx;
    const y = Math.random() * heightPx;
    const len = 1 + Math.random() * 3.2;
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.1; // 偏向纵向
    const bright = Math.random();
    ctx.strokeStyle = bright > 0.5
      ? `rgba(255,255,240,${0.02 + Math.random() * 0.05})`
      : `rgba(0,30,18,${0.03 + Math.random() * 0.06})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();

    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px >= 0 && px < widthPx && py >= 0 && py < heightPx) {
      const idx = py * widthPx + px;
      height[idx] += (bright - 0.5) * 0.4;
      rough[idx] += (Math.random() - 0.5) * 0.2;
    }
  }

  // 大块织物纹理（低频）
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * widthPx;
    const y = Math.random() * heightPx;
    const r = 8 + Math.random() * 30;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,235' : '0,25,15'},${0.008 + Math.random() * 0.014})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // 由高度场生成法线贴图（降采样到 512x1024 保证生成速度）
  const nw = 512, nh = 1024;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = nw;
  nCanvas.height = nh;
  const nCtx = nCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(nw, nh);
  const sx = widthPx / nw;
  const sy = heightPx / nh;

  const hAt = (ix: number, iy: number) => {
    const fx = Math.min(widthPx - 1, Math.max(0, Math.floor(ix * sx)));
    const fy = Math.min(heightPx - 1, Math.max(0, Math.floor(iy * sy)));
    return height[fy * widthPx + fx];
  };
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const dx = hAt(x + 1, y) - hAt(x - 1, y);
      const dy = hAt(x, y + 1) - hAt(x, y - 1);
      const idx = (y * nw + x) * 4;
      nImg.data[idx] = 128 - dx * 220;
      nImg.data[idx + 1] = 128 - dy * 220;
      nImg.data[idx + 2] = 255;
      nImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nCanvas);

  // 粗糙度贴图：绒面整体高粗糙，局部抖动
  const rCanvas = document.createElement('canvas');
  rCanvas.width = nw;
  rCanvas.height = nh;
  const rCtx = rCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const idx = (y * nw + x) * 4;
      const v = 235 + rough[Math.min(heightPx - 1, Math.floor(y * sy)) * widthPx + Math.min(widthPx - 1, Math.floor(x * sx))] * 60;
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = Math.max(180, Math.min(255, v));
      rImg.data[idx + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);

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
