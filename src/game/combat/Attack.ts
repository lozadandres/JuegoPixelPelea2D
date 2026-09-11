import { MOVES } from '../data';
import type { MoveDef, MoveName } from '../data';

export abstract class Attack {
  frame = 0;
  timer = 0;
  hasHit = false;
  empowered = false;

  readonly name: MoveName;
  readonly definition: MoveDef;

  protected constructor(name: MoveName, definition: MoveDef) {
    this.name = name;
    this.definition = definition;
  }

  get finished() { return this.frame >= this.definition.dur.length; }

  advance() {
    this.timer++;
    if (this.timer >= this.definition.dur[this.frame]) {
      this.timer = 0;
      this.frame++;
    }
  }
}

export class PunchAttack extends Attack {
  constructor() { super('punch', MOVES.punch); }
}

export class KickAttack extends Attack {
  constructor() { super('kick', MOVES.kick); }
}

export class SpecialAttack extends Attack {
  constructor() { super('special', MOVES.special); }
}

export class AttackFactory {
  static create(name: MoveName): Attack {
    if (name === 'punch') return new PunchAttack();
    if (name === 'kick') return new KickAttack();
    return new SpecialAttack();
  }
}
