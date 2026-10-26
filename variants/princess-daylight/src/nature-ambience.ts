/** A quiet, deterministic stream with sparse birds; generated once, no network or scheduling timer. */
export function createNatureAmbience(ctx: AudioContext): AudioBuffer {
  const rate = 24000, seconds = 32;
  const buffer = ctx.createBuffer(1, rate * seconds, rate);
  const data = buffer.getChannelData(0);
  let seed = 32719, low = 0, slow = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, noise = random() * 2 - 1;
    low += .22 * (noise - low);
    slow += .015 * (noise - slow);
    // Soft moving water, with tiny irregular droplets rather than broad white hiss.
    const flow = .8 + .12 * Math.sin(2 * Math.PI * t / 8) + .08 * Math.sin(2 * Math.PI * t / 3.2);
    data[i] = (low * .46 + slow * 1.1) * flow;
  }
  // Match the water at the loop seam; the silent margin contains no bird calls.
  const join = Math.round(rate * .2);
  for (let i = 0; i < join; i++) {
    const mix = i / (join - 1);
    data[data.length - join + i] = data[data.length - join + i] * (1 - mix) + data[i] * mix;
  }
  const edge = (data[0] + data[data.length - 1]) * .5;
  data[0] = data[data.length - 1] = edge;
  for (const [start, count, base] of [[2.2, 3, 2350], [10.7, 2, 2900], [19.4, 4, 2150], [27.8, 2, 2650]]) {
    for (let note = 0; note < count; note++) {
      const offset = Math.round((start + note * (.23 + random() * .06)) * rate);
      const duration = .12 + random() * .07, frames = Math.round(duration * rate);
      let phase = 0;
      for (let i = 0; i < frames; i++) {
        const t = i / rate, u = i / frames;
        const hz = base + 620 * Math.sin(Math.PI * u) - 380 * u + 95 * Math.sin(t * 150);
        phase += 2 * Math.PI * hz / rate;
        const envelope = Math.sin(Math.PI * u) ** 2;
        data[offset + i] += .46 * envelope * (Math.sin(phase) + .12 * Math.sin(phase * 2));
      }
    }
  }
  return buffer;
}
