// Entrada de teclado y táctil
import { emptyInput } from './engine';
import type { InputState } from './engine';

const P1_KEYS: Record<string, keyof InputState> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  KeyJ: 'punch', KeyK: 'kick', KeyL: 'special',
  KeyQ: 'evade',
};
const P2_KEYS: Record<string, keyof InputState> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Comma: 'punch', Period: 'kick', Slash: 'special',
  ShiftRight: 'evade',
};

export class InputManager {
  private held1 = new Set<keyof InputState>();
  private held2 = new Set<keyof InputState>();
  private edge1 = new Set<keyof InputState>();
  private edge2 = new Set<keyof InputState>();
  touch = emptyInput();
  private touchEdge = new Set<keyof InputState>();
  onPause: () => void = () => {};

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }
  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { this.onPause(); return; }
    const k1 = P1_KEYS[e.code], k2 = P2_KEYS[e.code];
    if (k1) { if (!e.repeat) this.edge1.add(k1); this.held1.add(k1); e.preventDefault(); }
    if (k2) { if (!e.repeat) this.edge2.add(k2); this.held2.add(k2); e.preventDefault(); }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k1 = P1_KEYS[e.code], k2 = P2_KEYS[e.code];
    if (k1) this.held1.delete(k1);
    if (k2) this.held2.delete(k2);
  };

  touchPress(btn: keyof InputState) { this.touch[btn] = true; this.touchEdge.add(btn); }
  touchRelease(btn: keyof InputState) { this.touch[btn] = false; }

  snapshot1(): InputState {
    const s = emptyInput();
    for (const k of this.held1) s[k] = true;
    for (const k of this.edge1) s[k] = true;
    for (const k of this.touchEdge) s[k] = true;
    if (this.touch.left) s.left = true;
    if (this.touch.right) s.right = true;
    if (this.touch.up) s.up = true;
    if (this.touch.down) s.down = true;
    this.edge1.clear();
    this.touchEdge.clear();
    this.touch.up = false; // salto como pulsación
    return s;
  }
  snapshot2(): InputState {
    const s = emptyInput();
    for (const k of this.held2) s[k] = true;
    for (const k of this.edge2) s[k] = true;
    this.edge2.clear();
    return s;
  }
}
