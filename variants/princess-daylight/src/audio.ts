/*
[INPUT]: 浏览器Web Audio和物理事件强度
[OUTPUT]: 干净短促的树脂球接触、柔和橡胶库边与皮袋落球模拟，保留环境音/轻音乐及静音暂停边界
[POS]: 表现层音频适配器，不修改碰撞或规则；声效为程序模拟而非真实录音
[PROTOCOL]: 变更时检查CLAUDE.md
*/
import { decodeNatureAmbience } from './nature-ambience';
import { billiardContact, type ContactKind } from './billiard-contact';

export class BilliardsAudio {
  private muted = false;
  private suspended = false;
  private disposed = false;
  private victoryTimers = new Set<ReturnType<typeof setTimeout>>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlay = 0;
  private ambienceEnabled = false;
  private ambienceBuffer: AudioBuffer | null = null;
  private ambienceLoading: Promise<void> | null = null;
  private ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private contactBus: BiquadFilterNode | null = null;
  private contactBuffers = new Map<string, AudioBuffer>();
  private contactVoices: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    end: number;
    kind: ContactKind;
  }[] = [];

  /** All table contacts share bounded headroom; celebration remains separate. */
  private ensureContactBus(): boolean {
    if (!this.ensure() || !this.ctx || !this.master) return false;
    if (!this.contactBus) {
      this.contactBus = this.ctx.createBiquadFilter();
      this.contactBus.type = 'lowpass';
      this.contactBus.frequency.value = Math.min(6800, this.ctx.sampleRate * 0.42);
      this.contactBus.Q.value = 0.5;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.04;
      const headroom = this.ctx.createGain();
      headroom.gain.value = 0.82;
      this.contactBus.connect(compressor);
      compressor.connect(headroom);
      headroom.connect(this.master);
    }
    return true;
  }

  /** Short cached resin/rubber/leather contacts, with no delayed glint or ring. */
  private contactBuffer(kind: ContactKind, intensity: number): AudioBuffer {
    const ctx = this.ctx!, level = Math.round(intensity * 8);
    const key = kind === 'pocket' ? kind : `${kind}-${level}`;
    const cached = this.contactBuffers.get(key);
    if (cached) return cached;
    const samples = billiardContact(kind, level / 8, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.contactBuffers.set(key, buffer);
    return buffer;
  }

  private playContact(kind: ContactKind, intensity: number) {
    if (!this.ensureContactBus() || !this.ctx || !this.contactBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.contactVoices = this.contactVoices.filter(voice => voice.end > now);
    let start = now;
    if (this.contactVoices.length >= 6) {
      if (kind === 'collision' || kind === 'cushion') return;
      // A pocket takes priority. Fade one old voice before its replacement starts.
      const index = Math.max(0, this.contactVoices.findIndex(voice => voice.kind === 'collision'));
      const retired = this.contactVoices.splice(index, 1)[0];
      retired.gain.gain.cancelScheduledValues(now);
      retired.gain.gain.setValueAtTime(retired.gain.gain.value, now);
      retired.gain.gain.linearRampToValueAtTime(0, now + 0.006);
      retired.source.stop(now + 0.006);
      start += 0.006;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.contactBuffer(kind, intensity);
    const gain = ctx.createGain();
    const strength = kind === 'pocket' ? .16 * (.5 + .5 * Math.sqrt(Math.min(1, intensity / .65))) : kind === 'cushion' ? .04 + Math.pow(intensity, .8) * .12 : kind === 'strike' ? .08 + Math.pow(intensity, .7) * .20 : .055 + Math.pow(intensity, .85) * .20;
    gain.gain.value = strength / Math.sqrt(1 + this.contactVoices.length);
    source.connect(gain);
    gain.connect(this.contactBus);
    const voice = { source, gain, end: start + source.buffer.duration, kind };
    this.contactVoices.push(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      const index = this.contactVoices.indexOf(voice);
      if (index >= 0) this.contactVoices.splice(index, 1);
    };
    source.start(start);
  }

  private ensure(): boolean {
    if (this.muted || this.suspended || this.disposed) return false;
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
      void this.ctx.resume().catch(() => {});
    }
    return true;
  }

  /** Called in a user gesture; later collision callbacks must not be the first unlock. */
  unlock() { if (this.ensure()) this.startAmbience(); }
  setAmbience(value: boolean) {
    this.ambienceEnabled = value;
    if (!value) this.stopAmbience();
    else this.startAmbience();
  }
  private startAmbience() {
    if (!this.ambienceEnabled || this.ambience || this.muted || this.suspended || this.disposed || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.ambienceBuffer) {
      if (!this.ambienceLoading) {
        this.ambienceLoading = decodeNatureAmbience(ctx).then(buffer => {
          if (this.disposed || this.ctx !== ctx) return;
          this.ambienceBuffer = buffer;
          // Recheck mute/pause/disposal after asynchronous decoding.
          this.startAmbience();
        }).catch(() => { /* Decoder failure does not block play or other effects. */ })
          .then(() => { this.ambienceLoading = null; });
      }
      return;
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = this.ambienceBuffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(.10, ctx.currentTime + 1.2);
    source.connect(gain); gain.connect(this.master);
    this.ambience = { source, gain };
    source.start();
  }
  private stopAmbience() {
    const voice = this.ambience;
    if (!voice) return;
    this.ambience = null;
    try { voice.source.stop(); } catch { /* Already stopped. */ }
    voice.source.disconnect(); voice.gain.disconnect();
  }
  setMuted(value: boolean) {
    this.muted = value;
    if (this.master) this.master.gain.value = value || this.suspended ? 0 : 0.5;
    if (value) { this.clearVictoryTimers(); this.stopAmbience(); }
    else this.startAmbience();
  }
  setSuspended(value: boolean) {
    this.suspended = value;
    if (this.master) this.master.gain.value = value || this.muted ? 0 : 0.5;
    if (value) {
      this.stopAmbience();
      this.clearVictoryTimers();
      if (this.ctx && this.ctx.state !== 'closed') void this.ctx.suspend().catch(() => {});
    } else if (this.ctx && !this.muted) {
      void this.ctx.resume().catch(() => {});
      this.startAmbience();
    }
  }
  private clearVictoryTimers() {
    for (const timer of this.victoryTimers) clearTimeout(timer);
    this.victoryTimers.clear();
  }
  dispose() {
    this.disposed = true;
    this.stopAmbience(); this.ambienceBuffer = null;
    this.clearVictoryTimers();
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
    this.ctx = null; this.master = null; this.contactBus = null;
    this.contactBuffers.clear(); this.contactVoices = [];
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
    src.onended = () => { src.disconnect(); filter.disconnect(); g.disconnect(); };
    src.start();
  }

  /** 短促树脂球接触，力度改变响度和干脆程度。 */
  ballCollision(intensity: number) {
    // 节流：同一帧多个碰撞只播一次
    const now = performance.now();
    if (now - this.lastPlay < 25) return;
    this.lastPlay = now;
    const v = Number.isFinite(intensity) ? Math.min(1, Math.max(0.05, intensity)) : 0.05;
    this.playContact('collision', v);
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
    const v = Number.isFinite(intensity) ? Math.min(1, Math.max(0.05, intensity)) : .05;
    this.playContact('cushion', v);
  }

  /** 皮袋落球的柔和双触点；没有提示音或闪光尾音。 */
  pocket(intensity = .65) {
    this.playContact('pocket', Number.isFinite(intensity) ? Math.max(.05, Math.min(1, intensity)) : .65);
  }

  /** 出杆击打 */
  strike(power: number) {
    const v = Number.isFinite(power) ? Math.min(1, Math.max(0.1, power / 100)) : .1;
    this.playContact('strike', v);
  }

  /** 胜局彩炮：两声轻爆点加一层短促闪光，不铺满声场。 */
  victory() {
    if (!this.ensure()) return;
    this.clearVictoryTimers();
    this.noiseBurst(0.1, 180, 0.34, 'lowpass');
    for (const [delay, duration, frequency, gain, type] of [
      [145, .08, 230, .27, 'lowpass'], [185, .14, 4200, .1, 'highpass'],
    ] as const) {
      const timer = setTimeout(() => { this.victoryTimers.delete(timer); this.noiseBurst(duration, frequency, gain, type); }, delay);
      this.victoryTimers.add(timer);
    }
  }
}
