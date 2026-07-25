/*
 * WebAudio 合成音效：无外部资源
 * - 球球/球库碰撞：短促噪声脉冲 + 高频咔哒
 * - 落袋：低频闷响
 * - 出杆：皮革击打声
 */
export class BilliardsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlay = 0;

  private ensure(): boolean {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return false;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return true;
  }

  private noiseBurst(duration: number, filterFreq: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const frames = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** 碰撞咔哒声，intensity 0-1 */
  click(intensity: number) {
    // 节流：同一帧多个碰撞只播一次
    const now = performance.now();
    if (now - this.lastPlay < 25) return;
    this.lastPlay = now;
    const v = Math.min(1, Math.max(0.05, intensity));
    this.noiseBurst(0.03 + v * 0.05, 2200 + v * 1800, 0.12 + v * 0.5);
  }

  /** 库边闷响 */
  cushion(intensity: number) {
    const now = performance.now();
    if (now - this.lastPlay < 25) return;
    this.lastPlay = now;
    const v = Math.min(1, Math.max(0.05, intensity));
    this.noiseBurst(0.05 + v * 0.06, 500 + v * 500, 0.10 + v * 0.35, 'lowpass');
  }

  /** 落袋 */
  pocket() {
    this.noiseBurst(0.16, 240, 0.6, 'lowpass');
    setTimeout(() => this.noiseBurst(0.08, 900, 0.25), 90);
  }

  /** 出杆击打 */
  strike(power: number) {
    const v = Math.min(1, Math.max(0.1, power / 100));
    this.noiseBurst(0.04 + v * 0.04, 1600 + v * 1200, 0.2 + v * 0.45);
  }
}
