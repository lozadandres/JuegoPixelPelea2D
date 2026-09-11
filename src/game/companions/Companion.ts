import type { CharKey } from '../data';
import type { Fighter } from '../fighters/Fighter';

export type CompanionState = 'entering' | 'following' | 'chasing' | 'attacking' | 'hurt' | 'retreating' | 'defeated';

export interface CompanionHit {
  target: 'companion' | 'fighter';
  damage: number;
  knockback: number;
}

export abstract class Companion {
  state: CompanionState = 'entering';
  x: number;
  y: number;
  facing: 1 | -1;
  hp: number;
  readonly maxHp: number;
  life: number;
  frame = 0;
  frameTimer = 0;
  attackTimer = 0;
  attackHasHit = false;
  hurtTimer = 0;
  private enterTimer = 34;
  readonly owner: 0 | 1;
  readonly char: CharKey;
  readonly speed: number;
  readonly damage: number;
  readonly attackRange: number;

  protected constructor(
    owner: 0 | 1,
    char: CharKey,
    spawnX: number,
    facing: 1 | -1,
    speed: number,
    maxHp: number,
    damage: number,
    attackRange: number,
    life: number,
  ) {
    this.owner = owner;
    this.char = char;
    this.speed = speed;
    this.damage = damage;
    this.attackRange = attackRange;
    this.x = spawnX;
    this.y = 470;
    this.facing = facing;
    this.hp = maxHp;
    this.maxHp = maxHp;
    this.life = life;
  }

  get alive() { return this.state !== 'defeated' && this.hp > 0 && this.life > 0; }

  update(owner: Fighter, enemyFighter: Fighter, enemyCompanion: Companion | null): CompanionHit | null {
    this.animate();
    if (this.state === 'defeated') return null;
    if (this.hurtTimer > 0) {
      this.hurtTimer--;
      this.state = 'hurt';
      if (this.hurtTimer === 0) this.state = 'chasing';
      return null;
    }
    if (owner.anim === 'ko') this.life = Math.min(this.life, 45);
    this.life--;
    if (this.life <= 0) {
      this.state = 'retreating';
      this.x -= this.facing * this.speed * 1.5;
      if (this.x < -90 || this.x > 1490) this.state = 'defeated';
      return null;
    }
    if (this.state === 'entering') {
      this.enterTimer--;
      this.x += this.facing * this.speed * 1.35;
      if (this.enterTimer <= 0) this.state = 'following';
      return null;
    }

    const targetCompanion = enemyCompanion?.alive ? enemyCompanion : null;
    const targetX = targetCompanion?.x ?? enemyFighter.x;
    const distance = Math.abs(targetX - this.x);
    this.facing = targetX >= this.x ? 1 : -1;

    if (this.state === 'attacking') {
      this.attackTimer++;
      if (!this.attackHasHit && this.attackTimer >= 9) {
        this.attackHasHit = true;
        if (distance <= this.attackRange + 26) {
          return { target: targetCompanion ? 'companion' : 'fighter', damage: this.damage, knockback: this.knockback() };
        }
      }
      if (this.attackTimer >= 24) {
        this.attackTimer = 0;
        this.attackHasHit = false;
        this.state = 'chasing';
      }
      return null;
    }

    if (distance <= this.attackRange) {
      this.state = 'attacking';
      this.attackTimer = 0;
      this.attackHasHit = false;
    } else {
      this.state = distance > 105 ? 'chasing' : 'following';
      this.x += Math.sign(targetX - this.x) * this.speed;
      // Sin rival auxiliar, evita ocupar exactamente el cuerpo del luchador.
      if (!targetCompanion && Math.abs(enemyFighter.x - this.x) < 54) this.x -= this.facing * 3;
    }
    this.x = Math.max(-80, Math.min(1480, this.x));
    return null;
  }

  receiveHit(damage: number, direction: 1 | -1, knockback: number) {
    if (!this.alive || this.state === 'entering') return;
    this.hp = Math.max(0, this.hp - damage);
    this.x += direction * knockback * 5;
    this.hurtTimer = 16;
    this.state = this.hp <= 0 ? 'defeated' : 'hurt';
  }

  protected knockback() { return 2.4; }

  spriteAnimation() {
    // Kenji cuenta con un asistente ninja propio. Conserva el mismo contrato de
    // animaciones que el resto de los acompañantes, pero usa sus hojas exclusivas.
    if (this.char === 'kenji') {
      if (this.state === 'entering') return 'enter';
      if (this.state === 'attacking') return 'attack';
      if (this.state === 'hurt') return 'hurt';
      if (this.state === 'defeated') return 'ko';
      if (this.state === 'retreating') return 'vanish';
      return this.state === 'following' ? 'idle' : 'walk';
    }
    if (this.state === 'attacking') return 'punch';
    if (this.state === 'hurt') return 'hurt';
    if (this.state === 'defeated' || this.state === 'retreating') return 'ko';
    return this.state === 'following' ? 'idle' : 'walk';
  }

  private animate() {
    this.frameTimer++;
    if (this.frameTimer < 7) return;
    this.frameTimer = 0;
    const anim = this.spriteAnimation();
    const count = this.char === 'kenji'
      ? (( { idle: 2, walk: 6, attack: 5, hurt: 3, ko: 5, enter: 5, vanish: 4 } as Record<string, number> )[anim] ?? 4)
      : anim === 'punch' || anim === 'ko' ? 3 : anim === 'hurt' ? 2 : 4;
    this.frame = (this.frame + 1) % count;
  }
}

class AggressiveCompanion extends Companion {
  constructor(owner: 0 | 1, char: CharKey, x: number, facing: 1 | -1) {
    super(owner, char, x, facing, 4.2, 30, 5, 70, 520);
  }
}

class GuardianCompanion extends Companion {
  constructor(owner: 0 | 1, char: CharKey, x: number, facing: 1 | -1) {
    super(owner, char, x, facing, 2.8, 44, 6, 76, 600);
  }
  protected knockback() { return 4.2; }
}

class ControlCompanion extends Companion {
  constructor(owner: 0 | 1, char: CharKey, x: number, facing: 1 | -1) {
    super(owner, char, x, facing, 3.4, 26, 4, 126, 540);
  }
}

class StrikerCompanion extends Companion {
  constructor(owner: 0 | 1, char: CharKey, x: number, facing: 1 | -1) {
    super(owner, char, x, facing, 5.4, 25, 5, 78, 430);
  }
}

export class CompanionFactory {
  static create(owner: 0 | 1, char: CharKey, spawnX: number, facing: 1 | -1): Companion {
    if (char === 'bruno') return new GuardianCompanion(owner, char, spawnX, facing);
    if (char === 'luna') return new ControlCompanion(owner, char, spawnX, facing);
    if (char === 'rayo') return new StrikerCompanion(owner, char, spawnX, facing);
    return new AggressiveCompanion(owner, char, spawnX, facing);
  }
}
