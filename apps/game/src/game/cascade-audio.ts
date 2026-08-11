export type CascadeAudioCue = 'remove' | 'fall' | 'land' | 'success';

interface AudioPreferences {
  readonly muted: () => boolean;
  readonly volume: () => number;
}

/** Small procedural cue set; failures and blocked audio never affect presentation progression. */
export class CascadeAudioGrammar {
  private context: AudioContext | undefined;

  constructor(private readonly preferences: AudioPreferences) {}

  play(cue: CascadeAudioCue, depth: number): void {
    try {
      if (this.preferences.muted()) return;
      const AudioContextConstructor = window.AudioContext;
      this.context ??= new AudioContextConstructor();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      const context = this.context;
      const now = context.currentTime;
      const pitch = 1 + Math.min(Math.max(depth - 1, 0), 4) * 0.06;
      const settings = {
        remove: { start: 720, end: 410, duration: 0.16, type: 'triangle' as OscillatorType },
        fall: { start: 260, end: 115, duration: 0.22, type: 'sawtooth' as OscillatorType },
        land: { start: 280, end: 430, duration: 0.12, type: 'sine' as OscillatorType },
        success: { start: 560, end: 840, duration: 0.2, type: 'sine' as OscillatorType },
      }[cue];
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = settings.type;
      oscillator.frequency.setValueAtTime(settings.start * pitch, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        settings.end * pitch,
        now + settings.duration,
      );
      const volume = Math.min(1, Math.max(0, this.preferences.volume())) * 0.055;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + settings.duration);
    } catch {
      // Audio is ornamental and must never block or fail a cascade.
    }
  }

  dispose(): void {
    const context = this.context;
    this.context = undefined;
    if (context) void context.close().catch(() => undefined);
  }
}
