import type { Fighter } from '../fighters/Fighter';
import type { InputState } from '../engine';

export interface FighterController {
  update(me: Fighter, foe: Fighter, incomingProjectile: boolean): InputState;
}

export class HumanController implements FighterController {
  private input: () => InputState;
  constructor(input: () => InputState) { this.input = input; }
  update() { return this.input(); }
}
