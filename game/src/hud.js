// Everything that is type on screen: the in-game HUD and the three full-screen states (title,
// pause, game over). Drawing primitives shared with render.js live here too (glow text, rounded
// neon panels), so the renderer can import them in one direction and nothing imports back.

import { COMBO, FIELD, FONT, PALETTE, PLAYER, POWERUPS } from './config.js';

const TAU = Math.PI * 2;

export function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Text with an outer glow: the workhorse for every label in the game. */
export function glowText(ctx, value, x, y, options = {}) {
  const {
    size = 24,
    family = FONT.body,
    weight = '700',
    color = PALETTE.white,
    glow = color,
    blur = 18,
    align = 'left',
    baseline = 'alphabetic',
    alpha = 1,
  } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** A title with a cyan/magenta chromatic split behind a white core. */
export function splitTitle(ctx, value, x, y, size, time) {
  const jitter = Math.sin(time * 2.1) * 1.6;
  ctx.save();
  ctx.font = `900 ${size}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = PALETTE.magenta;
  ctx.fillText(value, x - 5 - jitter, y);
  ctx.fillStyle = PALETTE.cyan;
  ctx.fillText(value, x + 5 + jitter, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 42;
  ctx.fillStyle = PALETTE.white;
  ctx.fillText(value, x, y);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function neonPanel(ctx, x, y, width, height, color, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  roundedPath(ctx, x, y, width, height, 14);
  ctx.fillStyle = PALETTE.panel;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Corner ticks give the panel an engineered, cut-out feel.
  const tick = 16;
  ctx.strokeStyle = PALETTE.white;
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 12 + tick);
  ctx.lineTo(x + 12, y + 12);
  ctx.lineTo(x + 12 + tick, y + 12);
  ctx.moveTo(x + width - 12 - tick, y + 12);
  ctx.lineTo(x + width - 12, y + 12);
  ctx.lineTo(x + width - 12, y + 12 + tick);
  ctx.moveTo(x + 12, y + height - 12 - tick);
  ctx.lineTo(x + 12, y + height - 12);
  ctx.lineTo(x + 12 + tick, y + height - 12);
  ctx.moveTo(x + width - 12 - tick, y + height - 12);
  ctx.lineTo(x + width - 12, y + height - 12);
  ctx.lineTo(x + width - 12, y + height - 12 - tick);
  ctx.stroke();
  ctx.restore();
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Small diamond used as a life pip: bright when alive, hollow when spent. */
function drawLifePip(ctx, x, y, size, alive, index) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.rect(-size / 2, -size / 2, size, size);
  if (alive) {
    ctx.fillStyle = PALETTE.cyan;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.fillStyle = PALETTE.white;
  } else {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(130, 160, 190, 0.35)';
    ctx.stroke();
  }
  ctx.restore();
  if (alive) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  void index;
}

/** The in-game HUD: score, wave, lives, combo and active powerups. */
export function drawHud(ctx, state, best, time) {
  const player = state.player;

  // --- top-left: score -----------------------------------------------------
  ctx.save();
  glowText(ctx, 'SCORE', 34, 40, { size: 13, family: FONT.mono, color: PALETTE.cyan, blur: 10, weight: '700' });
  glowText(ctx, String(state.score).padStart(6, '0'), 33, 82, {
    size: 44, family: FONT.display, weight: '900', color: PALETTE.white, glow: PALETTE.cyan, blur: 26,
  });
  glowText(ctx, `BEST ${String(best).padStart(6, '0')}`, 35, 106, {
    size: 12, family: FONT.mono, color: PALETTE.muted, glow: PALETTE.cyan, blur: 0, alpha: 0.9,
  });
  ctx.restore();

  // --- top-right: wave -----------------------------------------------------
  const right = FIELD.width - 34;
  ctx.save();
  glowText(ctx, 'WAVE', right, 40, { size: 13, family: FONT.mono, color: PALETTE.magenta, blur: 10, align: 'right' });
  glowText(ctx, pad2(state.wave), right, 84, {
    size: 46, family: FONT.display, weight: '900', color: PALETTE.white, glow: PALETTE.magenta, blur: 26, align: 'right',
  });
  const hostiles = state.alive + state.spawnQueue.length - state.spawnIndex;
  glowText(ctx, `HOSTILES ${pad2(Math.max(0, hostiles))}`, right, 108, {
    size: 12, family: FONT.mono, color: PALETTE.muted, blur: 0, align: 'right',
  });
  ctx.restore();

  // --- bottom-left: lives --------------------------------------------------
  const baseY = FIELD.height - 40;
  ctx.save();
  glowText(ctx, 'LIVES', 34, baseY - 30, { size: 12, family: FONT.mono, color: PALETTE.muted, blur: 0 });
  for (let index = 0; index < PLAYER.maxLives; index += 1) {
    drawLifePip(ctx, 46 + index * 30, baseY, 17, index < player.lives, index);
  }
  ctx.restore();

  // --- bottom-centre: combo -------------------------------------------------
  const barWidth = 280;
  const barX = (FIELD.width - barWidth) / 2;
  const barY = FIELD.height - 46;
  const tier = state.combo.multiplier;
  const tierColor = tier >= 6 ? PALETTE.magenta : tier >= 3 ? PALETTE.yellow : PALETTE.cyan;
  const ratio = state.combo.timer / COMBO.window;
  ctx.save();
  glowText(ctx, 'COMBO', barX, barY - 12, { size: 12, family: FONT.mono, color: PALETTE.muted, blur: 0 });
  glowText(ctx, `x${tier}`, barX + barWidth, barY - 10, {
    size: 26, family: FONT.display, weight: '900', align: 'right', color: tierColor, glow: tierColor, blur: 18,
  });
  roundedPath(ctx, barX, barY, barWidth, 8, 4);
  ctx.fillStyle = 'rgba(120, 160, 200, 0.16)';
  ctx.fill();
  if (ratio > 0) {
    const width = Math.max(6, barWidth * ratio);
    ctx.save();
    roundedPath(ctx, barX, barY, width, 8, 4);
    ctx.fillStyle = tierColor;
    ctx.shadowColor = tierColor;
    ctx.shadowBlur = 16 + Math.sin(time * 8) * 4;
    ctx.fill();
    ctx.restore();
  }
  // Tier pips: a row of tiny ticks marking the multiplier ladder.
  for (let index = 1; index <= COMBO.max; index += 1) {
    const x = barX + (barWidth / COMBO.max) * index - barWidth / COMBO.max / 2;
    ctx.globalAlpha = index <= tier ? 0.9 : 0.22;
    ctx.fillStyle = index <= tier ? tierColor : PALETTE.muted;
    ctx.fillRect(x - 1, barY + 14, 2, 6);
  }
  ctx.restore();

  // --- bottom-right: active powerups ---------------------------------------
  const powerups = [];
  if (player.shield > 0) powerups.push(['shield', player.shield, POWERUPS.shield.duration]);
  if (player.rapid > 0) powerups.push(['rapid', player.rapid, POWERUPS.rapid.duration]);
  const slotY = FIELD.height - 56;
  for (let index = 0; index < powerups.length; index += 1) {
    const [kind, remaining, total] = powerups[index];
    const spec = POWERUPS[kind];
    const rowY = slotY - index * 30;
    const width = 150;
    const x = FIELD.width - 34 - width;
    ctx.save();
    roundedPath(ctx, x, rowY - 12, width, 20, 6);
    ctx.fillStyle = 'rgba(10, 20, 36, 0.7)';
    ctx.fill();
    ctx.strokeStyle = spec.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    roundedPath(ctx, x, rowY - 12, Math.max(4, width * (remaining / total)), 20, 6);
    ctx.fillStyle = spec.color;
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    glowText(ctx, spec.label, x + 10, rowY + 3, { size: 11, family: FONT.mono, color: spec.color, glow: spec.color, blur: 8, baseline: 'middle' });
    glowText(ctx, `${remaining.toFixed(1)}s`, x + width - 10, rowY + 3, {
      size: 11, family: FONT.mono, color: PALETTE.white, blur: 0, align: 'right', baseline: 'middle',
    });
    ctx.restore();
  }
}

/** The "WAVE n" banner that drops in at the start of a wave. */
export function drawWaveBanner(ctx, state, time) {
  if (state.bannerTimer <= 0) return;
  const duration = 2.1;
  const progress = 1 - state.bannerTimer / duration;
  const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.72 ? Math.max(0, (1 - progress) / 0.28) : 1;
  const slide = (1 - Math.min(1, progress / 0.25)) * 26;
  const y = FIELD.height * 0.36 - slide;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  glowText(ctx, `WAVE ${pad2(state.wave)}`, FIELD.width / 2, y, {
    size: 84, family: FONT.display, weight: '900', color: PALETTE.white, glow: PALETTE.cyan, blur: 40, align: 'center',
  });
  const width = 300 + Math.sin(time * 6) * 12;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FIELD.width / 2 - width, y + 26);
  ctx.lineTo(FIELD.width / 2 - 90, y + 26);
  ctx.moveTo(FIELD.width / 2 + 90, y + 26);
  ctx.lineTo(FIELD.width / 2 + width, y + 26);
  ctx.stroke();
  glowText(ctx, state.wave === 1 ? 'STAY ALIVE' : 'INCOMING SIGNAL', FIELD.width / 2, y + 56, {
    size: 15, family: FONT.mono, color: PALETTE.magenta, glow: PALETTE.magenta, blur: 14, align: 'center',
  });
  ctx.restore();
}

/** Blinking "PRESS …" prompt: on for the first 70% of each cycle. */
export function drawPrompt(ctx, value, x, y, time, color = PALETTE.yellow) {
  const phase = (time % 1.2) / 1.2;
  const alpha = phase < 0.65 ? 1 : 0.22;
  glowText(ctx, value, x, y, {
    size: 22, family: FONT.mono, weight: '700', color, glow: color, blur: 16, align: 'center', alpha,
  });
}

function drawControlsPanel(ctx, x, y, width, time) {
  const rows = [
    ['WASD / ARROWS', 'MOVE'],
    ['MOUSE', 'AIM'],
    ['CLICK / SPACE', 'FIRE'],
    ['P / ESC', 'PAUSE'],
    ['R', 'RESTART'],
  ];
  const height = 40 + rows.length * 30;
  neonPanel(ctx, x, y, width, height, PALETTE.cyan, 0.72);
  rows.forEach(([key, action], index) => {
    const rowY = y + 34 + index * 30;
    glowText(ctx, key, x + 30, rowY, { size: 15, family: FONT.mono, color: PALETTE.white, blur: 0 });
    glowText(ctx, action, x + width - 30, rowY, { size: 12, family: FONT.mono, color: PALETTE.cyan, blur: 8, align: 'right', alpha: 0.9 });
  });
  // A slow scanning line so the panel feels alive in a still screenshot.
  const scan = (time * 70) % height;
  ctx.save();
  ctx.globalAlpha = 0.16;
  const gradient = ctx.createLinearGradient(0, y + scan - 18, 0, y + scan);
  gradient.addColorStop(0, 'rgba(34, 230, 255, 0)');
  gradient.addColorStop(1, 'rgba(34, 230, 255, 0.9)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x + 2, y + scan - 18, width - 4, 18);
  ctx.restore();
}

/** TITLE: name, subtitle, prompt, controls and credits over the animated backdrop. */
export function drawTitleScreen(ctx, best, time) {
  const centerX = FIELD.width / 2;

  glowText(ctx, 'NEON ARENA SURVIVAL', centerX, 132, {
    size: 15, family: FONT.mono, color: PALETTE.magenta, glow: PALETTE.magenta, blur: 16, align: 'center',
  });
  splitTitle(ctx, 'CIRCUIT BREAK', centerX, 218, 96, time);

  // A hairline rule with a diamond in the middle.
  ctx.save();
  ctx.strokeStyle = PALETTE.cyan;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(centerX - 300, 276);
  ctx.lineTo(centerX - 16, 276);
  ctx.moveTo(centerX + 16, 276);
  ctx.lineTo(centerX + 300, 276);
  ctx.stroke();
  ctx.translate(centerX, 276);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = PALETTE.cyan;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 16;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();

  glowText(ctx, 'SURVIVE THE GRID. BREAK THE CIRCUIT.', centerX, 318, {
    size: 20, family: FONT.body, weight: '600', color: PALETTE.white, glow: PALETTE.cyan, blur: 14, align: 'center', alpha: 0.9,
  });

  drawPrompt(ctx, 'PRESS ENTER TO START', centerX, 388, time);

  drawControlsPanel(ctx, centerX - 190, 430, 380, time);

  glowText(ctx, `PERSONAL BEST  ${String(best).padStart(6, '0')}`, centerX, 660, {
    size: 13, family: FONT.mono, color: PALETTE.yellow, glow: PALETTE.yellow, blur: 12, align: 'center',
  });
  glowText(ctx, 'PROCEDURAL ART · WEBAUDIO SYNTH · NO ASSETS · NO NETWORK', centerX, 688, {
    size: 11, family: FONT.mono, color: PALETTE.muted, blur: 0, align: 'center', alpha: 0.75,
  });
  glowText(ctx, 'A CIRCUIT BREAK PRODUCTION FOR MAKE.FUN', centerX, 706, {
    size: 10, family: FONT.mono, color: PALETTE.muted, blur: 0, align: 'center', alpha: 0.5,
  });
}

/** OVER: the breach report with score, best and run statistics. */
export function drawOverScreen(ctx, state, best, time) {
  const centerX = FIELD.width / 2;
  const panelWidth = 720;
  const panelHeight = 500;
  const panelX = centerX - panelWidth / 2;
  const panelY = 112;

  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 12, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.restore();

  neonPanel(ctx, panelX, panelY, panelWidth, panelHeight, PALETTE.magenta, 0.95);

  splitTitle(ctx, 'SYSTEM BREACH', centerX, panelY + 82, 62, time);
  glowText(ctx, 'SIGNAL LOST · ARENA COMPROMISED', centerX, panelY + 124, {
    size: 13, family: FONT.mono, color: PALETTE.magenta, glow: PALETTE.magenta, blur: 12, align: 'center', alpha: 0.9,
  });

  glowText(ctx, 'FINAL SCORE', centerX, panelY + 168, {
    size: 12, family: FONT.mono, color: PALETTE.muted, blur: 0, align: 'center',
  });
  glowText(ctx, String(state.score).padStart(6, '0'), centerX, panelY + 234, {
    size: 76, family: FONT.display, weight: '900', color: PALETTE.white, glow: PALETTE.cyan, blur: 40, align: 'center',
  });

  const isRecord = state.score >= best && state.score > 0;
  glowText(ctx, isRecord ? 'NEW PERSONAL BEST' : `PERSONAL BEST  ${String(best).padStart(6, '0')}`, centerX, panelY + 270, {
    size: 15, family: FONT.mono, weight: '700', color: PALETTE.yellow, glow: PALETTE.yellow, blur: 14, align: 'center',
    alpha: isRecord && Math.floor(time * 3) % 2 === 0 ? 0.5 : 1,
  });

  const stats = [
    ['WAVE REACHED', pad2(state.wave)],
    ['ENEMIES DESTROYED', String(state.stats.kills)],
    ['BEST COMBO', `x${state.stats.bestCombo}`],
    ['TIME SURVIVED', formatTime(state.stats.time)],
  ];
  const gridY = panelY + 306;
  stats.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = panelX + 60 + column * (panelWidth - 120) / 2;
    const cellY = gridY + row * 62;
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cellX, cellY - 24);
    ctx.lineTo(cellX + (panelWidth - 120) / 2 - 24, cellY - 24);
    ctx.stroke();
    ctx.restore();
    glowText(ctx, label, cellX, cellY, { size: 11, family: FONT.mono, color: PALETTE.muted, blur: 0 });
    glowText(ctx, value, cellX, cellY + 28, { size: 26, family: FONT.display, weight: '900', color: PALETTE.white, glow: PALETTE.cyan, blur: 16 });
  });

  drawPrompt(ctx, 'PRESS R TO RESTART', centerX, panelY + panelHeight - 44, time, PALETTE.green);
}

/** PAUSE: a seemingly simple overlay that still shows the frozen run underneath. */
export function drawPauseScreen(ctx, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 12, 0.66)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.restore();

  const width = 520;
  const height = 220;
  const x = (FIELD.width - width) / 2;
  const y = (FIELD.height - height) / 2;
  neonPanel(ctx, x, y, width, height, PALETTE.cyan, 0.95);

  splitTitle(ctx, 'PAUSED', FIELD.width / 2, y + 84, 64, time);
  glowText(ctx, 'THE GRID HOLDS ITS BREATH', FIELD.width / 2, y + 128, {
    size: 12, family: FONT.mono, color: PALETTE.muted, blur: 0, align: 'center',
  });
  drawPrompt(ctx, 'PRESS P TO RESUME', FIELD.width / 2, y + 180, time, PALETTE.cyan);
}
