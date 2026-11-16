// Boot and the one loop. The world advances in fixed 1/60 s steps (several in a slow frame, none
// in a fast one) and the renderer paints whatever is there. A small state machine moves between
// TITLE, PLAY, PAUSED and OVER. With ?shot=title|play|over the loop is replaced by a single
// staged frame: no input, no audio, no wall clock, same seed == same pixels.

import { PLAYER, SCREEN, STEP, STORAGE_KEY } from './config.js';
import { createAudio } from './audio.js';
import { ACTION_PAUSE, ACTION_RESTART, ACTION_START, createInput } from './input.js';
import { createParticles, createShake } from './particles.js';
import { createRandom, mixSeed } from './random.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import {
  EVENT_BIG_KILL, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_POWERUP, EVENT_SHOT, EVENT_WAVE, createWorld,
} from './world.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The title backdrop is a harmless run, kept fresh by resetting it every this many seconds. */
const TITLE_RESET_SECONDS = 26;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? mixSeed(seedParam) : mixSeed(Date.now() & 0xffffffff);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio({ muted: Boolean(shotName) });

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage can be unavailable (private windows): the best then lasts this visit only.
  }
}

/** Announce state changes as text, for screen readers and anyone reading the page. */
function announce(message) {
  if (status) status.textContent = message;
}

/** The effects bag both the live game and the shot scenes hand to the world. */
function createEffects(effectRandom) {
  const particles = createParticles(effectRandom);
  const shake = createShake(effectRandom);
  return {
    particles,
    shake,
    fx: {
      burst: particles.burst,
      sparkle: particles.sparkle,
      trail: particles.trail,
      ring: particles.ring,
      shake: (amount) => shake.add(amount),
    },
  };
}

// ---- deterministic screenshot scenes --------------------------------------

function runShot(name) {
  const effects = createEffects(createRandom(mixSeed(seed ^ 0x5bd1e995)));
  const world = createWorld(createRandom(seed), effects.fx);
  const tick = (dt) => {
    effects.particles.update(dt);
    effects.shake.update(dt);
  };
  const scene = stageShot(name, world, tick, readBest());

  const frame = {
    state: world.state,
    effects: { shake: effects.shake },
    particles: effects.particles,
    screen: scene.screen,
    best: scene.best,
    time: scene.clock,
    aim: { x: 0, y: 0, inside: false },
  };

  // Paint twice so any first-frame cost lands before the capture marks the page ready, then keep
  // repainting the identical frozen frame: the page stays alive, the pixels stay deterministic.
  let painted = 0;
  function paint() {
    renderer.draw(frame);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__gameReady = true;
      announce(`Circuit Break screenshot: ${scene.screen}.`);
      requestAnimationFrame(hold);
    }
  }
  function hold() {
    renderer.draw(frame);
    requestAnimationFrame(hold);
  }
  requestAnimationFrame(paint);
}

// ---- the real game --------------------------------------------------------

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => renderer.toField(clientX, clientY));
  const effects = createEffects(createRandom(mixSeed(seed ^ 0x5bd1e995)));
  const world = createWorld(createRandom(seed), effects.fx);
  const { particles, shake } = effects;

  let screen = SCREEN.TITLE;
  let best = readBest();
  let clock = 0;
  let titleClock = 0;
  let accumulator = 0;
  let last = performance.now();
  let aim = { x: 0, y: 0, inside: false };

  function startRun() {
    world.reset();
    particles.clear();
    shake.reset();
    accumulator = 0;
    screen = SCREEN.PLAY;
    audio.wave();
    announce(`Playing with ${PLAYER.maxLives} lives. Survive the grid.`);
  }

  function endRun() {
    screen = SCREEN.OVER;
    if (world.state.score > best) {
      best = world.state.score;
      writeBest(best);
      announce(`System breach. New best: ${best}. Press R to restart.`);
    } else {
      announce(`System breach. Score ${world.state.score}. Best ${best}. Press R to restart.`);
    }
    audio.gameOver();
  }

  function pause() {
    screen = SCREEN.PAUSED;
    audio.ui();
    announce('Paused. Press P to resume.');
  }

  function resume() {
    screen = SCREEN.PLAY;
    audio.ui();
    announce('Playing.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions === 0) return;
    if (screen === SCREEN.TITLE) {
      if (actions & (ACTION_START | ACTION_RESTART)) {
        audio.unlock();
        audio.ui();
        startRun();
      }
      return;
    }
    if (screen === SCREEN.OVER) {
      if (actions & (ACTION_START | ACTION_RESTART)) {
        audio.unlock();
        startRun();
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN.PLAY) pause();
      else if (screen === SCREEN.PAUSED) resume();
      return;
    }
    if (screen === SCREEN.PAUSED && actions & ACTION_START) resume();
    else if (screen === SCREEN.PLAY && actions & ACTION_RESTART) startRun();
  }

  /** Turn world events into sound. The visual side is already handled by the effects sink. */
  function react(events) {
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_BIG_KILL) audio.bigExplosion();
    else if (events & EVENT_KILL) audio.explosion();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_POWERUP) audio.powerup();
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_HIT && !(events & EVENT_OVER)) {
      const lives = world.state.player.lives;
      announce(lives === 1 ? 'Hit. 1 life left.' : `Hit. ${lives} lives left.`);
    }
    if (events & EVENT_OVER) endRun();
  }

  /** A gentle autopilot for the title backdrop: it dodges, never shoots, never scores. */
  function titleControl() {
    const state = world.state;
    const player = state.player;
    let threatX = 0;
    let threatY = 0;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index];
      if (!enemy.active) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 260) {
        const weight = (260 - distance) / 260;
        threatX -= (dx / distance) * weight;
        threatY -= (dy / distance) * weight;
      }
    }
    let moveX;
    let moveY;
    if (threatX === 0 && threatY === 0) {
      // Nothing near: drift in a slow lissajous so the dot never parks.
      moveX = Math.cos(clock * 0.42) * 0.5;
      moveY = Math.sin(clock * 0.31) * 0.35;
    } else {
      const length = Math.hypot(threatX, threatY) || 1;
      moveX = threatX / length;
      moveY = threatY / length;
    }
    return { moveX, moveY, aimX: player.x, aimY: player.y - 120, firing: false };
  }

  function stepOnce() {
    if (screen === SCREEN.TITLE) {
      const events = world.step(STEP, titleControl());
      // Nothing the title backdrop does should end in a score or a breach: ignore kills' score by
      // resetting the run when it gets old, and keep the player alive.
      if (events & EVENT_HIT) {
        world.state.player.lives = PLAYER.maxLives;
        world.state.player.invulnerable = PLAYER.invulnerable;
      }
      titleClock += STEP;
      if (titleClock > TITLE_RESET_SECONDS || world.state.gameOver) {
        world.reset();
        titleClock = 0;
      }
      return;
    }

    const pointer = input.pointer();
    const movement = input.movement();
    let aimX = pointer.x;
    let aimY = pointer.y;
    if (!pointer.inside) {
      // Keyboard-only: aim the way the player is moving (or upward when standing still).
      aimX = world.state.player.x + movement.x * 240;
      aimY = world.state.player.y + movement.y * 240 - 90;
    }
    aim = { x: aimX, y: aimY, inside: pointer.inside };
    const events = world.step(STEP, {
      moveX: movement.x,
      moveY: movement.y,
      aimX,
      aimY,
      firing: input.firing(),
    });
    if (events) react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    clock += delta;
    handleActions();

    if (screen === SCREEN.TITLE || screen === SCREEN.PLAY) {
      accumulator += delta;
      while (accumulator >= STEP) {
        stepOnce();
        accumulator -= STEP;
        if (screen !== SCREEN.TITLE && screen !== SCREEN.PLAY) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }

    // Effects tick even while paused, so a paused frame still feels lit rather than dead.
    particles.update(delta);
    shake.update(delta);

    renderer.draw({
      state: world.state,
      effects: { shake },
      particles,
      screen,
      best,
      time: clock,
      aim: screen === SCREEN.PLAY ? aim : { x: 0, y: 0, inside: false },
    });
  }

  // Losing focus pauses a live run instead of letting the arena play on unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN.PLAY) pause();
  });
  window.addEventListener('blur', () => {
    if (screen === SCREEN.PLAY) pause();
  });

  // An audio context may only start from a gesture: the first one unlocks it.
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Prime the title backdrop with a few harmless steps so it is never empty on the first frame.
  for (let index = 0; index < 150; index += 1) world.step(STEP, titleControl());

  announce('Circuit Break. Press Enter to start.');
  window.__gameReady = true;
  requestAnimationFrame(frame);
}

if (shotName) runShot(shotName);
else runGame();
