// Keyboard and mouse. The mouse reads as an aim point in arena coordinates (the renderer owns
// the conversion because it owns the scale); held keys give a movement vector; one-shot presses
// (start, restart, pause) are queued as bit flags and consumed once by the loop, so a press
// between two frames is never lost and never counted twice.

export const ACTION_START = 1;
export const ACTION_RESTART = 2;
export const ACTION_PAUSE = 4;
export const ACTION_FIRE = 8;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const START = new Set(['Enter']);
const RESTART = new Set(['KeyR']);
const PAUSE = new Set(['KeyP', 'Escape']);
const FIRE = new Set(['Space']);
const MOVEMENT = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT]);

/**
 * @param canvas  the game canvas
 * @param toField window client coordinates -> arena coordinates (supplied by the renderer)
 */
export function createInput(canvas, toField) {
  const held = new Set();
  let actions = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;
  let holdingFire = false;

  function trackPointer(event) {
    const point = toField(event.clientX, event.clientY);
    pointerX = point.x;
    pointerY = point.y;
    pointerInside = true;
  }

  function onKeyDown(event) {
    if (MOVEMENT.has(event.code) || FIRE.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (START.has(event.code)) actions |= ACTION_START;
    if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    if (FIRE.has(event.code)) {
      actions |= ACTION_FIRE;
      holdingFire = true;
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
    if (FIRE.has(event.code)) holdingFire = false;
  }

  function onPointerMove(event) {
    trackPointer(event);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    trackPointer(event);
    actions |= ACTION_FIRE;
    holdingFire = true;
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (event.button === 0) holdingFire = false;
  }

  // A key released while the window is hidden never sends keyup: let go of everything on blur.
  function onBlur() {
    held.clear();
    holdingFire = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1..1 on each axis, normalised so a diagonal is not faster than a straight line. */
    movement() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      return { x, y };
    },
    /** The aim point in arena coordinates. */
    pointer() {
      return { x: pointerX, y: pointerY, inside: pointerInside };
    },
    /** True while space or the left mouse button is held. */
    firing() {
      return holdingFire;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
