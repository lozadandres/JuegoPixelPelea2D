import { Animator } from '../animation/Animator';
import type { AnimationName } from '../animation/Animator';
import { AttackFactory } from '../combat/Attack';
import type { Attack } from '../combat/Attack';
import { GROUND_Y, HURTBOX } from '../data';
import type { CharKey, MoveName } from '../data';
import type { FighterState } from './FighterState';
import { AttackingState, STATES } from './FighterState';

export interface SpecialPowerProfile {
  name: string;
  behavior: 'burn' | 'freeze' | 'seismic' | 'dash';
  speed: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  width: number;
  height: number;
  yOffset: number;
  life: number;
}

export interface FighterStats {
  maxHp: number;
  walkSpeed: number;
  jumpPower: number;
  damage: number;
  defense: number;
  reach: number;
  specialCost: number;
}

export abstract class Fighter {
  readonly char: CharKey;
  readonly displayName: string;
  readonly stats: FighterStats;
  x: number;
  y: number;
  facing: 1 | -1;
  vx = 0;
  vy = 0;
  hp = 100;
  hpShown = 100;
  meter = 0;
  empoweredSpecial = false;
  onGround = true;
  blocking = false;
  blockLevel: 'high' | 'low' | null = null;
  guard = 100;
  guardBreakTimer = 0;
  parryWindow = 0;
  parryFlash = 0;
  evadeTimer = 0;
  queuedAttack: MoveName | null = null;
  comboStep = 0;
  comboWindow = 0;
  comboHistory: MoveName[] = [];
  attackContext: 'normal' | 'low' | 'air' = 'normal';
  landingCancelTimer = 0;
  attack: Attack | null = null;
  hitstun = 0;
  blockstun = 0;
  wins = 0;
  koBounced = false;
  burnTimer = 0;
  burnTick = 0;
  slowTimer = 0;
  chillStacks = 0;
  chillWindow = 0;
  frozenTimer = 0;
  dashTimer = 0;
  dashDirection: 1 | -1 = 1;
  dashHasHit = false;
  counterHitVulnerable = false;
  parryTurboTimer = 0;
  lastDirectionTap: 'left' | 'right' | null = null;
  lastDirectionTime = 0;
  readonly animator = new Animator();
  state: FighterState = STATES.idle;

  protected constructor(
    char: CharKey, displayName: string, x: number, y: number, facing: 1 | -1,
    stats: FighterStats,
  ) {
    this.char = char; this.displayName = displayName;
    this.stats = stats;
    this.hp = stats.maxHp; this.hpShown = stats.maxHp;
    this.x = x; this.y = y; this.facing = facing;
  }

  get anim() { return this.animator.name; }
  set anim(value: AnimationName) { this.animator.play(value); }
  get animFrame() { return this.animator.frame; }
  set animFrame(value: number) { this.animator.frame = value; }
  get animTimer() { return this.animator.timer; }
  set animTimer(value: number) { this.animator.timer = value; }

  get actionable() {
    return !this.attack && this.hitstun <= 0 && this.blockstun <= 0
      && this.frozenTimer <= 0 && this.guardBreakTimer <= 0
      && this.evadeTimer <= 0 && this.anim !== 'ko' && this.dashTimer <= 0;
  }

  transitionTo(state: FighterState) {
    if (this.anim === 'ko' && state !== STATES.ko) return;
    this.state = state;
    state.enter(this);
  }

  walk(direction: -1 | 1, speed: number) {
    this.vx = direction * speed;
    if (this.onGround) this.transitionTo(STATES.walk);
  }

  crouch() {
    this.blocking = false;
    this.vx *= 0.6;
    this.transitionTo(STATES.crouch);
  }

  block(level: 'high' | 'low' = 'low', fresh = true) {
    if (fresh) this.parryWindow = 7;
    this.blocking = true;
    this.blockLevel = level;
    this.vx *= 0.6;
    this.transitionTo(STATES.block);
  }

  jump(velocity: number) {
    if (!this.onGround) return;
    this.vy = velocity;
    this.onGround = false;
    this.transitionTo(STATES.jump);
  }

  startAttack(name: MoveName, context: 'normal' | 'low' | 'air' = 'normal') {
    const empowered = name === 'special' && this.meter >= 150;
    if (name === 'special') this.meter -= empowered ? 150 : this.stats.specialCost;
    this.attack = AttackFactory.create(name);
    this.attack.empowered = empowered;
    this.empoweredSpecial = empowered;
    this.attackContext = context;
    this.queuedAttack = null;
    this.blocking = false;
    this.counterHitVulnerable = true;
    this.transitionTo(new AttackingState(name));
  }

  receiveHit(hitstun: number, vx: number, vy = 0) {
    this.attack = null;
    this.queuedAttack = null;
    this.comboStep = 0;
    this.comboHistory = [];
    this.blocking = false;
    this.blockLevel = null;
    this.counterHitVulnerable = false;
    this.hitstun = hitstun;
    this.vx = vx;
    if (vy) { this.vy = vy; this.onGround = false; }
    this.transitionTo(STATES.hurt);
  }

  knockOut(vx: number) {
    this.attack = null;
    this.blocking = false;
    this.hitstun = 0;
    this.vx = vx;
    this.vy = -8;
    this.onGround = false;
    this.koBounced = false;
    this.counterHitVulnerable = false;
    this.transitionTo(STATES.ko);
  }

  hurtBox() {
    const h = this.anim === 'crouch' || this.blocking ? HURTBOX.crouchH : HURTBOX.h;
    return { x: this.x - HURTBOX.w / 2, y: this.y - h, w: HURTBOX.w, h };
  }

  reset(x: number, facing: 1 | -1) {
    const wins = this.wins;
    this.x = x; this.y = GROUND_Y; this.facing = facing;
    this.vx = 0; this.vy = 0; this.hp = this.stats.maxHp; this.hpShown = this.stats.maxHp; this.meter = 0;
    this.empoweredSpecial = false;
    this.onGround = true; this.blocking = false; this.attack = null;
    this.blockLevel = null; this.guard = 100; this.guardBreakTimer = 0;
    this.parryWindow = 0; this.parryFlash = 0; this.evadeTimer = 0;
    this.queuedAttack = null; this.comboStep = 0; this.comboWindow = 0; this.comboHistory = [];
    this.attackContext = 'normal'; this.landingCancelTimer = 0;
    this.hitstun = 0; this.blockstun = 0; this.koBounced = false; this.wins = wins;
    this.burnTimer = 0; this.burnTick = 0; this.slowTimer = 0;
    this.chillStacks = 0; this.chillWindow = 0; this.frozenTimer = 0;
    this.dashTimer = 0; this.dashHasHit = false;
    this.counterHitVulnerable = false; this.parryTurboTimer = 0;
    this.lastDirectionTap = null; this.lastDirectionTime = 0;
    this.animator.name = 'idle'; this.animator.frame = 0; this.animator.timer = 0; this.state = STATES.idle;
  }

  abstract specialPower(): SpecialPowerProfile;
}

export class Kenji extends Fighter {
  constructor(x: number, facing: 1 | -1) { super('kenji', 'KENJI', x, GROUND_Y, facing,
    { maxHp: 100, walkSpeed: 1, jumpPower: 1, damage: 1.14, defense: 1, reach: 1.04, specialCost: 50 }); }
  specialPower() { return { name: 'Dragón de Fuego', behavior: 'burn' as const, speed: 7.2, damage: 24, chip: 6, hitstun: 38, blockstun: 16, knockback: 6.5, width: 82, height: 50, yOffset: -92, life: 210 }; }
}
export class Rebeca extends Fighter {
  constructor(x: number, facing: 1 | -1) { super('bruno', 'REBECA', x, GROUND_Y, facing,
    { maxHp: 115, walkSpeed: 0.88, jumpPower: 0.9, damage: 1.08, defense: 0.86, reach: 1.08, specialCost: 75 }); }
  specialPower() { return { name: 'Puño Sísmico', behavior: 'seismic' as const, speed: 0, damage: 32, chip: 9, hitstun: 44, blockstun: 20, knockback: 8.5, width: 250, height: 58, yOffset: -28, life: 34 }; }
}
export class Luna extends Fighter {
  constructor(x: number, facing: 1 | -1) { super('luna', 'LUNA', x, GROUND_Y, facing,
    { maxHp: 92, walkSpeed: 1.12, jumpPower: 1.08, damage: 0.94, defense: 1.06, reach: 1, specialCost: 50 }); }
  specialPower() { return { name: 'Ventisca Glacial', behavior: 'freeze' as const, speed: 5.1, damage: 20, chip: 5, hitstun: 42, blockstun: 22, knockback: 3.5, width: 96, height: 62, yOffset: -94, life: 230 }; }
}
export class Rayo extends Fighter {
  constructor(x: number, facing: 1 | -1) { super('rayo', 'RAYO', x, GROUND_Y, facing,
    { maxHp: 96, walkSpeed: 1.2, jumpPower: 1.12, damage: 1, defense: 1.03, reach: 0.96, specialCost: 50 }); }
  specialPower() { return { name: 'Impacto Umbrío', behavior: 'dash' as const, speed: 8.6, damage: 26, chip: 7, hitstun: 32, blockstun: 14, knockback: 9, width: 78, height: 52, yOffset: -90, life: 150 }; }
}
