export class ViceAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private lastImpact = 0;

  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.setupEngineNodes();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private setupEngineNodes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';
    this.engineOsc1.frequency.value = 52;
    this.engineOsc2.frequency.value = 104;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(ctx.destination);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // Tire screech noise loop
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1150;
    bp.Q.value = 5.5;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0.0;
    noise.connect(bp).connect(this.screechGain).connect(ctx.destination);
    noise.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.engineGain && this.screechGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  updateVehicle(speedMs: number, throttle: number, boost: boolean, drifting: boolean, inCar: boolean): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running' || !this.engineGain || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.screechGain) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!inCar) {
      this.engineGain.gain.setTargetAtTime(0.0, now, 0.08);
      this.screechGain.gain.setTargetAtTime(0.0, now, 0.05);
      return;
    }

    const rpmNorm = Math.min(1.0, (speedMs % 14) / 14 * 0.65 + Math.min(1, speedMs / 48) * 0.35);
    const baseHz = 48 + rpmNorm * 135 + (boost ? 48 : 0) + Math.abs(throttle) * 18;
    this.engineOsc1.frequency.setTargetAtTime(baseHz, now, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(baseHz * 2.01, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(220 + rpmNorm * 820 + (boost ? 600 : 0), now, 0.05);

    const vol = 0.045 + Math.abs(throttle) * 0.045 + (boost ? 0.04 : 0);
    this.engineGain.gain.setTargetAtTime(vol, now, 0.06);

    const screechVol = drifting && speedMs > 6 ? Math.min(0.09, (speedMs - 5) * 0.004) : 0;
    this.screechGain.gain.setTargetAtTime(screechVol, now, 0.04);
  }

  playImpact(strength = 1.0): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpact < 0.06) return;
    this.lastImpact = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    gain.gain.setValueAtTime(Math.min(0.28, strength * 0.14), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playSplash(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const dur = 0.45;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(640, now);
    flt.frequency.exponentialRampToValueAtTime(220, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(flt).connect(gain).connect(this.ctx.destination);
    src.start(now);
  }
}
