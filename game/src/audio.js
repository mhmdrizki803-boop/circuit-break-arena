// Procedural WebAudio: every sound is an oscillator or a burst of filtered noise generated at
// play time, so the game ships with no audio files and makes no network request. The context is
// created lazily on the first user gesture (browsers refuse to start it earlier) and the whole
// module stays silent in screenshot mode.

export function createAudio({ muted = false } = {}) {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = !muted;

  function ensureContext() {
    if (context) return context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      enabled = false;
      return null;
    }
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return context;
  }

  /** Called from the first user gesture; safe to call repeatedly. */
  function unlock() {
    const ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function ready() {
    return enabled && context !== null && context.state === 'running';
  }

  function tone({ type = 'sine', from, to, duration, gain = 0.3, delay = 0, curve = 'exponential' }) {
    if (!ready()) return;
    const now = context.currentTime + delay;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), now);
    if (to !== undefined) {
      if (curve === 'linear') osc.frequency.linearRampToValueAtTime(Math.max(20, to), now + duration);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    }
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function noise({ duration, gain = 0.25, filterFrom = 2400, filterTo = 220, type = 'lowpass', delay = 0 }) {
    if (!ready()) return;
    const now = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFrom, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), now + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(now);
    source.stop(now + duration + 0.03);
  }

  return {
    unlock,
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? 0.32 : 0;
    },
    get enabled() {
      return enabled;
    },
    /** Player shot: a short descending blip, quiet so rapid fire does not fatigue. */
    shoot() {
      tone({ type: 'square', from: 880, to: 320, duration: 0.075, gain: 0.075 });
      tone({ type: 'sine', from: 1480, to: 720, duration: 0.06, gain: 0.05 });
    },
    /** Small enemy pop. */
    explosion() {
      noise({ duration: 0.22, gain: 0.2, filterFrom: 3200, filterTo: 260 });
      tone({ type: 'triangle', from: 240, to: 70, duration: 0.2, gain: 0.14 });
    },
    /** Big enemy death: lower, longer, with a falling sub tone. */
    bigExplosion() {
      noise({ duration: 0.42, gain: 0.28, filterFrom: 2600, filterTo: 120 });
      tone({ type: 'sawtooth', from: 180, to: 48, duration: 0.4, gain: 0.16 });
      tone({ type: 'sine', from: 90, to: 34, duration: 0.5, gain: 0.2 });
    },
    /** Player takes damage: a harsh descending square plus noise. */
    hurt() {
      tone({ type: 'square', from: 340, to: 90, duration: 0.28, gain: 0.2 });
      noise({ duration: 0.3, gain: 0.24, filterFrom: 1600, filterTo: 160 });
    },
    /** Pickup: a bright three-note arpeggio. */
    powerup() {
      tone({ type: 'triangle', from: 660, to: 660, duration: 0.09, gain: 0.16 });
      tone({ type: 'triangle', from: 880, to: 880, duration: 0.09, gain: 0.14, delay: 0.07 });
      tone({ type: 'triangle', from: 1320, to: 1320, duration: 0.12, gain: 0.12, delay: 0.14 });
    },
    /** New wave: a two-oscillator swell. */
    wave() {
      tone({ type: 'sawtooth', from: 180, to: 640, duration: 0.5, gain: 0.12 });
      tone({ type: 'sine', from: 90, to: 320, duration: 0.55, gain: 0.16 });
      noise({ duration: 0.5, gain: 0.08, filterFrom: 600, filterTo: 2600, type: 'bandpass' });
    },
    /** Score milestone (combo tier up). */
    combo() {
      tone({ type: 'sine', from: 1100, to: 1650, duration: 0.08, gain: 0.08 });
    },
    /** Game over: a long falling tone under a noise wash. */
    gameOver() {
      tone({ type: 'sawtooth', from: 300, to: 52, duration: 1.1, gain: 0.18 });
      tone({ type: 'sine', from: 150, to: 30, duration: 1.3, gain: 0.2 });
      noise({ duration: 0.9, gain: 0.16, filterFrom: 1800, filterTo: 90 });
    },
    /** Menu blip. */
    ui() {
      tone({ type: 'square', from: 520, to: 780, duration: 0.06, gain: 0.1 });
    },
  };
}
