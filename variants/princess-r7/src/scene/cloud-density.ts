/*
[INPUT]: 固定种子和周期性三维格点
[OUTPUT]: 云体专用的 64³ 密度噪声，开局生成一次、无网络和动画时钟
[POS]: World Shell 纯数据建模；不接触游戏或渲染状态
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

function lattice(x: number, y: number, z: number, period: number): number {
  const wrap = (v: number) => ((v % period) + period) % period;
  let h = Math.imul(wrap(x), 374761393) ^ Math.imul(wrap(y), 668265263)
    ^ Math.imul(wrap(z), 2147483647) ^ 82197;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function cloudNoise(x: number, y: number, z: number, period = 8): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const sx = smooth(x - ix), sy = smooth(y - iy), sz = smooth(z - iz);
  const plane = (dz: number) => mix(
    mix(lattice(ix, iy, iz + dz, period), lattice(ix + 1, iy, iz + dz, period), sx),
    mix(lattice(ix, iy + 1, iz + dz, period), lattice(ix + 1, iy + 1, iz + dz, period), sx), sy);
  return mix(plane(0), plane(1), sz);
}

export function createCloudNoiseData(size = 64): Uint8Array {
  const data = new Uint8Array(size ** 3);
  const cells = 8;
  const features = Array.from({ length: cells ** 3 }, (_, i) => {
    const x = i % cells, y = Math.floor(i / cells) % cells, z = Math.floor(i / cells ** 2);
    return [lattice(x, y, z, cells), lattice(y + 13, z, x, cells), lattice(z + 7, x, y + 3, cells)];
  });
  let index = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size * 8, py = y / size * 8, pz = z / size * 8;
    const fractal = .62 * cloudNoise(px, py, pz)
      + .26 * cloudNoise(px * 2, py * 2, pz * 2, 16)
      + .12 * cloudNoise(px * 4, py * 4, pz * 4, 32);
    // Rounded cellular bodies with fractal erosion create billows, not cone-like peaks.
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    let distanceSquared = 3;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz;
      const feature = features[((cz + cells) % cells * cells + (cy + cells) % cells) * cells + (cx + cells) % cells];
      const vx = cx + feature[0] - px, vy = cy + feature[1] - py, vz = cz + feature[2] - pz;
      distanceSquared = Math.min(distanceSquared, vx * vx + vy * vy + vz * vz);
    }
    const cell = Math.max(0, 1 - Math.sqrt(distanceSquared) * .9);
    const n = .52 * fractal + .48 * cell;
    data[index++] = Math.round(n * 255);
  }
  return data;
}
