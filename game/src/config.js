// CIRCUIT BREAK — every tuning number and colour lives in this one file. The arena is a fixed
// 1280x720 logical field; the renderer scales that field to the window, so nothing below depends
// on the size of the screen. The only runtime state kept outside memory is the personal best.

export const FIELD = { width: 1280, height: 720 };

/** Simulation runs at a fixed 60 updates a second, whatever the display does. */
export const STEP = 1 / 60;

/** The four screens of the state machine. */
export const SCREEN = Object.freeze({
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  OVER: 'over',
});

/** Neon palette: black arena, five signal colours, nothing else. */
export const PALETTE = {
  bg: '#05060a',
  deep: '#03040a',
  panel: 'rgba(8, 14, 30, 0.72)',
  cyan: '#22e6ff',
  magenta: '#ff3ea5',
  yellow: '#ffd23f',
  green: '#4dff9e',
  purple: '#a06bff',
  white: '#f4faff',
  muted: 'rgba(164, 190, 226, 0.62)',
  grid: 'rgba(34, 230, 255, 0.075)',
  gridMajor: 'rgba(34, 230, 255, 0.16)',
  danger: '#ff415f',
  void: 'rgba(3, 4, 10, 0.78)',
};

/** No webfonts and no network: these families ship with the browser. */
export const FONT = {
  display: '"Arial Black", "Trebuchet MS", sans-serif',
  body: '"Trebuchet MS", "Segoe UI", sans-serif',
  mono: '"Courier New", monospace',
};

export const PLAYER = {
  radius: 15,
  speed: 352,
  maxLives: 3,
  invulnerable: 1.5,
  fireInterval: 0.17,
  rapidInterval: 0.08,
  bulletSpeed: 960,
  bulletRadius: 3.4,
  bulletLife: 1.15,
  bulletDamage: 1,
};

export const COMBO = {
  /** Seconds a kill chain stays alive after the last kill. */
  window: 2,
  /** Every second chained kill raises the multiplier by one. */
  killsPerTier: 2,
  max: 8,
};

export const WAVE = {
  /** Seconds the "WAVE n" banner stays on screen. */
  banner: 2.1,
  /** Quiet gap between a cleared wave and the next. */
  intermission: 2.6,
  /** Seconds between two spawns in the same wave. */
  spawnGap: 0.62,
  minGap: 0.17,
  /** Enemy speed grows this much per wave, up to the cap. */
  speedPerWave: 0.065,
  maxSpeedScale: 1.8,
  /** Delay before the first enemy of a wave walks in. */
  guardDelay: 0.9,
  /** No more than this many hostiles may be alive at once (spawn waits otherwise). */
  maxAlive: 42,
};

export const ENEMY_TYPES = {
  drone: {
    name: 'DRONE',
    color: PALETTE.magenta,
    radius: 15,
    hp: 1,
    speed: 96,
    score: 10,
    burst: 24,
    wobble: 0.55,
    wobbleRate: 2.6,
  },
  runner: {
    name: 'RUNNER',
    color: PALETTE.yellow,
    radius: 13,
    hp: 1,
    speed: 208,
    score: 20,
    burst: 22,
    zigzag: 0.95,
    zigzagRate: 5.6,
  },
  tank: {
    name: 'TANK',
    color: PALETTE.purple,
    radius: 27,
    hp: 3,
    speed: 54,
    score: 50,
    burst: 34,
  },
  spinner: {
    name: 'SPINNER',
    color: PALETTE.green,
    radius: 18,
    hp: 2,
    speed: 80,
    score: 30,
    burst: 26,
    keepDistance: 250,
    shootEvery: 1.8,
    bulletSpeed: 265,
    bulletRadius: 5,
  },
};

export const POWERUPS = {
  shield: { label: 'SHIELD', color: PALETTE.cyan, duration: 5 },
  rapid: { label: 'RAPID', color: PALETTE.yellow, duration: 8 },
  heal: { label: 'REPAIR', color: PALETTE.green, duration: 0 },
};

export const POWERUP = {
  dropChance: 0.16,
  radius: 13,
  life: 15,
  drift: 38,
};

/** Extra room kept between the player's centre and the arena border. */
export const ARENA_MARGIN = 34;

/** Personal best is kept in this browser only. */
export const STORAGE_KEY = 'circuit-break.best';

/** Seeds for the two independent random streams a run uses (simulation and cosmetics). */
export const EFFECT_SEED = 0x9e3779b9;
