export type SoundscapeId = 'rain' | 'rainWindow';

export interface SoundscapePreset {
  id: SoundscapeId;
  name: string;
  subtitle: string;
  frequencyLabel: string;
}

export const SOUNDSCAPE_PRESETS: SoundscapePreset[] = [
  {
    id: 'rain',
    name: 'Rain Sounds',
    subtitle: 'Natural steady rainfall for deep focus & concentration',
    frequencyLabel: 'Natural Rain Audio',
  },
];

class WebAudioSoundscapeController {
  private ctx: AudioContext | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isPlaying = false;
  private currentPreset: SoundscapeId = 'rain';
  private volume = 0.45;
  private muted = false;

  private createRainBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const output = buffer.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        output[i] = pink * 0.045;
      }
    }
    return buffer;
  }

  public start(preset: SoundscapeId = this.currentPreset) {
    if (typeof window === 'undefined') return;
    this.currentPreset = preset;

    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        this.isPlaying = true;
        return;
      }

      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      if (this.noiseSource) {
        try {
          this.noiseSource.stop();
          this.noiseSource.disconnect();
        } catch {}
      }

      const source = this.ctx.createBufferSource();
      source.buffer = this.createRainBuffer(this.ctx);
      source.loop = true;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1350;

      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
      }
      if (!this.analyser) {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.82;
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }

      source.connect(lowpass);
      lowpass.connect(this.masterGain);

      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime
      );

      source.start(0);
      this.noiseSource = source;
    } catch {
      // Fallback gracefully if AudioContext is restricted
    }

    this.isPlaying = true;
  }

  public stop() {
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch {}
      this.noiseSource = null;
    }
    this.isPlaying = false;
  }

  public toggleChannel(
    channelId: SoundscapeId = 'rainWindow',
    initialVolume = this.volume
  ): boolean {
    this.volume = Math.max(0, Math.min(1, initialVolume));
    if (this.isPlaying) {
      this.stop();
      return false;
    }
    this.start(channelId);
    return true;
  }

  public setChannelVolume(_channelId: string, val: number) {
    this.setVolume(val);
  }

  public setMasterMute(mute: boolean) {
    this.setMuted(mute);
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  public playBellChime() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = this.ctx || new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.25);
    } catch {}
  }

  public getFrequencyData(): Uint8Array {
    if (!this.isPlaying || this.muted) {
      return new Uint8Array(24).fill(5);
    }
    if (this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      const slice = data.slice(0, 24);
      if (slice.some((v) => v > 0)) {
        return slice;
      }
    }
    const now = Date.now() / 160;
    const fallback = new Uint8Array(24);
    for (let i = 0; i < 24; i++) {
      fallback[i] = Math.min(
        255,
        Math.max(
          20,
          Math.round(
            (Math.sin(now + i * 0.45) * 0.35 + 0.6) * 185 * this.volume
          )
        )
      );
    }
    return fallback;
  }

  public getFrequencyBars(count = 24): number[] {
    const arr = Array.from(this.getFrequencyData());
    return arr.slice(0, count);
  }

  public getState() {
    return {
      isPlaying: this.isPlaying,
      preset: this.currentPreset,
      volume: this.volume,
      muted: this.muted,
    };
  }
}

export const soundscapeEngine = new WebAudioSoundscapeController();
