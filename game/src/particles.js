// Particles, expanding rings and screen shake. Everything cosmetic is driven by a seeded stream
// so a screenshot scene is byte-for-byte repeatable. The pool is allocated once at boot; after
// that the system only writes into fixed slots, never allocating during play.

const MAX_PARTICLES = 1400;
const MAX_RINGS = 32;
const MAX_TRAILS = 900;

/** A particle's behaviour: a spark flies and fades, a shard spins, a trail dot just fades. */
export const PARTICLE_SPARK = 0;
export const PARTICLE_SHARD = 1;
export const PARTICLE_TRAIL = 2;

export function createParticles(random) {
  const particles = new Array(MAX_PARTICLES);
  for (let index = 0; index < MAX_PARTICLES; index += 1) {
    particles[index] = { active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, drag: 1, spin: 0, angle: 0, color: '#fff' };
  }
  const rings = new Array(MAX_RINGS);
  for (let index = 0; index < MAX_RINGS; index += 1) {
    rings[index] = { active: false, x: 0, y: 0, life: 0, maxLife: 1, from: 0, to: 1, width: 2, color: '#fff' };
  }
  let cursor = 0;
  let ringCursor = 0;
  let trailCount = 0;

  function takeParticle() {
    // Walk the ring buffer; if every slot is busy, recycle the oldest.
    for (let tries = 0; tries < MAX_PARTICLES; tries += 1) {
      const slot = particles[cursor];
      cursor = (cursor + 1) % MAX_PARTICLES;
      if (!slot.active) return slot;
    }
    return particles[cursor];
  }

  function spawn(kind, x, y, vx, vy, life, size, color, drag) {
    const p = takeParticle();
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
    p.angle = random() * Math.PI * 2;
    p.spin = (random() - 0.5) * 8;
    return p;
  }

  /** Kill burst: a bright core, a spray of sparks and a handful of tumbling shards. */
  function burst(x, y, color, count, speed) {
    const core = spawn(PARTICLE_SPARK, x, y, 0, 0, 0.24, 13, '#ffffff', 1);
    core.size = 13;
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const power = speed * (0.28 + random() * 0.9);
      const life = 0.35 + random() * 0.55;
      if (index % 4 === 0) {
        spawn(PARTICLE_SHARD, x, y, Math.cos(angle) * power * 0.7, Math.sin(angle) * power * 0.7, life * 1.25, 2.2 + random() * 3.2, color, 0.9);
      } else {
        spawn(PARTICLE_SPARK, x, y, Math.cos(angle) * power, Math.sin(angle) * power, life, 1.1 + random() * 2.4, index % 3 === 0 ? '#ffffff' : color, 0.86);
      }
    }
  }

  /** A shower for a pickup: upward, slower, all white at the core. */
  function sparkle(x, y, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + (random() - 0.5) * 2.4;
      const power = 60 + random() * 170;
      spawn(PARTICLE_SPARK, x, y, Math.cos(angle) * power, Math.sin(angle) * power, 0.35 + random() * 0.4, 1.2 + random() * 2.2, color, 0.9);
    }
  }

  /** One fading dot behind a bullet; capped so a long run cannot grow the pool. */
  function trail(x, y, color, size) {
    if (trailCount > MAX_TRAILS) return;
    trailCount += 1;
    spawn(PARTICLE_TRAIL, x, y, (random() - 0.5) * 12, (random() - 0.5) * 12, 0.2 + random() * 0.12, size, color, 1);
  }

  /** An expanding ring shockwave (drawn by the renderer, not a filled circle). */
  function ring(x, y, color, from, to, life, width) {
    const slot = rings[ringCursor];
    ringCursor = (ringCursor + 1) % MAX_RINGS;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.color = color;
    slot.from = from;
    slot.to = to;
    slot.life = life;
    slot.maxLife = life;
    slot.width = width;
  }

  function update(dt) {
    trailCount = 0;
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      const p = particles[index];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const damping = Math.pow(p.drag, dt * 60);
      p.vx *= damping;
      p.vy *= damping;
      if (p.kind === PARTICLE_SPARK) p.vy += 24 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
    for (let index = 0; index < MAX_RINGS; index += 1) {
      const ring = rings[index];
      if (!ring.active) continue;
      ring.life -= dt;
      if (ring.life <= 0) ring.active = false;
    }
  }

  function draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      const p = particles[index];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      if (p.kind === PARTICLE_TRAIL) {
        ctx.globalAlpha = t * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      if (p.kind === PARTICLE_SHARD) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    for (let index = 0; index < MAX_RINGS; index += 1) {
      const ring = rings[index];
      if (!ring.active) continue;
      const t = 1 - ring.life / ring.maxLife;
      const radius = ring.from + (ring.to - ring.from) * (1 - Math.pow(1 - t, 2.2));
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(0.6, ring.width * (1 - t));
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function clear() {
    for (let index = 0; index < MAX_PARTICLES; index += 1) particles[index].active = false;
    for (let index = 0; index < MAX_RINGS; index += 1) rings[index].active = false;
    trailCount = 0;
  }

  return { burst, sparkle, trail, ring, update, draw, clear };
}

/**
 * Screen shake: trauma decays linearly and the offset is trauma squared, so small hits are a
 * nudge and the big ones read as a hit without ever moving the world far enough to be unfair.
 */
export function createShake(random) {
  let trauma = 0;
  let x = 0;
  let y = 0;
  let roll = 0;

  function add(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function update(dt) {
    trauma = Math.max(0, trauma - dt * 1.7);
    const power = trauma * trauma;
    const amp = 26 * power;
    x = (random() * 2 - 1) * amp;
    y = (random() * 2 - 1) * amp;
    roll = (random() * 2 - 1) * 0.035 * power;
  }

  return {
    add,
    update,
    reset() {
      trauma = 0;
      x = 0;
      y = 0;
      roll = 0;
    },
    get trauma() {
      return trauma;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get roll() {
      return roll;
    },
  };
}
