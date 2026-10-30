/** Dry resin contact, rubber cushion and leather pocket approximations; no ringing layer. */
export type ContactKind = 'collision' | 'cushion' | 'pocket' | 'strike';

export function billiardContact(kind: ContactKind, intensity: number, rate: number): Float32Array {
  const v = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : .05;
  const duration = kind === 'collision' ? .038 + v * .014 : kind === 'cushion' ? .068 + v * .016 : kind === 'pocket' ? .13 : .032 + v * .012;
  const data = new Float32Array(Math.ceil(rate * duration));
  let seed = 7919 + Math.round(v * 8) * 1543 + ['collision', 'cushion', 'pocket', 'strike'].indexOf(kind) * 65537;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
  const cutoff = kind === 'collision' ? 3900 + v * 1500 : kind === 'cushion' ? 1150 : kind === 'pocket' ? 850 : 3200;
  const a = 1 - Math.exp(-2 * Math.PI * Math.min(cutoff, rate * .36) / rate);
  const ah = 1 - Math.exp(-2 * Math.PI * (kind === 'collision' ? 520 : 100) / rate);
  let low = 0, bass = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, white = noise();
    low += a * (white - low); bass += ah * (white - bass);
    const contact = low - bass;
    let sample: number;
    if (kind === 'collision') {
      // A millisecond attack and a rapidly damped body replace pitched gem modes.
      sample = contact * Math.exp(-t / (.0028 + v * .0015))
        + .16 * Math.sin(2 * Math.PI * (1250 + v * 400) * t) * Math.exp(-t / .0025);
    } else if (kind === 'cushion') {
      sample = low * Math.exp(-t / (.008 + v * .003))
        + .10 * Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t / .006);
    } else if (kind === 'pocket') {
      const bag = Math.max(0, t - .029);
      sample = low * Math.exp(-t / .012)
        + (t > .029 ? .42 * low * (1 - Math.exp(-bag / .001)) * Math.exp(-bag / .016) : 0);
    } else {
      sample = contact * Math.exp(-t / .0032)
        + .13 * Math.sin(2 * Math.PI * 620 * t) * Math.exp(-t / .002);
    }
    const attack = 1 - Math.exp(-t / .00022);
    const tail = Math.min(1, (data.length - 1 - i) / (rate * .006));
    data[i] = sample * attack * tail;
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak) for (let i = 0; i < data.length; i++) data[i] *= .86 / peak;
  data[0] = 0; data[data.length - 1] = 0;
  return data;
}
