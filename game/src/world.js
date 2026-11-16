// The rules, with no drawing and no browser in it: the player, bullets, hostiles, pickups, waves,
// collisions, score and combo. step() advances one fixed step and returns what happened as bit
// flags, so the caller reacts (sound, screens) without the simulation knowing about them.
//
// Two collaboration points keep it honest:
//   - `fx` is the cosmetic sink (particles, rings, screen shake). The simulation decides what
//     happened; the effects layer decides how it looks. Pass null for a silent, headless run.
//   - `random` is the only source of chance, so the same seed replays exactly the same run.
//
// Every pool is allocated once in createWorld; step() never allocates.

import {
  ARENA_MARGIN,
  COMBO,
  ENEMY_TYPES,
  FIELD,
  PLAYER,
  POWERUP,
  POWERUPS,
  WAVE,
} from './config.js';

export const EVENT_SHOT = 1;
export const EVENT_KILL = 2;
export const EVENT_HIT = 4;
export const EVENT_POWERUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_OVER = 32;
export const EVENT_BIG_KILL = 64;

const ENEMY_POOL = 160;
const BULLET_POOL = 96;
const ENEMY_BULLET_POOL = 96;
const PICKUP_POOL = 24;
const TAU = Math.PI * 2;

/** Circle overlap, squared so it needs no square root. */
function touching(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const reach = ar + br;
  return dx * dx + dy * dy < reach * reach;
}

export function createWorld(random, fx) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    radius: PLAYER.radius,
    aimX: FIELD.width / 2,
    aimY: 0,
    angle: -Math.PI / 2,
    lives: PLAYER.maxLives,
    invulnerable: 0,
    shield: 0,
    rapid: 0,
    cooldown: 0,
  };

  const bullets = new Array(BULLET_POOL);
  for (let index = 0; index < BULLET_POOL; index += 1) {
    bullets[index] = { active: false, x: 0, y: 0, vx: 0, vy: 0, radius: PLAYER.bulletRadius, life: 0 };
  }
  const enemyBullets = new Array(ENEMY_BULLET_POOL);
  for (let index = 0; index < ENEMY_BULLET_POOL; index += 1) {
    enemyBullets[index] = { active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 4, life: 0 };
  }
  const enemies = new Array(ENEMY_POOL);
  for (let index = 0; index < ENEMY_POOL; index += 1) {
    enemies[index] = {
      active: false, type: 'drone', x: 0, y: 0, vx: 0, vy: 0, radius: 0, hp: 1, maxHp: 1,
      speed: 0, score: 0, angle: 0, spin: 0, wobble: 0, wobbleRate: 0, timer: 0, shootTimer: 0, hitFlash: 0,
    };
  }
  const pickups = new Array(PICKUP_POOL);
  for (let index = 0; index < PICKUP_POOL; index += 1) {
    pickups[index] = { active: false, kind: 'shield', x: 0, y: 0, vx: 0, vy: 0, life: 0, age: 0 };
  }

  const state = {
    fieldWidth: FIELD.width,
    fieldHeight: FIELD.height,
    player,
    bullets,
    enemyBullets,
    enemies,
    pickups,
    score: 0,
    wave: 0,
    phase: 'banner',
    phaseTimer: 0,
    bannerTimer: 0,
    spawnQueue: [],
    spawnIndex: 0,
    spawnTimer: 0,
    spawnGap: WAVE.spawnGap,
    speedScale: 1,
    alive: 0,
    combo: { chain: 0, multiplier: 1, timer: 0 },
    stats: { kills: 0, shots: 0, hits: 0, time: 0, bestCombo: 1 },
    gameOver: false,
  };

  // ---- lifecycle -----------------------------------------------------------

  function clearPools() {
    for (let index = 0; index < BULLET_POOL; index += 1) bullets[index].active = false;
    for (let index = 0; index < ENEMY_BULLET_POOL; index += 1) enemyBullets[index].active = false;
    for (let index = 0; index < ENEMY_POOL; index += 1) enemies[index].active = false;
    for (let index = 0; index < PICKUP_POOL; index += 1) pickups[index].active = false;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.angle = -Math.PI / 2;
    player.aimX = FIELD.width / 2;
    player.aimY = 0;
    player.lives = PLAYER.maxLives;
    player.invulnerable = 0;
    player.shield = 0;
    player.rapid = 0;
    player.cooldown = 0;
    clearPools();
    state.score = 0;
    state.wave = 0;
    state.alive = 0;
    state.combo.chain = 0;
    state.combo.multiplier = 1;
    state.combo.timer = 0;
    state.stats.kills = 0;
    state.stats.shots = 0;
    state.stats.hits = 0;
    state.stats.time = 0;
    state.stats.bestCombo = 1;
    state.gameOver = false;
    state.spawnQueue.length = 0;
    startWave(1);
  }

  // ---- waves ---------------------------------------------------------------

  /** The enemy types a wave sends, in spawn order (shuffled past the first few easy ones). */
  function composeWave(wave) {
    const queue = [];
    const drones = Math.min(5 + wave * 2, 26);
    for (let index = 0; index < drones; index += 1) queue.push('drone');
    if (wave >= 2) {
      const runners = Math.min(2 + Math.floor(wave * 1.2), 16);
      for (let index = 0; index < runners; index += 1) queue.push('runner');
    }
    if (wave >= 3) {
      const tanks = Math.min(1 + Math.floor(wave / 2), 8);
      for (let index = 0; index < tanks; index += 1) queue.push('tank');
    }
    if (wave >= 4) {
      const spinners = Math.min(1 + Math.floor(wave / 2), 8);
      for (let index = 0; index < spinners; index += 1) queue.push('spinner');
    }
    for (let index = queue.length - 1; index > 4; index -= 1) {
      const swap = 4 + Math.floor(random() * (index - 3));
      const value = queue[index];
      queue[index] = queue[swap];
      queue[swap] = value;
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.phase = 'banner';
    state.phaseTimer = WAVE.banner;
    state.bannerTimer = WAVE.banner;
    state.spawnQueue = composeWave(wave);
    state.spawnIndex = 0;
    state.spawnGap = Math.max(WAVE.minGap, WAVE.spawnGap * Math.pow(0.94, wave - 1));
    state.spawnTimer = WAVE.guardDelay;
    state.speedScale = Math.min(WAVE.maxSpeedScale, 1 + WAVE.speedPerWave * (wave - 1));
  }

  // ---- spawning ------------------------------------------------------------

  function freeEnemy() {
    for (let index = 0; index < ENEMY_POOL; index += 1) if (!enemies[index].active) return enemies[index];
    return null;
  }

  /** Runs on the wave end: a tank splits into two smaller drones at its last position. */
  function spawnEnemy(type, x, y, bonus) {
    const enemy = freeEnemy();
    if (enemy === null) return null;
    const spec = ENEMY_TYPES[type];
    if (x === undefined) {
      const side = Math.floor(random() * 4);
      const pad = spec.radius + 28;
      if (side === 0) {
        x = -pad;
        y = 60 + random() * (FIELD.height - 120);
      } else if (side === 1) {
        x = FIELD.width + pad;
        y = 60 + random() * (FIELD.height - 120);
      } else if (side === 2) {
        x = 80 + random() * (FIELD.width - 160);
        y = -pad;
      } else {
        x = 80 + random() * (FIELD.width - 160);
        y = FIELD.height + pad;
      }
    }
    enemy.active = true;
    enemy.type = type;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = spec.radius * (bonus ? 0.78 : 1);
    enemy.hp = spec.hp;
    enemy.maxHp = spec.hp;
    enemy.speed = spec.speed * state.speedScale * (bonus ? 1.1 : 1) * (0.9 + random() * 0.2);
    enemy.score = spec.score;
    enemy.angle = random() * TAU;
    enemy.spin = (random() - 0.5) * 2;
    enemy.wobble = random() * TAU;
    enemy.wobbleRate = spec.wobbleRate ?? 2;
    enemy.timer = bonus ? 0.35 : 0;
    enemy.shootTimer = spec.shootEvery !== undefined ? 0.6 + random() * 0.8 : 0;
    enemy.hitFlash = 0;
    state.alive += 1;
    return enemy;
  }

  function spawnQueued() {
    if (state.spawnIndex >= state.spawnQueue.length) return false;
    if (state.alive >= WAVE.maxAlive) return false;
    spawnEnemy(state.spawnQueue[state.spawnIndex]);
    state.spawnIndex += 1;
    return true;
  }

  // ---- projectiles ---------------------------------------------------------

  function freeBullet() {
    for (let index = 0; index < BULLET_POOL; index += 1) if (!bullets[index].active) return bullets[index];
    return null;
  }

  function firePlayerBullet() {
    const bullet = freeBullet();
    if (bullet === null) return false;
    const spread = player.rapid > 0 ? 0.055 : 0.02;
    const angle = player.angle + (random() - 0.5) * spread;
    const muzzle = player.radius + 8;
    bullet.active = true;
    bullet.x = player.x + Math.cos(angle) * muzzle;
    bullet.y = player.y + Math.sin(angle) * muzzle;
    bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    bullet.radius = PLAYER.bulletRadius;
    bullet.life = PLAYER.bulletLife;
    state.stats.shots += 1;
    if (fx) {
      fx.burst(bullet.x, bullet.y, '#bff8ff', 3, 90);
      fx.ring(bullet.x, bullet.y, '#22e6ff', 2, 14, 0.12, 1.4);
    }
    return true;
  }

  function fireEnemyBullet(enemy, speed, radius) {
    let bullet = null;
    for (let index = 0; index < ENEMY_BULLET_POOL; index += 1) {
      if (!enemyBullets[index].active) {
        bullet = enemyBullets[index];
        break;
      }
    }
    if (bullet === null) return;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    bullet.active = true;
    bullet.x = enemy.x + Math.cos(angle) * (enemy.radius + 6);
    bullet.y = enemy.y + Math.sin(angle) * (enemy.radius + 6);
    bullet.vx = Math.cos(angle) * speed;
    bullet.vy = Math.sin(angle) * speed;
    bullet.radius = radius;
    bullet.life = 5;
    if (fx) fx.ring(bullet.x, bullet.y, '#4dff9e', 3, 22, 0.2, 1.6);
  }

  // ---- hostiles ------------------------------------------------------------

  function updateEnemy(enemy, dt) {
    const spec = ENEMY_TYPES[enemy.type];
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    enemy.wobble += enemy.wobbleRate * dt;
    enemy.angle += enemy.spin * dt;
    if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);

    let ax = nx;
    let ay = ny;
    if (enemy.type === 'drone') {
      // A slow, wobbling chase: the easiest enemy to read.
      const sway = Math.sin(enemy.wobble) * (spec.wobble ?? 0.4);
      ax += -ny * sway;
      ay += nx * sway;
    } else if (enemy.type === 'runner') {
      // Fast, weaving across its own approach line.
      const weave = Math.sin(enemy.wobble) * (spec.zigzag ?? 0.8);
      ax += -ny * weave;
      ay += nx * weave;
    } else if (enemy.type === 'spinner') {
      // Holds range, circles, and fires at the player.
      const keep = spec.keepDistance ?? 240;
      if (distance < keep * 0.72) {
        ax = -nx;
        ay = -ny;
      } else if (distance < keep) {
        ax = -ny + nx * 0.12;
        ay = nx + ny * 0.12;
      } else {
        ax = nx * 0.7 - ny * 0.6;
        ay = ny * 0.7 + nx * 0.6;
      }
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0 && distance < 760) {
        enemy.shootTimer = spec.shootEvery * (0.85 + random() * 0.3);
        fireEnemyBullet(enemy, spec.bulletSpeed ?? 250, spec.bulletRadius ?? 4);
      }
    }

    const length = Math.hypot(ax, ay) || 1;
    const targetVx = (ax / length) * enemy.speed;
    const targetVy = (ay / length) * enemy.speed;
    const ease = Math.min(1, dt * 5.5);
    enemy.vx += (targetVx - enemy.vx) * ease;
    enemy.vy += (targetVy - enemy.vy) * ease;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    // A generous leash: a hostile that leaves the arena is pulled straight back in.
    if (enemy.x < -200 || enemy.x > FIELD.width + 200 || enemy.y < -200 || enemy.y > FIELD.height + 200) {
      enemy.x = Math.min(FIELD.width + 140, Math.max(-140, enemy.x));
      enemy.y = Math.min(FIELD.height + 140, Math.max(-140, enemy.y));
    }
  }

  // ---- effects and scoring -------------------------------------------------

  function addShake(amount) {
    if (fx) fx.shake(amount);
  }

  function killEnemy(enemy, giveScore) {
    enemy.active = false;
    state.alive = Math.max(0, state.alive - 1);
    const spec = ENEMY_TYPES[enemy.type];
    const big = enemy.type === 'tank';
    if (fx) {
      fx.burst(enemy.x, enemy.y, spec.color, big ? 40 : spec.burst, big ? 440 : 290);
      fx.ring(enemy.x, enemy.y, spec.color, enemy.radius * 0.6, big ? 160 : 76, big ? 0.55 : 0.4, big ? 4 : 2.4);
      if (big) fx.ring(enemy.x, enemy.y, '#ffffff', enemy.radius, 230, 0.72, 2);
      addShake(big ? 0.5 : 0.12);
    }
    if (giveScore) {
      state.stats.kills += 1;
      state.combo.chain += 1;
      state.combo.timer = COMBO.window;
      const next = Math.min(COMBO.max, 1 + Math.floor(state.combo.chain / COMBO.killsPerTier));
      if (next > state.combo.multiplier) state.combo.multiplier = next;
      if (state.combo.multiplier > state.stats.bestCombo) state.stats.bestCombo = state.combo.multiplier;
      state.score += enemy.score * state.combo.multiplier;
      maybeDropPowerup(enemy.x, enemy.y);
    }
    if (enemy.type === 'tank') {
      // A tank breaks into two smaller drones instead of dying cleanly.
      for (let index = 0; index < 2; index += 1) {
        const angle = enemy.angle + index * Math.PI;
        spawnEnemy('drone', enemy.x + Math.cos(angle) * 18, enemy.y + Math.sin(angle) * 18, true);
      }
    }
  }

  function damagePlayer(sourceX, sourceY) {
    player.lives -= 1;
    player.invulnerable = PLAYER.invulnerable;
    addShake(0.85);
    if (fx) {
      fx.burst(player.x, player.y, '#ff3ea5', 34, 350);
      fx.ring(player.x, player.y, '#ff3ea5', 10, 195, 0.6, 4);
    }
    if (sourceX !== undefined) {
      const dx = player.x - sourceX;
      const dy = player.y - sourceY;
      const length = Math.hypot(dx, dy) || 1;
      player.x = Math.min(FIELD.width - ARENA_MARGIN, Math.max(ARENA_MARGIN, player.x + (dx / length) * 18));
      player.y = Math.min(FIELD.height - ARENA_MARGIN, Math.max(ARENA_MARGIN, player.y + (dy / length) * 18));
    }
    if (player.lives <= 0) {
      player.lives = 0;
      state.gameOver = true;
      state.phase = 'over';
      if (fx) {
        fx.burst(player.x, player.y, '#ffffff', 60, 540);
        fx.ring(player.x, player.y, '#22e6ff', 10, 330, 0.9, 5);
      }
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function maybeDropPowerup(x, y) {
    if (random() >= POWERUP.dropChance) return;
    let slot = null;
    for (let index = 0; index < PICKUP_POOL; index += 1) {
      if (!pickups[index].active) {
        slot = pickups[index];
        break;
      }
    }
    if (slot === null) return;
    // Repair only drops when it can do something.
    const roll = random();
    let kind;
    if (player.lives < PLAYER.maxLives) kind = roll < 0.38 ? 'heal' : roll < 0.7 ? 'shield' : 'rapid';
    else kind = roll < 0.52 ? 'shield' : 'rapid';
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.vx = (random() - 0.5) * POWERUP.drift;
    slot.vy = 26 + random() * 22;
    slot.life = POWERUP.life;
    slot.age = 0;
  }

  // ---- collisions ----------------------------------------------------------

  function resolvePlayerBullets() {
    let events = 0;
    for (let b = 0; b < BULLET_POOL; b += 1) {
      const bullet = bullets[b];
      if (!bullet.active) continue;
      for (let e = 0; e < ENEMY_POOL; e += 1) {
        const enemy = enemies[e];
        if (!enemy.active) continue;
        if (!touching(bullet.x, bullet.y, bullet.radius, enemy.x, enemy.y, enemy.radius)) continue;
        bullet.active = false;
        state.stats.hits += 1;
        enemy.hp -= PLAYER.bulletDamage;
        enemy.hitFlash = 1;
        if (fx) fx.burst(bullet.x, bullet.y, ENEMY_TYPES[enemy.type].color, 6, 145);
        if (enemy.hp <= 0) {
          const big = enemy.type === 'tank' || enemy.type === 'spinner';
          killEnemy(enemy, true);
          events |= big ? EVENT_KILL | EVENT_BIG_KILL : EVENT_KILL;
        }
        break;
      }
    }
    return events;
  }

  function resolvePlayerEnemyCollision() {
    if (player.invulnerable > 0) return 0;
    for (let index = 0; index < ENEMY_POOL; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      if (!touching(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) continue;
      if (player.shield > 0) {
        // The shield eats the contact, and the hostile along with it.
        killEnemy(enemy, false);
        if (fx) fx.ring(player.x, player.y, '#22e6ff', 20, 125, 0.35, 3);
        addShake(0.2);
        continue;
      }
      const events = damagePlayer(enemy.x, enemy.y);
      killEnemy(enemy, false);
      return events;
    }
    return 0;
  }

  function resolveEnemyBulletHits() {
    if (player.invulnerable > 0) return 0;
    for (let index = 0; index < ENEMY_BULLET_POOL; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      if (!touching(player.x, player.y, player.radius, bullet.x, bullet.y, bullet.radius)) continue;
      bullet.active = false;
      if (player.shield > 0) {
        if (fx) fx.burst(bullet.x, bullet.y, '#22e6ff', 10, 165);
        continue;
      }
      return damagePlayer(bullet.x, bullet.y);
    }
    return 0;
  }

  function collectPickups() {
    let events = 0;
    for (let index = 0; index < PICKUP_POOL; index += 1) {
      const pickup = pickups[index];
      if (!pickup.active) continue;
      if (!touching(player.x, player.y, player.radius + 3, pickup.x, pickup.y, POWERUP.radius)) continue;
      pickup.active = false;
      if (pickup.kind === 'heal') player.lives = Math.min(PLAYER.maxLives, player.lives + 1);
      else if (pickup.kind === 'shield') player.shield = Math.max(player.shield, POWERUPS.shield.duration);
      else player.rapid = Math.max(player.rapid, POWERUPS.rapid.duration);
      if (fx) {
        fx.sparkle(pickup.x, pickup.y, POWERUPS[pickup.kind].color, 24);
        fx.ring(pickup.x, pickup.y, POWERUPS[pickup.kind].color, 6, 72, 0.4, 3);
      }
      events |= EVENT_POWERUP;
    }
    return events;
  }

  // ---- timers --------------------------------------------------------------

  function updateSpawner(dt) {
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.phase === 'banner') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) state.phase = 'spawning';
    } else if (state.phase === 'spawning') {
      state.spawnTimer -= dt;
      const queued = state.spawnIndex < state.spawnQueue.length;
      if (queued && state.spawnTimer <= 0 && state.alive < WAVE.maxAlive) {
        spawnQueued();
        state.spawnTimer = state.spawnGap * (0.75 + random() * 0.5);
      }
      if (state.spawnIndex >= state.spawnQueue.length && state.alive <= 0) {
        state.phase = 'clearing';
        state.phaseTimer = WAVE.intermission;
      }
    } else if (state.phase === 'clearing') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) startWave(state.wave + 1);
    }
  }

  function updateProjectiles(dt) {
    for (let index = 0; index < BULLET_POOL; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      bullet.life -= dt;
      if (bullet.life <= 0) {
        bullet.active = false;
        continue;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (fx) fx.trail(bullet.x, bullet.y, '#22e6ff', 3.4);
      if (bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) bullet.active = false;
    }
    for (let index = 0; index < ENEMY_BULLET_POOL; index += 1) {
      const bullet = enemyBullets[index];
      if (!bullet.active) continue;
      bullet.life -= dt;
      if (bullet.life <= 0) {
        bullet.active = false;
        continue;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (fx) fx.trail(bullet.x, bullet.y, '#4dff9e', 4);
      if (bullet.x < -30 || bullet.x > FIELD.width + 30 || bullet.y < -30 || bullet.y > FIELD.height + 30) bullet.active = false;
    }
  }

  function updatePickups(dt) {
    for (let index = 0; index < PICKUP_POOL; index += 1) {
      const pickup = pickups[index];
      if (!pickup.active) continue;
      pickup.age += dt;
      pickup.life -= dt;
      if (pickup.life <= 0) {
        pickup.active = false;
        continue;
      }
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      pickup.vy += 8 * dt;
      if (pickup.x < 18 || pickup.x > FIELD.width - 18) pickup.vx *= -1;
      if (pickup.y > FIELD.height + 30) pickup.active = false;
    }
  }

  // ---- the step ------------------------------------------------------------

  /**
   * One fixed step. `control` is {moveX, moveY, aimX, aimY, firing}; the aim point is in arena
   * coordinates. Returns EVENT_* flags for the caller.
   */
  function step(dt, control) {
    if (state.gameOver) return 0;
    let events = 0;
    state.stats.time += dt;

    // Movement: the input layer already normalises diagonals, but clamp here too so an autopilot
    // or a future controller cannot move faster than a player.
    const moveX = Math.max(-1, Math.min(1, control.moveX));
    const moveY = Math.max(-1, Math.min(1, control.moveY));
    const length = Math.hypot(moveX, moveY);
    const scale = length > 1 ? 1 / length : 1;
    player.x += moveX * scale * PLAYER.speed * dt;
    player.y += moveY * scale * PLAYER.speed * dt;
    player.x = Math.min(FIELD.width - ARENA_MARGIN, Math.max(ARENA_MARGIN, player.x));
    player.y = Math.min(FIELD.height - ARENA_MARGIN, Math.max(ARENA_MARGIN, player.y));

    player.aimX = control.aimX;
    player.aimY = control.aimY;
    const aimDx = control.aimX - player.x;
    const aimDy = control.aimY - player.y;
    if (Math.hypot(aimDx, aimDy) > 4) player.angle = Math.atan2(aimDy, aimDx);

    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.shield > 0) player.shield = Math.max(0, player.shield - dt);
    if (player.rapid > 0) player.rapid = Math.max(0, player.rapid - dt);
    player.cooldown -= dt;

    if (state.combo.timer > 0) {
      state.combo.timer = Math.max(0, state.combo.timer - dt);
      if (state.combo.timer === 0) {
        state.combo.chain = 0;
        state.combo.multiplier = 1;
      }
    }

    if (control.firing && player.cooldown <= 0 && firePlayerBullet()) {
      events |= EVENT_SHOT;
      player.cooldown = player.rapid > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
    }

    const waveBefore = state.wave;
    updateSpawner(dt);
    if (state.wave !== waveBefore) events |= EVENT_WAVE;

    updateProjectiles(dt);
    for (let index = 0; index < ENEMY_POOL; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      if (enemy.timer > 0) enemy.timer -= dt;
      updateEnemy(enemy, dt);
    }
    updatePickups(dt);

    events |= resolvePlayerBullets();
    events |= resolvePlayerEnemyCollision();
    if (!state.gameOver) events |= resolveEnemyBulletHits();
    if (!state.gameOver) events |= collectPickups();
    return events;
  }

  /** The closest live hostile to a point, for autopilots and threat indicators. */
  function nearestEnemy(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (let index = 0; index < ENEMY_POOL; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  reset();
  return { state, reset, step, nearestEnemy };
}
