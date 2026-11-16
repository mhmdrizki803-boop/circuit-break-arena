// Drawing only: world state and screen in, pixels out. The 1280x720 arena is scaled to fit the
// window and centred, the letterbox filled with the deeper black. All art is canvas paths, all
// glow is shadowBlur, and every entity keeps a white-hot core so it reads at any size.

import { ARENA_MARGIN, ENEMY_TYPES, FIELD, FONT, PALETTE, PLAYER, POWERUPS, POWERUP, SCREEN } from './config.js';
import { drawHud, drawOverScreen, drawPauseScreen, drawTitleScreen, drawWaveBanner, glowText } from './hud.js';

const TAU = Math.PI * 2;

/** Shared edge function, drawn once per resize into an offscreen canvas: a cheap backdrop. */
function buildBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  const wash = ctx.createRadialGradient(FIELD.width * 0.5, FIELD.height * 0.42, 40, FIELD.width * 0.5, FIELD.height * 0.5, FIELD.width * 0.72);
  wash.addColorStop(0, '#0a1024');
  wash.addColorStop(0.55, '#070a16');
  wash.addColorStop(1, PALETTE.bg);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // Fine grid, then every fourth line brighter: reads as a circuit board, not graph paper.
  const cell = 40;
  ctx.lineWidth = 1;
  for (let x = 0; x <= FIELD.width; x += cell) {
    ctx.strokeStyle = x % (cell * 4) === 0 ? PALETTE.gridMajor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, FIELD.height);
    ctx.stroke();
  }
  for (let y = 0; y <= FIELD.height; y += cell) {
    ctx.strokeStyle = y % (cell * 4) === 0 ? PALETTE.gridMajor : PALETTE.grid;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(FIELD.width, y + 0.5);
    ctx.stroke();
  }

  // Sparse junction dots where the bright lines cross.
  ctx.fillStyle = 'rgba(34, 230, 255, 0.22)';
  for (let x = 0; x <= FIELD.width; x += cell * 4) {
    for (let y = 0; y <= FIELD.height; y += cell * 4) {
      ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
    }
  }

  // The arena border: a double line with corner brackets.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(ARENA_MARGIN - 18.5, ARENA_MARGIN - 18.5, FIELD.width - (ARENA_MARGIN - 18.5) * 2, FIELD.height - (ARENA_MARGIN - 18.5) * 2);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  const inset = ARENA_MARGIN - 18;
  const bracket = 54;
  ctx.beginPath();
  ctx.moveTo(inset, inset + bracket);
  ctx.lineTo(inset, inset);
  ctx.lineTo(inset + bracket, inset);
  ctx.moveTo(FIELD.width - inset - bracket, inset);
  ctx.lineTo(FIELD.width - inset, inset);
  ctx.lineTo(FIELD.width - inset, inset + bracket);
  ctx.moveTo(inset, FIELD.height - inset - bracket);
  ctx.lineTo(inset, FIELD.height - inset);
  ctx.lineTo(inset + bracket, FIELD.height - inset);
  ctx.moveTo(FIELD.width - inset - bracket, FIELD.height - inset);
  ctx.lineTo(FIELD.width - inset, FIELD.height - inset);
  ctx.lineTo(FIELD.width - inset, FIELD.height - inset - bracket);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Vignette: dark at the corners so the centre of the action always wins the eye.
  const vignette = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.32, FIELD.width / 2, FIELD.height / 2, FIELD.width * 0.78);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.86)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  return canvas;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { scale: 1, offsetX: 0, offsetY: 0 };
  let backdrop = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(window.innerWidth * ratio));
    const height = Math.max(1, Math.round(window.innerHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.offsetX = (width - FIELD.width * view.scale) / 2;
    view.offsetY = (height - FIELD.height * view.scale) / 2;
    // The input layer converts pointer pixels to field units with these factors.
    canvas.__view = { ratioX: FIELD.width / (canvas.clientWidth || 1), ratioY: FIELD.height / (canvas.clientHeight || 1) };
    if (!backdrop) backdrop = buildBackdrop();
  }

  /** Conversion used by the input layer: window pixels to arena coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) * (canvas.width / rect.width) - view.offsetX) / view.scale;
    const y = ((clientY - rect.top) * (canvas.height / rect.height) - view.offsetY) / view.scale;
    return { x, y };
  }

  function withGlow(color, blur, draw) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    draw();
    ctx.restore();
  }

  // ---- entities -------------------------------------------------------------

  function drawDrone(ctx, enemy, now) {
    const r = enemy.radius;
    const pulse = 1 + Math.sin(now * 4 + enemy.wobble) * 0.06;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.atan2(enemy.vy, enemy.vx) + Math.PI / 2);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(r, r * 0.85);
    ctx.lineTo(0, r * 0.4);
    ctx.lineTo(-r, r * 0.85);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 62, 165, 0.16)';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = ENEMY_TYPES.drone.color;
    ctx.shadowColor = ENEMY_TYPES.drone.color;
    ctx.shadowBlur = 22;
    ctx.stroke();
    // White-hot core.
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, Math.max(2, r * 0.2), 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  function drawRunner(ctx, enemy) {
    const r = enemy.radius;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);
    // Two stacked diamonds give it a chevron silhouette at speed.
    const drawDiamond = (scale, alpha) => {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.5 * scale);
      ctx.lineTo(r * 0.78 * scale, 0);
      ctx.lineTo(0, r * 1.5 * scale);
      ctx.lineTo(-r * 0.78 * scale, 0);
      ctx.closePath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ENEMY_TYPES.runner.color;
      ctx.shadowColor = ENEMY_TYPES.runner.color;
      ctx.shadowBlur = 24;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    };
    drawDiamond(1, 1);
    drawDiamond(0.55, 0.55);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.22), 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  function drawTank(ctx, enemy) {
    const r = enemy.radius;
    const hpRatio = enemy.hp / enemy.maxHp;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle * 0.4);
    ctx.beginPath();
    ctx.rect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(160, 107, 255, 0.16)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ENEMY_TYPES.tank.color;
    ctx.shadowColor = ENEMY_TYPES.tank.color;
    ctx.shadowBlur = 26;
    ctx.stroke();
    // Inner cross and a bright core.
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(0, r * 0.55);
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.26, 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.restore();

    // Damage ring around the tank: how much plating is left.
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * hpRatio);
    ctx.strokeStyle = ENEMY_TYPES.tank.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = ENEMY_TYPES.tank.color;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  function drawSpinner(ctx, enemy, now) {
    const r = enemy.radius;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle * 1.7 + now * 1.4);
    // Six-point star: alternating outer and inner vertices.
    ctx.beginPath();
    for (let point = 0; point < 12; point += 1) {
      const radius = point % 2 === 0 ? r * 1.3 : r * 0.55;
      const angle = (point / 12) * TAU - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(77, 255, 158, 0.12)';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ENEMY_TYPES.spinner.color;
    ctx.shadowColor = ENEMY_TYPES.spinner.color;
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2.4, r * 0.24), 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
    // Charge pip: turns bright just before it fires.
    const spec = ENEMY_TYPES.spinner;
    const charge = 1 - Math.min(1, enemy.shootTimer / spec.shootEvery);
    ctx.save();
    ctx.globalAlpha = 0.5 + charge * 0.5;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r + 6, 0, TAU * charge);
    ctx.strokeStyle = ENEMY_TYPES.spinner.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(ctx, enemy, now) {
    if (!enemy.active) return;
    if (enemy.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = enemy.hitFlash * 0.5;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius * 1.8, 0, TAU);
      ctx.fillStyle = PALETTE.white;
      ctx.fill();
      ctx.restore();
    }
    if (enemy.type === 'drone') drawDrone(ctx, enemy, now);
    else if (enemy.type === 'runner') drawRunner(ctx, enemy);
    else if (enemy.type === 'tank') drawTank(ctx, enemy);
    else drawSpinner(ctx, enemy, now);
  }

  function drawBullet(ctx, bullet) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // A tapered streak behind the white head.
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    const stretch = 16;
    const x2 = bullet.x - (bullet.vx / speed) * stretch;
    const y2 = bullet.y - (bullet.vy / speed) * stretch;
    const gradient = ctx.createLinearGradient(bullet.x, bullet.y, x2, y2);
    gradient.addColorStop(0, 'rgba(190, 252, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(34, 230, 255, 0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = bullet.radius * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 22;
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyBullet(ctx, bullet) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
    ctx.fillStyle = ENEMY_TYPES.spinner.color;
    ctx.shadowColor = ENEMY_TYPES.spinner.color;
    ctx.shadowBlur = 26;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.42, 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }

  function drawPowerup(ctx, pickup, now) {
    const spec = POWERUPS[pickup.kind];
    const r = POWERUP.radius;
    const bob = Math.sin(pickup.age * 5) * 3;
    const fade = pickup.life < 3 ? 0.35 + 0.65 * (Math.floor(pickup.life * 4) % 2) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(pickup.x, pickup.y + bob);
    ctx.rotate(now * 1.8);
    // Hexagon capsule.
    ctx.beginPath();
    for (let point = 0; point < 6; point += 1) {
      const angle = (point / 6) * TAU;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 12, 22, 0.85)';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = spec.color;
    ctx.shadowColor = spec.color;
    ctx.shadowBlur = 26;
    ctx.stroke();
    ctx.rotate(-now * 1.8);
    // Letter glyph: S shield, R rapid, + repair.
    const glyph = pickup.kind === 'shield' ? 'S' : pickup.kind === 'rapid' ? 'R' : '+';
    glowText(ctx, glyph, 0, 1, {
      size: 15, family: FONT.display, weight: '900', color: PALETTE.white, glow: spec.color, blur: 12, align: 'center', baseline: 'middle',
    });
    ctx.restore();
  }

  /** The player: an aura, a rotating ring of ticks, and a bright core pointed at the aim. */
  function drawPlayer(ctx, player, now) {
    const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0;
    if (blink) return;
    const r = player.radius;

    // Aura: a soft field that shows even in a still frame.
    ctx.save();
    const aura = ctx.createRadialGradient(player.x, player.y, r * 0.4, player.x, player.y, r * 3.1);
    aura.addColorStop(0, 'rgba(34, 230, 255, 0.34)');
    aura.addColorStop(0.5, 'rgba(34, 230, 255, 0.1)');
    aura.addColorStop(1, 'rgba(34, 230, 255, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 3.1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Rotating ring with tick marks.
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(now * 1.1);
    ctx.strokeStyle = PALETTE.cyan;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.white;
    ctx.lineWidth = 2;
    for (let tick = 0; tick < 4; tick += 1) {
      const angle = (tick / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (r + 4), Math.sin(angle) * (r + 4));
      ctx.lineTo(Math.cos(angle) * (r + 13), Math.sin(angle) * (r + 13));
      ctx.stroke();
    }
    ctx.restore();

    // Shield bubble when the powerup is live.
    if (player.shield > 0) {
      const pulse = 1 + Math.sin(now * 7) * 0.05;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.beginPath();
      ctx.arc(0, 0, (r + 15) * pulse, 0, TAU);
      ctx.strokeStyle = PALETTE.cyan;
      ctx.globalAlpha = player.shield < 1.2 && Math.floor(player.shield * 8) % 2 === 0 ? 0.35 : 0.85;
      ctx.lineWidth = 2;
      ctx.shadowColor = PALETTE.cyan;
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.globalAlpha *= 0.25;
      ctx.fillStyle = PALETTE.cyan;
      ctx.fill();
      ctx.restore();
    }

    // Core: a bright nucleus plus an aim spike.
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(r + 12, 0);
    ctx.lineTo(r * 0.2, 5);
    ctx.lineTo(r * 0.2, -5);
    ctx.closePath();
    ctx.fillStyle = PALETTE.cyan;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 0.78, 0, TAU);
    ctx.fillStyle = PALETTE.cyan;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 0.36, 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
  }

  /** A faint aiming laser from the player toward the cursor, clamped to the arena. */
  function drawAimLine(ctx, player, aim) {
    const dx = aim.x - player.x;
    const dy = aim.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length < 30) return;
    const reach = Math.min(length, 900);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 1;
    ctx.setLineDash([7, 12]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + (dx / length) * reach, player.y + (dy / length) * reach);
    ctx.stroke();
    ctx.restore();
  }

  /** Crosshair at the cursor: four brackets and a dot. */
  function drawCrosshair(ctx, aim, now) {
    if (!aim.inside) return;
    const size = 9 + Math.sin(now * 5) * 1.6;
    ctx.save();
    ctx.translate(aim.x, aim.y);
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-size, -size + 4);
    ctx.lineTo(-size, -size);
    ctx.lineTo(-size + 4, -size);
    ctx.moveTo(size - 4, -size);
    ctx.lineTo(size, -size);
    ctx.lineTo(size, -size + 4);
    ctx.moveTo(-size, size - 4);
    ctx.lineTo(-size, size);
    ctx.lineTo(-size + 4, size);
    ctx.moveTo(size - 4, size);
    ctx.lineTo(size, size);
    ctx.lineTo(size, size - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.fillStyle = PALETTE.white;
    ctx.fill();
    ctx.restore();
  }

  // ---- frame ---------------------------------------------------------------

  /**
   * Paint one frame. `scene` is what main hands over: the world, its effects, the screen, the
   * best score, the clock and (in play) the current aim point.
   */
  function draw(scene) {
    const { state, effects, screen, best, time, aim, particles } = scene;
    if (!backdrop) backdrop = buildBackdrop();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.deep;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shake = effects ? effects.shake : null;
    ctx.save();
    ctx.translate(view.offsetX + (shake ? shake.x * view.scale : 0), view.offsetY + (shake ? shake.y * view.scale : 0));
    ctx.scale(view.scale, view.scale);
    if (shake && shake.roll) {
      ctx.translate(FIELD.width / 2, FIELD.height / 2);
      ctx.rotate(shake.roll);
      ctx.translate(-FIELD.width / 2, -FIELD.height / 2);
    }

    ctx.drawImage(backdrop, 0, 0);

    // A slow sweep of light across the grid, so the arena never looks frozen.
    const sweep = (time * 90) % (FIELD.height + 300) - 150;
    ctx.save();
    ctx.globalAlpha = 0.05;
    const band = ctx.createLinearGradient(0, sweep - 90, 0, sweep + 90);
    band.addColorStop(0, 'rgba(34, 230, 255, 0)');
    band.addColorStop(0.5, 'rgba(34, 230, 255, 0.7)');
    band.addColorStop(1, 'rgba(34, 230, 255, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, sweep - 90, FIELD.width, 180);
    ctx.restore();

    if (screen !== SCREEN.TITLE) {
      // Ground contact glow under the action.
      const floor = ctx.createLinearGradient(0, FIELD.height - 140, 0, FIELD.height);
      floor.addColorStop(0, 'rgba(255, 62, 165, 0)');
      floor.addColorStop(1, 'rgba(255, 62, 165, 0.06)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, FIELD.height - 140, FIELD.width, 140);

      if (particles) particles.draw(ctx);
      for (let index = 0; index < state.pickups.length; index += 1) {
        const pickup = state.pickups[index];
        if (pickup.active) drawPowerup(ctx, pickup, time);
      }
      for (let index = 0; index < state.enemies.length; index += 1) {
        const enemy = state.enemies[index];
        if (enemy.active) drawEnemy(ctx, enemy, time);
      }
      for (let index = 0; index < state.enemyBullets.length; index += 1) {
        const bullet = state.enemyBullets[index];
        if (bullet.active) drawEnemyBullet(ctx, bullet);
      }
      for (let index = 0; index < state.bullets.length; index += 1) {
        const bullet = state.bullets[index];
        if (bullet.active) drawBullet(ctx, bullet);
      }
      drawPlayer(ctx, state.player, time);
      if (screen === SCREEN.PLAY && aim) drawAimLine(ctx, state.player, aim);
      if (screen === SCREEN.PLAY && aim) drawCrosshair(ctx, aim, time);
      drawHud(ctx, state, best, time);
      if (screen === SCREEN.PLAY) drawWaveBanner(ctx, state, time);
    }

    if (screen === SCREEN.TITLE) drawTitleScreen(ctx, best, time);
    else if (screen === SCREEN.PAUSED) drawPauseScreen(ctx, time);
    else if (screen === SCREEN.OVER) drawOverScreen(ctx, state, best, time);

    ctx.restore();

    // A CRT scanline veil over everything, evenly spaced and cheap.
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1);
    ctx.restore();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, toField };
}
