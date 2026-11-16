// Deterministic scenes behind ?shot=title|play|over&seed=N. Each one flies the real rules
// forward from a fresh world with a simple autopilot that only reads what a player could see,
// then freezes on a fixed frame. Same seed in, same pixels out: no wall clock, no input, no
// Math.random outside the seeded streams.
//
// The pilot works from eight candidate moves: it scores each by how far it keeps the player from
// hostiles, their bullets and the arena wall, and walks the cheapest. It aims at the nearest live
// hostile with travel-time lead, so shots land like a good player's would.

import { PLAYER, SCREEN, STEP } from './config.js';

const TITLE_SECONDS = 8;
const FIGHT_SECONDS = 29;
/** The beat the pilot holds fire on, so hostiles gather for the frame. */
const SWARM_SECONDS = 7.0;
const OVER_SECONDS = 104;
/** The render clock each scene freezes at; drives decorative motion only. */
const TITLE_CLOCK = 4.7;
const PLAY_CLOCK = 11.3;
/** The beat of action the play scene adds once a wave has arrived, so bullets and sparks show. */
const BUSY_SECONDS = 0.5;
const OVER_CLOCK = 2.2;

const DIRECTIONS = [
  [0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071],
  [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071],
];

/** The cheapest of eight moves: threats, walls and hostile bullets push, the centre pulls. */
function steer(state, pullToCentre) {
  const player = state.player;
  const edge = 96;
  let bestX = 0;
  let bestY = 0;
  let bestCost = Infinity;
  for (let index = 0; index < DIRECTIONS.length; index += 1) {
    const dx = DIRECTIONS[index][0];
    const dy = DIRECTIONS[index][1];
    const x = player.x + dx * 80;
    const y = player.y + dy * 80;
    let cost = 0;
    if (x < edge) cost += (edge - x) * 9;
    if (x > state.fieldWidth - edge) cost += (x - (state.fieldWidth - edge)) * 9;
    if (y < edge) cost += (edge - y) * 9;
    if (y > state.fieldHeight - edge) cost += (y - (state.fieldHeight - edge)) * 9;
    for (let e = 0; e < state.enemies.length; e += 1) {
      const enemy = state.enemies[e];
      if (!enemy.active) continue;
      const ex = enemy.x + enemy.vx * 0.3;
      const ey = enemy.y + enemy.vy * 0.3;
      const distance = Math.hypot(ex - x, ey - y) || 1;
      const reach = enemy.radius + PLAYER.radius + 120;
      if (distance < reach) cost += (reach - distance) * (enemy.type === 'runner' ? 3.6 : 2.4);
    }
    for (let b = 0; b < state.enemyBullets.length; b += 1) {
      const bullet = state.enemyBullets[b];
      if (!bullet.active) continue;
      const bx = bullet.x + bullet.vx * 0.24;
      const by = bullet.y + bullet.vy * 0.24;
      const distance = Math.hypot(bx - x, by - y) || 1;
      if (distance < 76) cost += (76 - distance) * 5;
    }
    if (pullToCentre) {
      cost += Math.hypot(state.fieldWidth / 2 - x, state.fieldHeight / 2 - y) * 0.02;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestX = dx;
      bestY = dy;
    }
  }
  return { x: bestX, y: bestY };
}

/** Lead the nearest hostile by its travel time, which is how the pilot lands hits. */
function aimAt(player, enemy) {
  if (!enemy) return { x: player.x, y: player.y - 260 };
  const travel = Math.min(0.35, Math.hypot(enemy.x - player.x, enemy.y - player.y) / PLAYER.bulletSpeed);
  return { x: enemy.x + enemy.vx * travel, y: enemy.y + enemy.vy * travel };
}

/** Fly the world for `seconds`, or until it ends; tick(dt) keeps the cosmetic layers in step. */
function fly(world, seconds, tick, shoot = true) {
  const total = Math.round(seconds / STEP);
  for (let index = 0; index < total; index += 1) {
    const state = world.state;
    if (state.gameOver) break;
    const target = world.nearestEnemy(state.player.x, state.player.y);
    const move = steer(state, true);
    const aim = aimAt(state.player, target);
    world.step(STEP, {
      moveX: move.x,
      moveY: move.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: shoot && target !== null,
    });
    tick(STEP);
  }
}

/** A tick that does nothing, for the beats the play scene only measures. */
function noTick() {}

/** If the pilot somehow survives to the end of the over scene, the arena finishes the job. */
function forceBreach(world) {
  const state = world.state;
  state.player.invulnerable = 0;
  state.player.shield = 0;
  state.player.lives = 1;
  // Hold still for a second with no shield: the surrounding hostiles close in.
  for (let index = 0; index < 60 && !state.gameOver; index += 1) {
    world.step(STEP, { moveX: 0, moveY: 0, aimX: state.player.x, aimY: state.player.y - 1, firing: false });
  }
  if (!state.gameOver) {
    state.player.invulnerable = 0;
    state.player.lives = 0;
    state.gameOver = true;
    state.phase = 'over';
  }
}

/**
 * Stage one scene. Returns the screen to draw and the best score to show.
 * `tick(dt)` advances the cosmetic layers (particles, shake) alongside the simulation.
 */
export function stageShot(name, world, tick, best) {
  world.reset();
  if (name === 'over') {
    fly(world, OVER_SECONDS, tick);
    if (!world.state.gameOver) forceBreach(world);
    return { screen: SCREEN.OVER, clock: OVER_CLOCK, best: Math.max(best, world.state.score) };
  }
  if (name === 'play') {
    // The play scene freezes on a full arena at a real score. The pilot fights normally first, so
    // the number on the HUD is one an actual run reaches, then holds fire for a beat so hostiles
    // gather and close in, and opens up again on the last fragment of a second so the frame also
    // catches bullets in flight and the sparks of the first kills.
    fly(world, FIGHT_SECONDS, tick);
    fly(world, SWARM_SECONDS, tick, false);
    fly(world, BUSY_SECONDS, tick);
    return { screen: SCREEN.PLAY, clock: PLAY_CLOCK, best: Math.max(best, world.state.score) };
  }
  // Any other value is the title: a short, lively run so real hostiles and particles sit behind
  // the logo instead of a static gradient.
  fly(world, TITLE_SECONDS, tick);
  return { screen: SCREEN.TITLE, clock: TITLE_CLOCK, best };
}
