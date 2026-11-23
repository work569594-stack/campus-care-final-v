export type SoundEffect =
  | 'click'
  | 'hover'
  | 'toggle'
  | 'stepNext'
  | 'stepBack'
  | 'error'
  | 'success'
  | 'notify'
  | 'roomSelect';

const STORAGE_KEY = 'campuscare_sound_enabled';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private lastHoverAt = 0;

  constructor() {
    this.muted = this.loadInitialMuteState();
  }

  private loadInitialMuteState(): boolean {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      return saved === 'false';
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return Boolean(reduced);
  }

  isEnabled(): boolean {
    return !this.muted;
  }

  setEnabled(enabled: boolean): void {
    this.muted = !enabled;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
    }
    if (enabled) {
      this.unlock();
      this.play('toggle');
    }
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createFilteredGain(volume: number, cutoffHz = 1800) {
    if (!this.ctx) return null;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;

    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(volume, 0.14);

    filter.connect(gain);
    gain.connect(this.ctx.destination);
    return { filter, gain };
  }

  play(effect: SoundEffect): void {
    if (this.muted || typeof window === 'undefined') return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    if (effect === 'hover') {
      if (performance.now() - this.lastHoverAt < 90) return;
      this.lastHoverAt = performance.now();
      const nodes = this.createFilteredGain(0.018, 1200);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.035);
      nodes.gain.gain.setValueAtTime(0.016, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.045);
      return;
    }

    if (effect === 'click') {
      const nodes = this.createFilteredGain(0.055, 1600);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.055);
      nodes.gain.gain.setValueAtTime(0.055, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.065);
      return;
    }

    if (effect === 'toggle') {
      const nodes = this.createFilteredGain(0.05, 1800);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.075);
      nodes.gain.gain.setValueAtTime(0.05, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.09);
      return;
    }

    if (effect === 'roomSelect') {
      const nodes = this.createFilteredGain(0.06, 2000);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.09);
      nodes.gain.gain.setValueAtTime(0.055, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.12);
      return;
    }

    if (effect === 'stepNext' || effect === 'stepBack') {
      const nodes = this.createFilteredGain(0.045, 1400);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const startFreq = effect === 'stepNext' ? 320 : 520;
      const endFreq = effect === 'stepNext' ? 580 : 300;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.11);
      nodes.gain.gain.setValueAtTime(0.045, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.13);
      return;
    }

    if (effect === 'error') {
      const nodes = this.createFilteredGain(0.06, 900);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.linearRampToValueAtTime(145, now + 0.13);
      nodes.gain.gain.setValueAtTime(0.055, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.15);
      return;
    }

    if (effect === 'notify') {
      const nodes = this.createFilteredGain(0.05, 2100);
      if (!nodes) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.06);
      nodes.gain.gain.setValueAtTime(0.045, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(nodes.filter);
      osc.start(now);
      osc.stop(now + 0.15);
      return;
    }

    if (effect === 'success') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const nodes = this.createFilteredGain(0.055, 2400);
        if (!nodes) return;
        const t = now + idx * 0.065;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        nodes.gain.gain.setValueAtTime(0.0001, t);
        nodes.gain.gain.linearRampToValueAtTime(0.055, t + 0.015);
        nodes.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(nodes.filter);
        osc.start(t);
        osc.stop(t + 0.24);
      });
    }
  }
}

export const soundEngine = new SoundEngine();
