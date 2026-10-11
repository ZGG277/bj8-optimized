import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BilliardsAudio } from './audio';

class Param {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((v: number) => { this.value = v; });
  linearRampToValueAtTime = vi.fn();
}
class Node {
  targets: Node[] = [];
  connect = vi.fn((node: Node) => { this.targets.push(node); return node; });
  disconnect = vi.fn();
}
class Gain extends Node { gain = new Param(); }
class Filter extends Node { type = ''; frequency = new Param(); Q = new Param(); }
class Compressor extends Node {
  threshold = new Param(); knee = new Param(); ratio = new Param();
  attack = new Param(); release = new Param();
}
class Buffer {
  data: Float32Array;
  duration: number;
  constructor(frames: number, rate: number) {
    this.data = new Float32Array(frames);
    this.duration = frames / rate;
  }
  getChannelData() { return this.data; }
}
class Source extends Node {
  buffer: Buffer | null = null;
  onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn();
}
class Context {
  state = 'running'; currentTime = 1; sampleRate = 48000;
  destination = new Node();
  gains: Gain[] = []; filters: Filter[] = []; compressors: Compressor[] = [];
  buffers: Buffer[] = []; sources: Source[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  createGain() { const n = new Gain(); this.gains.push(n); return n; }
  createBiquadFilter() { const n = new Filter(); this.filters.push(n); return n; }
  createDynamicsCompressor() { const n = new Compressor(); this.compressors.push(n); return n; }
  createBuffer(_channels: number, frames: number, rate: number) {
    const n = new Buffer(frames, rate); this.buffers.push(n); return n;
  }
  createBufferSource() { const n = new Source(); this.sources.push(n); return n; }
}
let context: Context;
let time = 1000;
let AudioConstructor: ReturnType<typeof vi.fn>;
function advance(ms = 30) { time += ms; context.currentTime += ms / 1000; }
function sourceGain(source: Source) { return source.targets[0] as Gain; }
function energy(data: Float32Array, from = 0) {
  let sum = 0;
  for (let i = from; i < data.length; i++) sum += data[i] * data[i];
  return sum;
}
// A simple measurement filter verifies low-mid weight without coupling the
// regression to the synthesis's exact modes, phases, or coefficient choices.
function lowpassEnergy(data: Float32Array, cutoff: number, rate: number) {
  const a = 1 - Math.exp(-2 * Math.PI * cutoff / rate);
  let filtered = 0; let sum = 0;
  for (const sample of data) {
    filtered += a * (sample - filtered);
    sum += filtered * filtered;
  }
  return sum;
}
beforeEach(() => {
  context = new Context(); time = 1000;
  AudioConstructor = vi.fn(function () { return context; });
  vi.stubGlobal('AudioContext', AudioConstructor);
  vi.spyOn(performance, 'now').mockImplementation(() => time);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('gem audio contract', () => {
  it('keeps lazy initialization and resumes suspended audio on the same public event path', () => {
    const audio = new BilliardsAudio();
    expect(AudioConstructor).not.toHaveBeenCalled();
    context.state = 'suspended'; audio.pocket();
    expect(AudioConstructor).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.gains[0].gain.value).toBe(.5);
  });
  it('retains click alias and the shared 25ms collision/cushion throttle', () => {
    const audio = new BilliardsAudio(); audio.click(.5);
    advance(24); audio.cushion(.5); audio.ballCollision(.7);
    expect(context.sources).toHaveLength(1);
    advance(1); audio.cushion(.5);
    expect(context.sources).toHaveLength(2);
  });
  it('maps force monotonically to gain and to a longer, brighter buffer', () => {
    const audio = new BilliardsAudio(); audio.ballCollision(.05);
    const soft = context.sources[0]; advance(300); audio.ballCollision(1);
    const hard = context.sources[1];
    expect(sourceGain(hard).gain.value).toBeGreaterThan(sourceGain(soft).gain.value);
    expect(hard.buffer!.duration).toBeGreaterThan(soft.buffer!.duration);
    expect(hard.buffer!.data).not.toEqual(soft.buffer!.data);
  });
  it('keeps all synthesized samples finite, bounded and click-free at the edges', () => {
    const audio = new BilliardsAudio();
    for (const v of [-1, 0, .05, .25, .5, .75, 1, 20, NaN, Infinity]) {
      audio.ballCollision(v); advance(300);
    }
    audio.pocket();
    for (const b of context.buffers) {
      expect(Array.from(b.data).every(Number.isFinite)).toBe(true);
      expect(Math.max(...b.data.map(Math.abs))).toBeLessThanOrEqual(.920001);
      expect(b.data[0]).toBe(0);
      expect(Math.abs(b.data[b.data.length - 1])).toBe(0);
    }
  });
  it('has a bounded nine-level collision cache plus a distinct pocket buffer', () => {
    const audio = new BilliardsAudio();
    for (let i = 0; i <= 100; i++) { audio.ballCollision(i / 100); advance(300); }
    expect(context.buffers).toHaveLength(9);
    audio.pocket(); const pocket = context.sources[context.sources.length - 1].buffer!;
    audio.pocket(); expect(context.sources[context.sources.length - 1].buffer).toBe(pocket);
    expect(context.buffers).toHaveLength(10);
    expect(pocket.duration).toBeCloseTo(.28);
  });
  it('limits dense collisions to six voices and prioritizes pocket feedback with a 6ms fade', () => {
    const audio = new BilliardsAudio();
    for (let i = 0; i < 7; i++) { audio.ballCollision(1); advance(25); }
    expect(context.sources).toHaveLength(6);
    audio.pocket();
    expect(context.sources).toHaveLength(7);
    // The first voice has already expired at 175ms, so no steal is needed here.
    for (let i = 0; i < 7; i++) audio.pocket();
    expect(context.sources.some(s => s.stop.mock.calls.length > 0)).toBe(true);
    expect(context.sources[context.sources.length - 1].start).toHaveBeenCalledWith(context.currentTime + .006);
    expect(sourceGain(context.sources[context.sources.length - 1]).gain.value).toBeLessThan(.2);
  });
  it('disconnects finished source and envelope nodes', () => {
    const audio = new BilliardsAudio(); audio.pocket();
    const s = context.sources[0]; s.onended!();
    expect(s.disconnect).toHaveBeenCalledOnce();
    expect(sourceGain(s).disconnect).toHaveBeenCalledOnce();
    audio.pocket(); expect(sourceGain(context.sources[1]).gain.value).toBe(.47);
  });
  it('uses the dedicated lowpass/compressor only for gem sounds', () => {
    const audio = new BilliardsAudio(); audio.pocket(); audio.strike(100);
    expect(context.compressors).toHaveLength(1);
    expect(context.filters[0].frequency.value).toBe(6200);
    expect(context.compressors[0].ratio.value).toBe(6);
    const noiseGain = context.filters[1].targets[0] as Gain;
    expect(noiseGain.targets[0]).toBe(context.gains[0]);
  });
  it('adds a substantial low-mid body while keeping a clear crystal attack at unchanged gain', () => {
    const audio = new BilliardsAudio();
    for (const intensity of [.05, .5, 1]) {
      audio.ballCollision(intensity);
      const source = context.sources[context.sources.length - 1];
      const data = source.buffer!.data;
      const total = energy(data);
      expect(lowpassEnergy(data, 700, context.sampleRate) / total).toBeGreaterThan(.50);
      // There is still useful upper detail: this is not just a bass thud.
      expect(lowpassEnergy(data, 700, context.sampleRate) / total).toBeLessThan(.88);
      expect(sourceGain(source).gain.value).toBeCloseTo(.18 + intensity ** .75 * .34);
      advance(300);
    }
    audio.pocket();
    expect(sourceGain(context.sources[context.sources.length - 1]).gain.value).toBe(.47);
    expect(context.gains[0].gain.value).toBe(.5);
    expect(context.gains[1].gain.value).toBe(.82);
  });
  it('settles quickly after contact instead of adding a long metallic ring', () => {
    const audio = new BilliardsAudio(); audio.ballCollision(1);
    const collision = context.sources[0].buffer!.data;
    expect(energy(collision, Math.floor(context.sampleRate * .100)) / energy(collision)).toBeLessThan(.007);
    audio.pocket();
    const pocket = context.sources[1].buffer!.data;
    expect(energy(pocket, Math.floor(context.sampleRate * .150)) / energy(pocket)).toBeLessThan(.003);
  });
  it.each([8000, 22050, 44100, 96000])('renders bounded weighted transients at %iHz', rate => {
    context.sampleRate = rate;
    const audio = new BilliardsAudio(); audio.ballCollision(1); audio.pocket();
    for (const buffer of context.buffers) {
      expect(Array.from(buffer.data).every(Number.isFinite)).toBe(true);
      expect(Math.max(...buffer.data.map(Math.abs))).toBeLessThanOrEqual(.920001);
      expect(buffer.data[0]).toBe(0);
      expect(Math.abs(buffer.data[buffer.data.length - 1])).toBe(0);
      expect(energy(buffer.data)).toBeGreaterThan(0);
    }
    expect(context.filters[0].frequency.value).toBeLessThanOrEqual(rate * .42);
  });
  it('preserves all three victory sounds and their existing 145/185ms timing', () => {
    vi.useFakeTimers(); const audio = new BilliardsAudio(); audio.victory();
    expect(context.sources).toHaveLength(1);
    vi.advanceTimersByTime(145); expect(context.sources).toHaveLength(2);
    vi.advanceTimersByTime(40); expect(context.sources).toHaveLength(3);
    expect(context.compressors).toHaveLength(0);
    expect(context.filters.map(n => n.type)).toEqual(['lowpass', 'lowpass', 'highpass']);
  });
  it('fails silently if AudioContext cannot be constructed', () => {
    vi.stubGlobal('AudioContext', vi.fn(function () { throw new Error('unavailable'); }));
    const audio = new BilliardsAudio();
    expect(() => { audio.ballCollision(1); audio.pocket(); audio.strike(20); audio.victory(); }).not.toThrow();
    expect(context.sources).toHaveLength(0);
  });
});
