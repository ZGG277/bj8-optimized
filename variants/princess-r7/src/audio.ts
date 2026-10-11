/*
[INPUT]: 依赖浏览器 Web Audio API 与物理事件传入的速度/类型
[OUTPUT]: 对外提供 BilliardsAudio，合成带低中频重量的短促宝石球碰/落袋、出杆、碰库与克制胜局彩炮音效
[POS]: 表现层音频适配器；无外部音频资源，不参与物理和规则判定
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

 * WebAudio 合成音效：无外部资源
 * - 球球碰撞：190–255Hz 实心碰击 + 短促非谐波晶体棱面；球库保持闷响
 * - 落袋：156Hz 下坠落定 + 一次克制闪光，独立于胜局音效
 * - 宝石专用总线：6.2kHz 低通、软压缩、六声并发、有限波形缓存
 * - 出杆：皮革击打声
 */
export class BilliardsAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlay = 0;
  private gemBus: BiquadFilterNode | null = null;
  private gemBuffers = new Map<string, AudioBuffer>();
  private gemVoices: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    end: number;
    kind: 'collision' | 'pocket';
  }[] = [];

  /** Kept separate so cushion, strike and victory retain their original signal path. */
  private ensureGemBus(): boolean {
    if (!this.ensure() || !this.ctx || !this.master) return false;
    if (!this.gemBus) {
      this.gemBus = this.ctx.createBiquadFilter();
      this.gemBus.type = 'lowpass';
      this.gemBus.frequency.value = Math.min(6200, this.ctx.sampleRate * 0.42);
      this.gemBus.Q.value = 0.5;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.075;
      const headroom = this.ctx.createGain();
      headroom.gain.value = 0.82;
      this.gemBus.connect(compressor);
      compressor.connect(headroom);
      headroom.connect(this.master);
    }
    return true;
  }

  /** Nine collision timbres plus one pocket timbre; no file, fetch or timer. */
  private gemBuffer(kind: 'collision' | 'pocket', intensity: number): AudioBuffer {
    const ctx = this.ctx!;
    const level = Math.round(intensity * 8);
    const key = kind === 'pocket' ? kind : `collision-${level}`;
    const cached = this.gemBuffers.get(key);
    if (cached) return cached;
    const v = level / 8;
    const duration = kind === 'pocket' ? 0.28 : 0.125 + v * 0.045;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const pocket = kind === 'pocket';
    // A compact low-mid body makes the gem feel solid, with enough upper body
    // to remain audible on phone speakers. Inharmonic modes avoid a drum note.
    const bodyHz = pocket ? 156 : 190 + Math.sqrt(v) * 65;
    const bodyRatios = pocket ? [1, 1.77, 2.71] : [1, 1.83, 2.79];
    const bodyWeights = [0.80, 0.34, 0.10];
    const bodyDecay = pocket ? 0.041 : 0.018 + v * 0.012;
    const crystalHz = pocket ? 830.6 : 1140 + Math.sqrt(v) * 260;
    const crystalRatios = pocket ? [1, 1.5, 2.393, 3.49] : [1, 1.47, 2.13, 3.05];
    const crystalWeights = [0.62, 0.27, 0.092, 0.026];
    // The bright edge ends sooner than the body: crisp contact without a ring.
    const crystalDecay = pocket ? 0.032 : 0.016 + v * 0.010;
    const usefulHz = Math.min(5500, ctx.sampleRate * 0.42);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      const attack = 1 - Math.exp(-t / 0.0007);
      let sample = 0;
      for (let mode = 0; mode < bodyRatios.length; mode++) {
        const hz = bodyHz * bodyRatios[mode];
        if (hz >= usefulHz) continue;
        sample += bodyWeights[mode] * Math.sin(2 * Math.PI * hz * t)
          * Math.exp(-t / (bodyDecay / (1 + mode * 0.48)));
      }
      for (let mode = 0; mode < crystalRatios.length; mode++) {
        const hz = crystalHz * crystalRatios[mode];
        if (hz >= usefulHz) continue;
        sample += crystalWeights[mode] * Math.sin(2 * Math.PI * hz * t)
          * Math.exp(-t / (crystalDecay / (1 + mode * 0.62)));
      }
      sample *= attack;
      if (pocket) {
        const glintTime = t - 0.047;
        if (glintTime > 0 && 1245.9 < usefulHz) {
          sample += 0.14 * Math.sin(2 * Math.PI * 1245.9 * glintTime)
            * (1 - Math.exp(-glintTime / 0.0012)) * Math.exp(-glintTime / 0.022);
        }
      }
      const tail = Math.max(0, Math.min(1, (data.length - 1 - i) / (ctx.sampleRate * 0.008)));
      data[i] = sample * tail;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak > 0) for (let i = 0; i < data.length; i++) data[i] *= 0.92 / peak;
    this.gemBuffers.set(key, buffer);
    return buffer;
  }

  private playGem(kind: 'collision' | 'pocket', intensity: number) {
    if (!this.ensureGemBus() || !this.ctx || !this.gemBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.gemVoices = this.gemVoices.filter(voice => voice.end > now);
    let start = now;
    if (this.gemVoices.length >= 6) {
      if (kind === 'collision') return;
      // A pocket takes priority. Fade one old voice before its replacement starts.
      const index = Math.max(0, this.gemVoices.findIndex(voice => voice.kind === 'collision'));
      const retired = this.gemVoices.splice(index, 1)[0];
      retired.gain.gain.cancelScheduledValues(now);
      retired.gain.gain.setValueAtTime(retired.gain.gain.value, now);
      retired.gain.gain.linearRampToValueAtTime(0, now + 0.006);
      retired.source.stop(now + 0.006);
      start += 0.006;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.gemBuffer(kind, intensity);
    const gain = ctx.createGain();
    const strength = kind === 'pocket' ? 0.47 : 0.18 + Math.pow(intensity, 0.75) * 0.34;
    gain.gain.value = strength / Math.sqrt(1 + this.gemVoices.length);
    source.connect(gain);
    gain.connect(this.gemBus);
    const voice = { source, gain, end: start + source.buffer.duration, kind };
    this.gemVoices.push(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      const index = this.gemVoices.indexOf(voice);
      if (index >= 0) this.gemVoices.splice(index, 1);
    };
    source.start(start);
  }

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

  /** 厚实而清脆的宝石碰撞，intensity 0-1；力度改变响度、音高与短衰减。 */
  ballCollision(intensity: number) {
    // 节流：同一帧多个碰撞只播一次
    const now = performance.now();
    if (now - this.lastPlay < 25) return;
    this.lastPlay = now;
    const v = Number.isFinite(intensity) ? Math.min(1, Math.max(0.05, intensity)) : 0.05;
    this.playGem('collision', v);
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

  /** 落袋：更低的落定碰击和单次轻亮尾音，保留与球碰不同的听觉反馈。 */
  pocket() {
    this.playGem('pocket', 0.65);
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
