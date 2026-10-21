// Short beeps made with the Web Audio API. The app only ever makes its own sounds here: it never reads or
// processes the video's audio. These functions do not look at the "sounds" setting; the caller checks
// `settings.sounds` first.

const HIT_MS = 120;
const MISS_MS = 160;
const MISS_HZ = 220;

/** Loudness at the top of the envelope. Low, so a long streak of beeps stays pleasant. */
const PEAK_GAIN = 0.2;
/** The envelope starts and ends here instead of at 0, because an exponential ramp cannot reach 0. */
const SILENCE = 0.0001;
const ATTACK_S = 0.01;

/** The pitch of a hit: 440 Hz, one semitone higher for each hit in a row, up to one octave (880 Hz) at 12. */
export function hitFrequency(combo: number): number {
  return 440 * 2 ** (Math.min(combo, 12) / 12);
}

/** One context for the whole page: browsers cap how many can exist, and each one is expensive. */
let shared: AudioContext | null = null;

/** The shared context, created on first use; null when there is none (server side, tests, old browsers). */
function audioContext(): AudioContext | null {
  if (shared) return shared;
  if (typeof AudioContext === 'undefined') return null;
  try {
    shared = new AudioContext();
  } catch {
    shared = null;
  }
  return shared;
}

/** A sine beep with a quick fade in and a fade out, so it starts and ends without a click. */
function beep(frequency: number, durationMs: number): void {
  try {
    const context = audioContext();
    if (!context) return;
    // A context made before the first tap starts suspended; the tap that got us here is allowed to wake it.
    if (context.state === 'suspended') context.resume().catch(() => {});

    const start = context.currentTime;
    const end = start + durationMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end);
  } catch {
    // A sound that fails must never break the game.
  }
}

/** The sound of a first-try hit; it climbs with the combo. */
export function playHit(combo: number): void {
  beep(hitFrequency(combo), HIT_MS);
}

/** The sound of a first-try miss. */
export function playMiss(): void {
  beep(MISS_HZ, MISS_MS);
}
