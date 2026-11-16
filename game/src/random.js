// A small seeded random number generator (mulberry32). The same seed produces the same stream,
// which is what makes every ?shot= scene repeatable frame for frame.

export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn an arbitrary number into a well-mixed 32-bit seed (0 stays usable). */
export function mixSeed(seed) {
  let h = (seed >>> 0) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
