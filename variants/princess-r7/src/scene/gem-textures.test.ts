import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEM_BODY_COLORS, makeBallTexture } from '../textures';
import { crystalShellMaterial } from './crystal-style';

type Paint =
  | { kind: 'rect'; color: string; x: number; y: number; width: number; height: number }
  | { kind: 'circle'; color: string; x: number; y: number; radius: number }
  | { kind: 'text'; color: string; text: string; x: number; y: number };

/** Record the real texture factory's paint instructions without substituting its decisions.
 * This verifies procedural coverage; browser font rasterization and GPU shading need visual QA.
 */
function recordCanvases() {
  const canvases: { width: number; height: number; paints: Paint[] }[] = [];
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { width: 0, height: 0, paints: [] as Paint[] };
    const context = {
      fillStyle: '', font: '', textAlign: '', textBaseline: '',
      fillRect(x: number, y: number, width: number, height: number) {
        canvas.paints.push({ kind: 'rect', color: this.fillStyle, x, y, width, height });
      },
      fillText(text: string, x: number, y: number) {
        canvas.paints.push({ kind: 'text', color: this.fillStyle, text, x, y });
      },
      beginPath() {}, fill() {},
      arc(x: number, y: number, radius: number) {
        canvas.paints.push({ kind: 'circle', color: this.fillStyle, x, y, radius });
      },
    };
    canvases.push(canvas);
    return Object.assign(canvas, { getContext: () => context });
  } });
  return canvases;
}
const materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
afterEach(() => {
  for (const material of materials.splice(0)) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
    material.dispose();
  }
  textures.splice(0).forEach(texture => texture.dispose());
  vi.unstubAllGlobals();
});

describe('R4 whole-gem texture coverage', () => {
  it('paints every topaz body uniformly, with only localized dark numerals and numeral-shaped transmission inlays', () => {
    for (let number = 9; number <= 15; number++) {
      const canvases = recordCanvases(), material = crystalShellMaterial(number); materials.push(material);
      const [body, mask] = canvases;
      expect(body.paints.filter(paint => paint.kind !== 'text')).toEqual([
        { kind: 'rect', color: GEM_BODY_COLORS.topaz, x: 0, y: 0, width: 512, height: 256 },
      ]);
      const numbers = body.paints.filter(paint => paint.kind === 'text');
      expect(numbers).toHaveLength(4);
      for (const paint of numbers) {
        expect(paint.text).toBe(String(number));
        expect(['#755015', '#593710']).toContain(paint.color);
        expect([128, 129, 384, 385]).toContain(paint.x); expect([128, 130]).toContain(paint.y);
      }
      expect(mask.paints).toEqual([
        { kind: 'rect', color: '#ffffff', x: 0, y: 0, width: 256, height: 128 },
        { kind: 'text', color: '#000000', text: String(number), x: 64, y: 64 },
        { kind: 'text', color: '#000000', text: String(number), x: 192, y: 64 },
      ]);
      expect(material.roughnessMap).toBeNull();
    }
  });

  it('keeps legacy rule group names from reintroducing a stripe in the texture fallback', () => {
    for (let number = 1; number <= 15; number++) {
      const canvases = recordCanvases();
      const texture = makeBallTexture(number, number >= 9 ? 'stripe' : number === 8 ? 'eight' : 'solid'); textures.push(texture);
      const body = canvases[0], color = number === 8 ? '#141414' : number >= 9 ? GEM_BODY_COLORS.topaz : GEM_BODY_COLORS.ruby;
      expect(body.paints[0]).toEqual({ kind: 'rect', color, x: 0, y: 0, width: body.width, height: body.height });
      const rectangles = body.paints.filter(paint => paint.kind === 'rect');
      expect(rectangles.filter(paint => paint.width > 2 || paint.height > 2)).toEqual([body.paints[0]]);
      const labels = body.paints.filter(paint => paint.kind === 'circle');
      expect(labels).toHaveLength(2);
      for (const label of labels) expect(label.radius / body.height).toBe(.14);
      expect(body.paints.filter(paint => paint.kind === 'text').map(paint => paint.text)).toEqual([String(number), String(number)]);
    }
  });

  it('preserves ruby and black-eight base colors and the existing number inlays', () => {
    for (const number of [1, 7, 8]) {
      const canvases = recordCanvases(), material = crystalShellMaterial(number); materials.push(material);
      expect(canvases[0].paints[0]).toEqual({ kind: 'rect', color: number === 8 ? '#151b29' : '#bf2947', x: 0, y: 0, width: 512, height: 256 });
      expect(canvases[0].paints.filter(paint => paint.kind === 'text').map(paint => paint.text)).toEqual(Array(4).fill(String(number)));
      if (number === 8) expect(material.transmissionMap).toBeNull();
    }
  });
});
