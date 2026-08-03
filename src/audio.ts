/*
[INPUT]: 依赖浏览器 Web Audio API 与物理事件传入的速度/类型
[OUTPUT]: 对外提供 BilliardsAudio，合成出杆、球碰、碰库、落袋与克制胜局彩炮音效
[POS]: 表现层音频适配器；无外部音频资源，不参与物理和规则判定
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

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
  ballCollision(intensity: number) {
    // 节流：同一帧多个碰撞只播一次
    const now = performance.now();
    if (now - this.lastPlay < 25) return;
    this.lastPlay = now;
    const v = Math.min(1, Math.max(0.05, intensity));
    this.noiseBurst(0.03 + v * 0.05, 2200 + v * 1800, 0.12 + v * 0.5);
  }

  /** 兼容旧的首碰调用名。 */
  click(intensity: number) {
    this.ballCollision(intensity);
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

  /** 胜局彩炮：两声轻爆点加一层短促闪光，不铺满声场。 */
  victory() {
    if (!this.ensure()) return;
    this.noiseBurst(0.1, 180, 0.34, 'lowpass');
    setTimeout(() => this.noiseBurst(0.08, 230, 0.27, 'lowpass'), 145);
    setTimeout(() => this.noiseBurst(0.14, 4200, 0.1, 'highpass'), 185);
  }
}
