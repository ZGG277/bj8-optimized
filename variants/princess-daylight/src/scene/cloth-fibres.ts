/** Deterministic, periodic nap in a 160 mm tile. No regular woven grid. */
function noise(x: number, y: number, seed: number) {
  let h = Math.imul(x ^ seed, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 - .5;
}
function periodic(u: number, v: number, nx: number, ny: number, seed: number) {
  const x = u * nx, y = v * ny, ix = Math.floor(x), iy = Math.floor(y);
  const smooth = (a: number) => a * a * (3 - 2 * a);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const at = (a: number, b: number) => noise((a % nx + nx) % nx, (b % ny + ny) % ny, seed);
  const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx;
  const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Fine elongated tufts (about 0.9 × 2.2 mm) with a quiet, non-striped nap. */
export function clothFibreHeight(u: number, v: number) {
  return periodic(u, v, 173, 73, 0x73a21) * .74
    + periodic(u, v, 67, 31, 0x9187) * .22
    + periodic(u, v, 7, 5, 0x6129) * .04;
}

export function clothFibreField(size: number) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    field[y * size + x] = clothFibreHeight(x / size, y / size);
  }
  return field;
}
