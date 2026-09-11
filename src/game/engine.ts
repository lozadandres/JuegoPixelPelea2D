// Motor de combate de PUÑOS DE PÍXEL
import {
  MOVES, FRAME_DUR,
  VIEW_W, WORLD_W, GROUND_Y, GRAVITY, JUMP_VY, WALK_SPEED,
  ROUND_TIME, ROUNDS_TO_WIN, CHARACTERS,
  COMBO_ROUTES, COMBO_SCALING,
  DASH_FORWARD_COST, DASH_BACK_COST, DASH_FORWARD_SPEED, DASH_FORWARD_DURATION,
  DASH_BACK_SPEED, DASH_BACK_DURATION, DOUBLE_TAP_WINDOW,
  COUNTER_HIT_DAMAGE_MULT, COUNTER_HIT_HITSTUN_BONUS,
  PARRY_TURBO_DURATION, PARRY_TURBO_DAMAGE_MULT,
  ULTRA_METER_COST, ULTRA_HP_THRESHOLD, ULTRA_SLOWMO_DURATION, ULTRA_FLASH_DURATION,
  ULTRA_MOVES
} from './data';
import type { CharKey, MoveName, IndicatorType, FloatingIndicator } from './data';
import { Assets, playSfx } from './assets';
import { FighterFactory } from './fighters/FighterFactory';
import type { Fighter } from './fighters/Fighter';
import type { SpecialPowerProfile } from './fighters/Fighter';
import { STATES } from './fighters/FighterState';
import { GameEventBus } from './core/GameEventBus';
import { Camera } from './rendering/Camera';
import { AdaptiveLearningBrain } from './ai/AdaptiveLearning';
import { CompanionFactory } from './companions/Companion';
import type { Companion } from './companions/Companion';
import { CollisionSystem } from './systems/CollisionSystem';

export interface InputState {
  left: boolean; right: boolean; up: boolean; down: boolean;
  punch: boolean; kick: boolean; special: boolean; evade: boolean;
}

export const emptyInput = (): InputState => ({
  left: false, right: false, up: false, down: false,
  punch: false, kick: false, special: false, evade: false,
});

export type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

export interface Projectile {
  x: number; y: number; vx: number;
  facing: 1 | -1;
  owner: number; char: CharKey;
  frame: number; timer: number; life: number;
  impacted?: boolean;
  power: SpecialPowerProfile;
}

export interface Fx {
  type: 'hit' | 'block' | 'dust';
  x: number; y: number; frame: number; timer: number;
  scale?: number;
}

interface ImpactAnimation {
  x: number; y: number; facing: 1 | -1; char: CharKey;
  frame: number; timer: number;
}

interface DashTrail {
  x: number; y: number; facing: 1 | -1;
  frame: number; timer: number;
}

const P1_START = 420;
const P2_START = 980;
const MARGIN = 70;
const LUNA_FREEZE_DURATION = 180;
const MAX_METER = 150;

export type CpuStyle = 'aggressive' | 'defensive' | 'zoner' | 'adaptive';
export type CpuDifficulty = 'easy' | 'normal' | 'hard';

// ---------------- IA ----------------
export class CpuController {
  private decide = 0;
  private plan: InputState = emptyInput();
  private blockFor = 0;
  private blockLevel: 'high' | 'low' = 'high';
  private readonly baseStyle: CpuStyle;
  private currentStyle: CpuStyle;
  private readonly difficulty: CpuDifficulty;
  private readonly brain: AdaptiveLearningBrain;
  private adaptTimer = 0;

  constructor(style: CpuStyle, difficulty: CpuDifficulty, cpuChar: CharKey, opponentChar: CharKey) {
    this.baseStyle = style;
    this.currentStyle = style;
    this.difficulty = difficulty;
    this.brain = new AdaptiveLearningBrain(cpuChar, opponentChar);
  }

  update(me: Fighter, foe: Fighter, foeProj: boolean): InputState {
    const out = emptyInput();
    this.brain.observe(foe);
    if (--this.adaptTimer <= 0) {
      this.adaptTimer = this.difficulty === 'hard' ? 150 : this.difficulty === 'easy' ? 300 : 210;
      this.currentStyle = this.difficulty === 'easy' && Math.random() < 0.55
        ? this.baseStyle
        : this.brain.chooseStyle(this.baseStyle);
    }
    if (me.hitstun > 0 || me.anim === 'ko') return out;

    if (this.blockFor > 0) {
      this.blockFor--;
      if (this.blockLevel === 'low') out.down = true;
      else out[foe.x > me.x ? 'left' : 'right'] = true;
      return out;
    }
    this.decide--;
    const dist = Math.abs(foe.x - me.x);
    const dir = foe.x > me.x ? 1 : -1;

    if (this.decide <= 0) {
      const reaction = this.difficulty === 'hard' ? 5 : this.difficulty === 'easy' ? 14 : 9;
      this.decide = reaction + Math.floor(Math.random() * (reaction + 1));
      this.plan = emptyInput();
      const r = Math.random();

      // Proyectil en camino: bloquear o saltar
      const learned = this.brain.counters();
      const defenseBias = this.currentStyle === 'defensive' ? 0.24 : learned.expectPressure ? 0.12 : 0;
      const specialBias = this.currentStyle === 'zoner' ? 0.22 : 0;
      const aggressive = this.currentStyle === 'aggressive' || (this.currentStyle === 'adaptive' && foe.hp < me.hp);
      if (foeProj && dist < 320 && r < 0.5 + defenseBias) {
        if (Math.random() < 0.7 + defenseBias) { this.blockLevel = 'high'; this.blockFor = 18; } else { this.plan.up = true; this.plan[dir > 0 ? 'right' : 'left'] = true; }
        return this.apply(out);
      }
      // El rival ataca de cerca: a veces bloquear
      if (foe.attack && dist < 220 && r < 0.34 + defenseBias + (learned.expectPressure ? 0.12 : 0)) {
        this.blockLevel = foe.attackContext === 'low' ? 'low' : 'high';
        this.blockFor = 16;
        return this.apply(out);
      }

      if (dist > 280) {
        if (me.meter >= me.stats.specialCost && r < 0.22 + specialBias) this.plan.special = true;
        else if (r < 0.78) this.plan[dir > 0 ? 'right' : 'left'] = true;
        else { this.plan.up = true; this.plan[dir > 0 ? 'right' : 'left'] = true; }
      } else if (dist > 120) {
        if (r < 0.62) this.plan[dir > 0 ? 'right' : 'left'] = true;
        else if (r < 0.72 + specialBias && me.meter >= me.stats.specialCost) this.plan.special = true;
        else if (r < 0.84) { this.plan.up = true; this.plan[dir > 0 ? 'right' : 'left'] = true; }
        else this.plan[dir > 0 ? 'left' : 'right'] = true;
      } else {
        if (learned.expectJump && r < 0.3) this.plan.kick = true;
        else if (learned.expectLow && r < 0.38) { this.plan.down = true; this.plan.punch = true; }
        else if (learned.turtle && me.meter >= me.stats.specialCost && r < 0.46) this.plan.special = true;
        else if (r < (aggressive ? 0.52 : 0.38)) this.plan.punch = true;
        else if (r < (aggressive ? 0.8 : 0.62)) this.plan.kick = true;
        else if (r < (this.currentStyle === 'defensive' ? 0.9 : 0.78)) {
          if (me.meter >= 25 && Math.random() < 0.28) {
            this.plan.evade = true;
            this.plan[dir > 0 ? 'left' : 'right'] = true;
          } else {
            this.blockLevel = Math.random() < 0.3 ? 'low' : 'high';
            this.blockFor = 14;
          }
        }
        else this.plan[dir > 0 ? 'left' : 'right'] = true;
      }
    }
    return this.apply(out);
  }

  private apply(out: InputState): InputState {
    Object.assign(out, this.plan);
    return out;
  }

  finish(cpuWon: boolean, performance: number) {
    this.brain.finish(cpuWon, performance);
  }
}

// ---------------- Motor ----------------
export class Engine {
  fighters: [Fighter, Fighter];
  projectiles: Projectile[] = [];
  fx: Fx[] = [];
  impacts: ImpactAnimation[] = [];
  dashTrails: DashTrail[] = [];
  companions: [Companion | null, Companion | null] = [null, null];
  private companionCooldown: [number, number] = [260, 320];
  phase: Phase = 'intro';
  phaseTimer = 0;
  round = 1;
  timeLeft = ROUND_TIME;
  hitpause = 0;
  shake = 0;
  flash = 0;
  slowMotionTimer = 0;
  private slowMotionTick = 0;
  private comboCount: [number, number] = [0, 0];
  private comboTimer: [number, number] = [0, 0];
  private comboDamage: [number, number] = [0, 0];
  camX = (WORLD_W - VIEW_W) / 2;
  announcement = '';
  winner: -1 | 0 | 1 = -1;
  onMatchEnd: (winner: number) => void = () => {};
  private cpu: [CpuController | null, CpuController | null] = [null, null];
  private matchEndFired = false;
  private learningFinalized = false;
  private chars: [CharKey, CharKey];
  private assets: Assets;
  camera = new Camera();
  floatingIndicators: FloatingIndicator[] = [];
  ultraSlowmoActive = false;
  ultraScreencrackTimer = 0;
  ultraInitiator: 0 | 1 | -1 = -1;
  p1LastKeys = { left: false, right: false, up: false, down: false };
  p2LastKeys = { left: false, right: false, up: false, down: false };
  p1DoubleTapTimer = { left: 0, right: 0 };
  p2DoubleTapTimer = { left: 0, right: 0 };
  readonly events = new GameEventBus();
  private collisions = new CollisionSystem();

  constructor(
    chars: [CharKey, CharKey],
    mode: 'pvp' | 'cpu' | 'demo',
    assets: Assets,
    difficulty: CpuDifficulty = 'normal',
  ) {
    this.chars = chars;
    this.assets = assets;
    this.fighters = [FighterFactory.create(chars[0], P1_START, 1), FighterFactory.create(chars[1], P2_START, -1)];
    const styleFor = (char: CharKey): CpuStyle => char === 'kenji' ? 'aggressive'
      : char === 'bruno' ? 'defensive' : char === 'luna' ? 'zoner' : 'adaptive';
    if (mode !== 'pvp') this.cpu[1] = new CpuController(styleFor(chars[1]), difficulty, chars[1], chars[0]);
    if (mode === 'demo') this.cpu[0] = new CpuController(styleFor(chars[0]), difficulty, chars[0], chars[1]);
    this.startRound();
  }

  startRound() {
    const w0 = this.fighters[0].wins, w1 = this.fighters[1].wins;
    const [a, b] = this.fighters;
    a.reset(P1_START, 1); a.wins = w0;
    b.reset(P2_START, -1); b.wins = w1;
    this.projectiles = [];
    this.fx = [];
    this.impacts = [];
    this.dashTrails = [];
    this.companions = [null, null];
    this.companionCooldown = [240 + Math.floor(Math.random() * 120), 270 + Math.floor(Math.random() * 120)];
    this.comboCount = [0, 0]; this.comboTimer = [0, 0]; this.comboDamage = [0, 0];
    this.slowMotionTimer = 0; this.slowMotionTick = 0;
    this.timeLeft = ROUND_TIME;
    this.phase = 'intro';
    this.phaseTimer = 110;
    this.announcement = `RONDA ${this.round}`;
    this.winner = -1;
    this.floatingIndicators = [];
    this.ultraSlowmoActive = false;
    this.ultraScreencrackTimer = 0;
    this.ultraInitiator = -1;
  }

  charName(i: number) { return CHARACTERS.find(c => c.key === this.chars[i])!.name; }

  private finalizeLearning() {
    if (this.learningFinalized || this.winner < 0) return;
    this.learningFinalized = true;
    for (let i = 0; i < 2; i++) {
      const controller = this.cpu[i];
      if (!controller) continue;
      const me = this.fighters[i], foe = this.fighters[1 - i];
      const performance = me.hp / me.stats.maxHp - foe.hp / foe.stats.maxHp;
      controller.finish(this.winner === i, performance);
    }
  }

  update(p1in: InputState, p2in: InputState) {
    // FX siempre avanzan
    for (const f of this.fx) { f.timer++; if (f.timer >= 5) { f.timer = 0; f.frame++; } }
    this.fx = this.fx.filter(f => f.frame < (f.type === 'hit' ? 3 : 2));
    for (const effect of this.impacts) {
      effect.timer++;
      const frameDuration = effect.char === 'luna' ? 8 : 5;
      if (effect.timer >= frameDuration) { effect.timer = 0; effect.frame++; }
    }
    this.impacts = this.impacts.filter(effect => effect.frame < 5);
    for (const trail of this.dashTrails) {
      trail.timer++;
      if (trail.timer >= 4) { trail.timer = 0; trail.frame++; }
    }
    this.dashTrails = this.dashTrails.filter(trail => trail.frame < 4);
    if (this.flash > 0) this.flash--;
    if (this.shake > 0) this.shake--;
    
    // Indicadores flotantes
    for (const ind of this.floatingIndicators) {
      ind.timer++;
      ind.y -= 0.6; // se desplaza lentamente hacia arriba
    }
    this.floatingIndicators = this.floatingIndicators.filter(ind => ind.timer < ind.maxTimer);

    // Timers de doble toque direccional
    if (this.p1DoubleTapTimer.left > 0) this.p1DoubleTapTimer.left--;
    if (this.p1DoubleTapTimer.right > 0) this.p1DoubleTapTimer.right--;
    if (this.p2DoubleTapTimer.left > 0) this.p2DoubleTapTimer.left--;
    if (this.p2DoubleTapTimer.right > 0) this.p2DoubleTapTimer.right--;

    if (this.ultraScreencrackTimer > 0) {
      this.ultraScreencrackTimer--;
      this.shake = Math.max(this.shake, 6);
    }

    for (let i = 0; i < 2; i++) {
      if (this.comboTimer[i] > 0) this.comboTimer[i]--;
      else { 
        this.comboCount[i] = 0; 
        this.comboDamage[i] = 0; 
        this.fighters[i].comboHistory = [];
        this.fighters[i].comboStep = 0;
      }
    }
    if (this.slowMotionTimer > 0) {
      this.slowMotionTimer--; this.slowMotionTick++;
      if (this.slowMotionTick % 3 !== 0) return;
    }

    if (this.phase === 'intro') {
      this.phaseTimer--;
      if (this.phaseTimer === 55) { this.announcement = '¡PELEN!'; playSfx('bell'); }
      if (this.phaseTimer <= 0) { this.phase = 'fight'; this.announcement = ''; }
      this.updateCamera();
      return;
    }
    if (this.phase === 'roundEnd') {
      this.phaseTimer--;
      this.updatePhysics(this.fighters[0]);
      this.updatePhysics(this.fighters[1]);
      this.updateAnim(this.fighters[0]);
      this.updateAnim(this.fighters[1]);
      this.updateProjectiles();
      this.updateCamera();
      if (this.phaseTimer <= 0) {
        const w0 = this.fighters[0].wins, w1 = this.fighters[1].wins;
        if (w0 >= ROUNDS_TO_WIN || w1 >= ROUNDS_TO_WIN) {
          this.phase = 'matchEnd';
          this.phaseTimer = 260;
          this.announcement = `¡GANA ${this.charName(w0 > w1 ? 0 : 1)}!`;
          this.winner = w0 > w1 ? 0 : 1;
          this.finalizeLearning();
        } else {
          this.round++;
          this.startRound();
        }
      }
      return;
    }
    if (this.phase === 'matchEnd') {
      this.phaseTimer--;
      this.updateAnim(this.fighters[0]);
      this.updateAnim(this.fighters[1]);
      if (this.phaseTimer <= 0 && !this.matchEndFired) {
        this.matchEndFired = true;
        this.onMatchEnd(this.winner);
      }
      return;
    }

    // fase fight
    if (this.hitpause > 0) { this.hitpause--; return; }

    const [f1, f2] = this.fighters;
    const in1 = this.cpu[0] ? this.cpu[0].update(f1, f2, this.projectiles.some(p => p.owner === 1)) : p1in;
    const in2 = this.cpu[1] ? this.cpu[1].update(f2, f1, this.projectiles.some(p => p.owner === 0)) : p2in;

    this.timeLeft = Math.max(0, this.timeLeft - 1);
    if (this.timeLeft === 0) { this.endByTime(); return; }

    this.updateStatusEffects();
    this.updateFighter(f1, f2, in1);
    this.updateFighter(f2, f1, in2);
    this.updateCompanions();
    this.checkDashHits();
    this.separate(f1, f2);
    this.checkHits();
    this.updateProjectiles();
    this.updateCamera();
  }

  // ---------- lógica de luchador ----------
  private actionable(f: Fighter) {
    return f.actionable;
  }

  private updateCompanions() {
    for (let i = 0; i < 2; i++) {
      const ownerIndex = i as 0 | 1;
      const owner = this.fighters[ownerIndex];
      const foe = this.fighters[1 - ownerIndex];
      let companion = this.companions[ownerIndex];
      if (!companion) {
        this.companionCooldown[ownerIndex]--;
        if (this.companionCooldown[ownerIndex] <= 0 && owner.anim !== 'ko') {
          const danger = owner.hp / owner.stats.maxHp < 0.62 || !!this.companions[1 - ownerIndex];
          const opening = foe.attack?.name === 'special' || foe.guardBreakTimer > 0;
          const summonChance = danger ? 0.06 : opening ? 0.045 : 0.008;
          if (Math.random() < summonChance) {
            const spawnX = Math.max(30, Math.min(WORLD_W - 30, owner.x - owner.facing * 150));
            companion = CompanionFactory.create(ownerIndex, owner.char, spawnX, owner.facing);
            this.companions[ownerIndex] = companion;
            this.spawnFx('dust', spawnX, GROUND_Y - 26, 1.25);
          }
        }
        continue;
      }

      const enemyCompanion = this.companions[1 - ownerIndex];
      const hit = companion.update(owner, foe, enemyCompanion);
      if (hit?.target === 'companion' && enemyCompanion?.alive) {
        const direction = enemyCompanion.x >= companion.x ? 1 : -1;
        enemyCompanion.receiveHit(hit.damage, direction, hit.knockback);
        this.spawnFx('hit', enemyCompanion.x, GROUND_Y - 60, 0.75);
        playSfx('punch');
      } else if (hit?.target === 'fighter' && foe.anim !== 'ko') {
        this.applyCompanionHit(ownerIndex, foe, hit.damage, hit.knockback, companion.x);
      }

      if (!companion.alive && companion.state === 'defeated') {
        this.spawnFx('dust', companion.x, GROUND_Y - 24, 1.1);
        this.companions[ownerIndex] = null;
        this.companionCooldown[ownerIndex] = 840 + Math.floor(Math.random() * 300);
      }
    }
  }

  private applyCompanionHit(owner: 0 | 1, def: Fighter, damage: number, knockback: number, sourceX: number) {
    if (def.evadeTimer > 0) return;
    const dir = def.x >= sourceX ? 1 : -1;
    if (def.blocking && def.blockLevel === 'high') {
      def.guard = Math.max(0, def.guard - 7);
      def.blockstun = Math.max(def.blockstun, 7);
      def.vx = dir * 1.2;
      this.spawnFx('block', def.x, def.y - 86, 0.8);
      playSfx('block');
      if (def.guard <= 0) {
        def.blocking = false;
        def.blockLevel = null;
        def.blockstun = 0;
        def.guardBreakTimer = 55;
      }
      return;
    }
    const actual = Math.max(1, Math.round(damage * def.stats.defense * 0.7));
    def.hp = Math.max(0, def.hp - actual);
    def.receiveHit(12, dir * knockback, 0);
    def.meter = Math.min(MAX_METER, def.meter + 4);
    this.fighters[owner].meter = Math.min(MAX_METER, this.fighters[owner].meter + 3);
    this.spawnFx('hit', def.x, def.y - 82, 0.8);
    playSfx('punch');
    this.hitpause = Math.max(this.hitpause, 3);
    this.shake = Math.max(this.shake, 3);
    if (def.hp <= 0) this.ko(def, dir);
  }

  private attackDurations(f: Fighter) {
    return f.attack?.name === 'special' && f.char === 'kenji'
      ? [8, 8, 8, 8, 6, 12]
      : f.attack?.name === 'special' && f.char === 'luna'
        ? [8, 8, 8, 8, 6, 12]
      : f.attack?.name === 'special' && f.char === 'bruno'
        ? [7, 7, 7, 7, 6, 5, 12]
      : f.attack?.name === 'special' && f.char === 'rayo'
        ? [7, 7, 7, 7, 5, 5, 5, 9]
      : f.attack ? MOVES[f.attack.name].dur : [];
  }

  private updateFighter(f: Fighter, foe: Fighter, input: InputState) {
    const fIdx = this.fighters.indexOf(f);
    const lastKeys = fIdx === 0 ? this.p1LastKeys : this.p2LastKeys;
    const doubleTap = fIdx === 0 ? this.p1DoubleTapTimer : this.p2DoubleTapTimer;

    // Detectar doble toque direccional para dash
    if (this.actionable(f) && f.onGround) {
      if (input.left && !lastKeys.left) {
        if (doubleTap.left > 0) {
          this.triggerDash(f, -1);
        } else {
          doubleTap.left = DOUBLE_TAP_WINDOW;
        }
      }
      if (input.right && !lastKeys.right) {
        if (doubleTap.right > 0) {
          this.triggerDash(f, 1);
        } else {
          doubleTap.right = DOUBLE_TAP_WINDOW;
        }
      }
    }
    // Guardar último input direccional
    lastKeys.left = input.left;
    lastKeys.right = input.right;
    lastKeys.up = input.up;
    lastKeys.down = input.down;

    // orientación automática
    if (f.onGround && this.actionable(f)) f.facing = foe.x >= f.x ? 1 : -1;

    const busy = f.hitstun > 0 || f.blockstun > 0 || f.frozenTimer > 0 || f.guardBreakTimer > 0;
    if (f.hitstun > 0) f.hitstun--;
    if (f.blockstun > 0) f.blockstun--;
    if (f.parryTurboTimer > 0) f.parryTurboTimer--;

    const wasGuarding = f.blocking && f.blockstun <= 0;
    f.blocking = f.blockstun > 0;
    if (!f.blocking) f.blockLevel = null;
    const awayHeld = f.facing === 1 ? input.left : input.right;
    const forwardHeld = f.facing === 1 ? input.right : input.left;
    const nearbyThreat = Math.abs(foe.x - f.x) < 210 && !!foe.attack;
    const projectileThreat = this.projectiles.some(p => p.owner !== fIdx && Math.abs(p.x - f.x) < 260);

    if (this.actionable(f)) {
      // Activar Ultra Combo: especial + patada al mismo tiempo, con vida baja y MAX medidor
      const canUltra = f.meter >= ULTRA_METER_COST && (f.hp / f.stats.maxHp) <= ULTRA_HP_THRESHOLD;
      if (canUltra && input.special && input.kick && f.onGround) {
        this.triggerUltra(f);
      }
      // Dash Ofensivo vía botón de evasión + adelante
      else if (f.onGround && input.evade && forwardHeld && f.meter >= DASH_FORWARD_COST) {
        this.triggerDash(f, f.facing);
      }
      // Backdash (evasión) modificado
      else if (f.onGround && input.evade && (input.down || awayHeld) && f.meter >= DASH_BACK_COST) {
        f.meter -= DASH_BACK_COST;
        f.evadeTimer = DASH_BACK_DURATION;
        f.vx = -f.facing * DASH_BACK_SPEED;
        f.blocking = false;
        f.transitionTo(STATES.idle);
        this.spawnFx('dust', f.x, GROUND_Y - 8, 1.2);
        playSfx('jump');
      } else if (!f.onGround && input.punch) {
        f.startAttack('punch', 'air');
        f.comboStep = 1;
        f.comboHistory = ['punch'];
      } else if (!f.onGround && input.kick) {
        // Patada aérea añadida!
        f.startAttack('kick', 'air');
        f.comboStep = 1;
        f.comboHistory = ['kick'];
      } else if (!f.onGround && input.special && f.meter >= f.stats.specialCost) {
        // Especial aéreo añadido!
        f.startAttack('special', 'air');
        f.comboStep = 1;
        f.comboHistory = ['special'];
      } else if (f.onGround && input.down && input.punch) {
        f.startAttack('punch', 'low');
        f.comboStep = 1;
        f.comboHistory = ['punch'];
      } else if (f.onGround && input.down) {
        f.block('low', !wasGuarding);
      } else if (f.onGround && awayHeld && (nearbyThreat || projectileThreat)) {
        f.block('high', !wasGuarding);
      } else if (f.onGround && input.punch) {
        this.handleGroundComboInput(f, 'punch');
      } else if (f.onGround && input.kick) {
        this.handleGroundComboInput(f, 'kick');
      } else if (f.onGround && input.special && f.meter >= f.stats.specialCost) {
        f.startAttack('special');
        f.comboStep = 1;
        f.comboHistory = ['special'];
      } else {
        const slowFactor = f.slowTimer > 0 ? 0.48 : 1;
        const speed = (f.onGround ? WALK_SPEED : WALK_SPEED * 0.75) * f.stats.walkSpeed * slowFactor;
        if (input.left) f.walk(-1, speed);
        else if (input.right) f.walk(1, speed);
        else if (f.onGround) { f.vx *= 0.6; if (Math.abs(f.vx) < 0.2) f.vx = 0; f.transitionTo(STATES.idle); }
        if (input.up && f.onGround) {
          f.jump(JUMP_VY * f.stats.jumpPower * (f.slowTimer > 0 ? 0.72 : 1));
          this.spawnFx('dust', f.x, GROUND_Y - 8);
          playSfx('jump');
        }
      }
    } else if (busy && f.onGround && !f.attack) {
      f.vx *= 0.8;
    }

    // progreso del ataque
    if (f.attack) {
      // Detección de cancels intermedios durante el ataque
      if (f.attack.frame >= 1) {
        if (f.attackContext === 'low' && input.special && f.meter >= f.stats.specialCost) {
          f.queuedAttack = 'special';
        } else if (f.onGround) {
          const route = COMBO_ROUTES[f.char];
          const nextIndex = f.comboHistory.length;
          if (nextIndex < route.steps.length) {
            const nextStep = route.steps[nextIndex];
            if (nextStep.move === 'punch' && input.punch) {
              f.queuedAttack = 'punch';
            } else if (nextStep.move === 'kick' && input.kick) {
              f.queuedAttack = 'kick';
            }
          }
          // Permitir cancel a especial si la ruta lo soporta
          if (route.specialCancelOnLast && nextIndex === route.steps.length && input.special && f.meter >= f.stats.specialCost) {
            f.queuedAttack = 'special';
          }
        } else if (f.attackContext === 'air') {
          // Secuencia en el aire simple
          if (f.attack.name === 'punch' && input.kick) {
            f.queuedAttack = 'kick';
          }
        }
      }
      const mv = MOVES[f.attack.name];
      const durations = this.attackDurations(f);
      f.attack.timer++;
      const advancedSpecial = (f.char === 'kenji' || f.char === 'luna' || f.char === 'bruno' || f.char === 'rayo')
        && f.attack.name === 'special';
      
      // Si parryTurbo está activo y es el primer frame, reducimos startup a 0 (frame activo inmediato)
      if (f.parryTurboTimer > 0 && f.attack.frame === 0 && f.attack.timer === 1) {
        f.attack.frame = advancedSpecial ? (f.char === 'bruno' ? 5 : 4) : mv.active;
        f.attack.timer = 0;
      }

      const activeFrame = advancedSpecial ? (f.char === 'bruno' ? 5 : 4) : mv.active;
      if (f.attack.name === 'special' && f.attack.frame === activeFrame && !f.attack.hasHit) {
        f.attack.hasHit = true;
        const power = this.specialPowerFor(f);
        const seismic = power.behavior === 'seismic';
        
        if (power.behavior === 'dash') {
          f.dashTimer = 14;
          f.dashDirection = f.facing;
          f.dashHasHit = false;
        } else {
          this.projectiles.push({
            x: seismic ? f.x : f.x + f.facing * 60,
            y: f.y + power.yOffset, 
            vx: f.facing * power.speed,
            facing: f.facing,
            owner: fIdx, char: f.char, frame: 0, timer: 0, life: power.life, power,
          });
        }
        playSfx('special');
      }
      if (f.attack.timer >= durations[f.attack.frame]) {
        f.attack.timer = 0; f.attack.frame++;
        if (f.attack.frame >= durations.length) {
          const next = f.queuedAttack;
          const context = f.onGround ? 'normal' : 'air';
          if (next && (next !== 'special' || f.meter >= f.stats.specialCost)) {
            f.startAttack(next, context);
            f.comboStep++;
            f.comboHistory.push(next);
            f.comboWindow = 24;
          } else {
            const preserveLandingChain = f.attackContext === 'air';
            f.attack = null; f.queuedAttack = null;
            if (preserveLandingChain) f.comboWindow = 28;
            else { f.comboStep = 0; f.comboHistory = []; }
            f.transitionTo(f.onGround ? STATES.idle : STATES.jump);
          }
        }
      }
      if (f.attack) { f.animator.play(f.attack.name, true); f.animFrame = f.attack.frame; }
      f.vx *= 0.7;
    }

    if (f.dashTimer > 0) {
      if (f.dashTimer % 3 === 0) {
        this.dashTrails.push({ x: f.x, y: f.y, facing: f.dashDirection, frame: 0, timer: 0 });
      }
      f.vx = f.dashDirection * (f.char === 'rayo' && f.attack ? 14 : DASH_FORWARD_SPEED);
      f.dashTimer--;
    }
    if (f.evadeTimer > 0) {
      f.vx = -f.facing * DASH_BACK_SPEED;
      f.evadeTimer--;
    }

    this.updatePhysics(f);
    this.updateAnim(f);
  }

  private triggerDash(f: Fighter, direction: 1 | -1) {
    if (f.meter < DASH_FORWARD_COST) return;
    f.meter -= DASH_FORWARD_COST;
    f.dashTimer = DASH_FORWARD_DURATION;
    f.dashDirection = direction;
    f.transitionTo(STATES.walk);
    this.spawnFx('dust', f.x, GROUND_Y - 8, 1.25);
    playSfx('jump');
  }

  private triggerUltra(f: Fighter) {
    const fIdx = this.fighters.indexOf(f);
    f.meter = 0; // consume todo el medidor
    
    // Configurar slow-motion dramático del Ultra
    this.slowMotionTimer = ULTRA_SLOWMO_DURATION;
    this.flash = ULTRA_FLASH_DURATION;
    this.shake = 16;
    this.ultraSlowmoActive = true;
    this.ultraInitiator = fIdx as 0 | 1;
    this.ultraScreencrackTimer = 45;

    const def = this.fighters[1 - fIdx];
    const ultraDef = ULTRA_MOVES[f.char];
    
    // Indicador visual del Ultra
    this.spawnIndicator('ultra_name', `${ultraDef.name} MAX!`, f.x, f.y - 120, '#ffe13c', 16);

    // Animación de ataque inmediato
    f.startAttack('special');
    f.attack!.empowered = true;
    
    // Aplicar el daño masivo
    const realDamage = Math.round(ultraDef.damage * (f.parryTurboTimer > 0 ? PARRY_TURBO_DAMAGE_MULT : 1));
    this.applyHit(f, def, realDamage, 10, ultraDef.hitstun, 24, ultraDef.knockback, def.x, def.y - 82, 'proj');
    playSfx('ko');
  }

  private handleGroundComboInput(f: Fighter, move: MoveName) {
    const route = COMBO_ROUTES[f.char];
    const currentChainIndex = f.comboHistory.length;
    
    // Validar si el botón corresponde al siguiente paso del combo del personaje
    if (f.comboWindow > 0 && currentChainIndex < route.steps.length) {
      const expectedStep = route.steps[currentChainIndex];
      if (expectedStep.move === move) {
        f.startAttack(move);
        f.comboStep = currentChainIndex + 1;
        f.comboHistory.push(move);
        f.comboWindow = 24;
        
        // Si completó la ruta completa del combo
        if (f.comboStep === route.steps.length) {
          this.spawnIndicator('combo_name', route.name, f.x, f.y - 130, '#8ff7ff', 12);
        }
        return;
      }
    }

    // Si falló la ruta o se acabó la ventana, inicia un nuevo combo
    f.startAttack(move);
    f.comboStep = 1;
    f.comboHistory = [move];
    f.comboWindow = 24;
  }

  private spawnIndicator(type: IndicatorType, text: string, x: number, y: number, color: string, size = 10) {
    this.floatingIndicators.push({
      type,
      text,
      x,
      y,
      timer: 0,
      maxTimer: 45,
      color,
      size
    });
  }

  private updatePhysics(f: Fighter) {
    f.x += f.vx;
    f.y += f.vy;
    if (!f.onGround) {
      f.vy += GRAVITY;
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y; f.vy = 0; f.onGround = true;
        if (f.attackContext === 'air' || f.comboWindow > 0) f.landingCancelTimer = 22;
        if (f.anim === 'ko') {
          if (!f.koBounced) { f.koBounced = true; f.vy = -5; f.onGround = false; this.shake = 8; }
          else f.vx = 0;
        } else if (f.hitstun <= 0) {
          this.spawnFx('dust', f.x, GROUND_Y - 6);
        }
      }
    }
    f.x = Math.max(MARGIN, Math.min(WORLD_W - MARGIN, f.x));
    f.hpShown += (f.hp - f.hpShown) * 0.08;
  }

  private checkDashHits() {
    for (let owner = 0; owner < this.fighters.length; owner++) {
      const atk = this.fighters[owner];
      if (atk.char !== 'rayo' || atk.dashTimer <= 0 || atk.dashHasHit || atk.anim === 'ko') continue;
      const def = this.fighters[1 - owner];
      if (def.anim === 'ko') continue;
      const direction = atk.dashDirection;
      const dashBox = { x: atk.x - 48, y: atk.y - 118, w: 96, h: 110 };
      if (!this.overlaps(dashBox, def.hurtBox())) continue;

      atk.dashHasHit = true;
      const blocked = def.blocking;
      const power = this.specialPowerFor(atk);
      this.applyHit(atk, def, power.damage, power.chip, power.hitstun,
        power.blockstun, power.knockback, def.x, def.y - 82, 'proj');
      this.impacts.push({ x: def.x, y: def.y - 82, facing: direction, char: 'rayo', frame: 0, timer: 0 });

      if (blocked) {
        atk.x = def.x - direction * 76;
      } else {
        atk.x = def.x + direction * 72;
        atk.facing = direction === 1 ? -1 : 1;
      }
      atk.x = Math.max(MARGIN, Math.min(WORLD_W - MARGIN, atk.x));
      atk.vx = 0;
      atk.dashTimer = 0;
    }
  }

  private specialPowerFor(f: Fighter): SpecialPowerProfile {
    const power = f.specialPower();
    if (!f.empoweredSpecial) return power;
    return {
      ...power,
      name: `${power.name} MAX`,
      damage: Math.round(power.damage * 1.55),
      chip: Math.round(power.chip * 1.5),
      hitstun: power.hitstun + 14,
      blockstun: power.blockstun + 8,
      knockback: power.knockback * 1.3,
      width: power.width * 1.25,
      height: power.height * 1.2,
      life: Math.round(power.life * 1.2),
    };
  }

  private updateStatusEffects() {
    for (const f of this.fighters) {
      if (f.parryWindow > 0) f.parryWindow--;
      if (f.parryFlash > 0) f.parryFlash--;
      if (f.comboWindow > 0) f.comboWindow--;
      if (f.landingCancelTimer > 0) f.landingCancelTimer--;
      if (f.guardBreakTimer > 0) {
        f.guardBreakTimer--;
        f.vx *= 0.86;
        f.blocking = false;
        f.blockLevel = null;
        if (f.guardBreakTimer === 0) f.guard = 45;
      } else if (!f.blocking && f.blockstun <= 0) {
        f.guard = Math.min(100, f.guard + 0.18);
      }
      if (f.slowTimer > 0) f.slowTimer--;
      if (f.chillWindow > 0) f.chillWindow--;
      else f.chillStacks = 0;
      if (f.frozenTimer > 0) {
        f.frozenTimer--;
        f.vx = 0;
        f.blocking = false;
      }
      if (f.burnTimer <= 0 || f.anim === 'ko') continue;
      f.burnTimer--;
      f.burnTick++;
      if (f.burnTick < 30) continue;
      f.burnTick = 0;
      f.hp = Math.max(0, f.hp - 1);
      this.spawnFx('hit', f.x, f.y - 82);
      if (f.hp <= 0) {
        const foe = this.fighters[1 - this.fighters.indexOf(f)];
        this.ko(f, f.x >= foe.x ? 1 : -1);
      }
    }
  }

  private updateAnim(f: Fighter) {
    if (f.guardBreakTimer > 0 && f.anim !== 'ko') f.transitionTo(STATES.hurt);
    else if (f.hitstun > 0 && f.anim !== 'ko') f.transitionTo(STATES.hurt);
    else if (f.blockstun > 0 && f.anim !== 'ko') f.transitionTo(STATES.block);
    if (f.anim === 'ko' && f.animFrame >= 2) return; // quedarse en el suelo
    f.animTimer++;
    const dur = f.attack ? this.attackDurations(f)[f.animFrame]
      : f.anim === 'ko' ? [10, 14, 999][f.animFrame]
      : (FRAME_DUR[f.anim] ?? 10);
    if (f.animTimer >= dur) {
      f.animTimer = 0;
      const max = f.anim === 'idle' || f.anim === 'walk' ? 3
        : f.anim === 'hurt' ? 1
        : f.anim === 'ko' ? 2
        : f.anim === 'jump' ? 1 : 0;
      if (f.animFrame < max) f.animFrame++;
      else if (f.anim === 'idle' || f.anim === 'walk') f.animFrame = 0;
    }
    if (!f.onGround && !f.attack && f.anim !== 'ko' && f.hitstun <= 0) {
      f.transitionTo(STATES.jump);
      f.animFrame = f.vy < 0 ? 0 : 1;
    }
  }

  private separate(a: Fighter, b: Fighter) {
    const min = 46;
    const dx = b.x - a.x;
    if (Math.abs(dx) < min && a.anim !== 'ko' && b.anim !== 'ko') {
      const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
      a.x = Math.max(MARGIN, Math.min(WORLD_W - MARGIN, a.x));
      b.x = Math.max(MARGIN, Math.min(WORLD_W - MARGIN, b.x));
    }
  }

  // ---------- golpes ----------
  private overlaps(h1: { x: number; y: number; w: number; h: number }, h2: { x: number; y: number; w: number; h: number }) {
    return this.collisions.overlaps(h1, h2);
  }

  private checkHits() {
    for (let i = 0; i < 2; i++) {
      const atk = this.fighters[i], def = this.fighters[1 - i];
      if (!atk.attack || atk.attack.hasHit || atk.attack.frame !== MOVES[atk.attack.name].active) continue;
      const mv = MOVES[atk.attack.name];
      if (!mv.hitbox) continue;
      const hb = mv.hitbox;
      const reach = atk.stats.reach;
      const box = {
        x: atk.facing === 1 ? atk.x + hb.dx : atk.x - hb.dx * reach - hb.w * reach,
        y: atk.attackContext === 'low' ? atk.y - 66 : atk.y + hb.dy,
        w: hb.w * reach, h: atk.attackContext === 'low' ? 38 : hb.h,
      };
      if (def.anim === 'ko') continue;
      if (this.overlaps(box, def.hurtBox())) {
        atk.attack.hasHit = true;
        this.applyHit(atk, def, mv.dmg, mv.chip, mv.hitstun, mv.blockstun, mv.kb,
          box.x + box.w / 2, box.y + box.h / 2, atk.attack.name);
      }
    }
  }

  private applyHit(atk: Fighter, def: Fighter, dmg: number, chip: number,
    hitstun: number, blockstun: number, kb: number, hx: number, hy: number, kind: string) {
    if (def.evadeTimer > 0) {
      this.spawnFx('dust', def.x, def.y - 18);
      return;
    }
    const dir = def.x >= atk.x ? 1 : -1;
    const special = kind === 'proj';

    // Detección de Counter-Hit
    let finalDmg = dmg;
    let finalHitstun = hitstun;
    if (def.counterHitVulnerable && !def.blocking && !special) {
      finalDmg = Math.round(dmg * COUNTER_HIT_DAMAGE_MULT);
      finalHitstun = hitstun + COUNTER_HIT_HITSTUN_BONUS;
      this.spawnIndicator('counter', '¡COUNTER!', def.x, def.y - 110, '#ffe13c', 11);
      playSfx('kick');
    }

    // Daño con stats de personaje y daño del parry boost si aplica
    let baseDamage = finalDmg * atk.stats.damage;
    if (atk.parryTurboTimer > 0) {
      baseDamage *= PARRY_TURBO_DAMAGE_MULT;
      atk.parryTurboTimer = 0; // se consume
    }
    const actualDamageBeforeScaling = Math.max(1, Math.round(baseDamage * def.stats.defense));

    // Aplicar Damage Scaling según el paso del combo actual
    const comboIndex = Math.min(atk.comboStep, COMBO_SCALING.length - 1);
    const scalingFactor = COMBO_SCALING[comboIndex];
    const actualDamage = Math.max(1, Math.round(actualDamageBeforeScaling * scalingFactor));

    const attackLevel: 'high' | 'low' = atk.attackContext === 'low' ? 'low' : 'high';
    const canBlock = def.blocking && (special || def.blockLevel === attackLevel);
    const actualChip = Math.max(1, Math.round(chip * def.stats.defense * (special ? 0.55 : 1)));

    // Parry Exitoso
    if (canBlock && def.parryWindow > 0) {
      def.parryWindow = 0;
      def.parryFlash = 28;
      def.guard = Math.min(100, def.guard + 18);
      def.meter = Math.min(MAX_METER, def.meter + 18);
      def.blockstun = 0;
      def.parryTurboTimer = PARRY_TURBO_DURATION; // Activa estado Turbo!
      atk.attack = null;
      atk.hitstun = 18;
      atk.vx = -dir * 4;
      this.spawnFx('block', hx, hy, 1.65);
      this.spawnIndicator('reversal', 'PARRY PERFECT!', def.x, def.y - 120, '#8ff7ff', 10);
      this.hitpause = 8;
      this.shake = 5;
      playSfx('block');
      return;
    }

    // Reversal si se ataca inmediatamente después de salir de hitstun/blockstun
    if (!def.blocking && (def.hitstun > 0 || def.blockstun > 0) && atk.attack) {
      // guardamos flag por si es reversal del atacante o del defensor
    }

    if (canBlock) {
      def.hp = Math.max(1, def.hp - actualChip);
      const guardDamage = Math.max(8, Math.round(actualDamageBeforeScaling * 1.3 + (special ? 8 : 4)));
      def.guard = Math.max(0, def.guard - guardDamage);
      def.blockstun = blockstun;
      def.vx = dir * kb * 0.8;
      def.meter = Math.min(MAX_METER, def.meter + 6);
      atk.meter = Math.min(MAX_METER, atk.meter + 4);
      this.spawnFx('block', hx, hy);
      this.events.emit('attackBlocked', { attacker: this.fighters.indexOf(atk), defender: this.fighters.indexOf(def) });
      playSfx('block');
      if (def.guard <= 0) {
        def.blocking = false;
        def.blockLevel = null;
        def.blockstun = 0;
        def.guardBreakTimer = 70;
        def.vx = dir * kb * 1.25;
        this.hitpause = 9;
        this.shake = 8;
        this.flash = Math.max(this.flash, 5);
      }
    } else {
      def.hp = Math.max(0, def.hp - actualDamage);
      def.receiveHit(finalHitstun, dir * kb, kind === 'kick' || kind === 'proj' ? -3 : 0);
      def.meter = Math.min(MAX_METER, def.meter + Math.max(8, Math.round(actualDamage * 0.8)));
      atk.meter = Math.min(MAX_METER, atk.meter + Math.max(10, Math.round(actualDamage * 1.1)));
      
      const attacker = this.fighters.indexOf(atk);
      this.comboCount[attacker] = this.comboTimer[attacker] > 0 ? this.comboCount[attacker] + 1 : 1;
      this.comboTimer[attacker] = 90;
      this.comboDamage[attacker] += actualDamage;
      
      this.spawnFx('hit', hx, hy, actualDamage >= 14 ? 1.65 : kind === 'proj' ? 1.3 : 1);
      this.events.emit('fighterHit', { attacker, defender: this.fighters.indexOf(def), damage: actualDamage });
      playSfx(kind === 'kick' ? 'kick' : 'punch');
      this.hitpause = Math.min(10, 3 + Math.floor(actualDamage / 4));
      this.shake = Math.min(14, 2 + actualDamage * 0.55);
      if (actualDamage >= 14) this.flash = Math.max(this.flash, 4);
      if (def.hp <= 0) this.ko(def, dir);
    }
  }

  private ko(f: Fighter, dir: number) {
    f.knockOut(dir * 4.5);
    this.events.emit('fighterKnockedOut', { fighter: this.fighters.indexOf(f) });
    this.phase = 'roundEnd';
    this.phaseTimer = 170;
    this.announcement = '¡K.O.!';
    this.hitpause = 12;
    this.flash = 10;
    this.shake = 14;
    this.slowMotionTimer = 72;
    playSfx('ko');
    const winner = this.fighters[1 - this.fighters.indexOf(f)];
    winner.wins++;
    winner.attack = null;
    winner.vx = 0;
  }

  private endByTime() {
    const [a, b] = this.fighters;
    this.phase = 'roundEnd';
    this.phaseTimer = 150;
    this.announcement = '¡TIEMPO!';
    playSfx('bell');
    if (a.hp !== b.hp) {
      const loser = a.hp < b.hp ? a : b;
      loser.anim = 'ko'; loser.animFrame = 0; loser.animTimer = 0;
      this.fighters[a.hp < b.hp ? 1 : 0].wins++;
    }
  }

  private updateProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.timer++;
      const projectileFrames = p.char === 'kenji' || p.char === 'luna' ? 5 : p.char === 'bruno' ? 6 : 3;
      if (p.timer >= 6) { p.timer = 0; p.frame = (p.frame + 1) % projectileFrames; }
      p.life--;
      const def = this.fighters[1 - p.owner];
      const atk = this.fighters[p.owner];
      const power = p.power;
      if (!p.impacted && this.phase === 'fight' && def.anim !== 'ko' && this.overlaps(
        { x: p.x - power.width / 2, y: p.y - power.height / 2, w: power.width, h: power.height },
        def.hurtBox())) {
        const wasBlocking = def.blocking;
        this.applyHit(atk, def, power.damage, power.chip, power.hitstun,
          power.blockstun, power.knockback, p.x, p.y, 'proj');
        if (!wasBlocking && def.hp > 0) {
          if (power.behavior === 'burn') {
            def.burnTimer = power.name.endsWith('MAX') ? 300 : 180;
            def.burnTick = 0;
          } else if (power.behavior === 'freeze') {
            def.slowTimer = 210;
            def.chillStacks += power.name.endsWith('MAX') ? 2 : 1;
            // Da tiempo real para volver a cargar la barra y conectar el
            // segundo especial que activa la secuencia completa de hielo.
            def.chillWindow = 720;
            if (def.chillStacks >= 2) {
              def.chillStacks = 0;
              def.chillWindow = 0;
              def.slowTimer = 0;
              def.frozenTimer = LUNA_FREEZE_DURATION;
              def.hitstun = Math.max(def.hitstun, LUNA_FREEZE_DURATION);
              def.vx = 0;
              def.vy = 0;
            }
          }
        }
        if (p.char === 'kenji' || p.char === 'luna' || p.char === 'bruno' || p.char === 'rayo') {
          this.impacts.push({ x: p.x, y: p.y, facing: p.facing, char: p.char, frame: 0, timer: 0 });
        }
        // El daño ocurre una sola vez, pero el poder permanece visible durante
        // unos cuadros para que dragón, ráfaga y onda no se corten al impactar
        // inmediatamente contra un rival cercano.
        p.impacted = true;
        p.vx = 0;
        p.life = p.char === 'kenji' || p.char === 'luna' || p.char === 'bruno' || p.char === 'rayo' ? 0 : 14;
      }
      if (p.x < -60 || p.x > WORLD_W + 60) p.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  private spawnFx(type: Fx['type'], x: number, y: number, scale = 1) {
    this.fx.push({ type, x, y, frame: 0, timer: 0, scale });
  }

  private updateCamera() {
    this.camera.x = this.camX;
    this.camera.follow(this.fighters[0].x, this.fighters[1].x);
    this.camX = this.camera.x;
  }

  // ---------- render ----------
  render(ctx: CanvasRenderingContext2D) {
    const A = this.assets;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
    ctx.translate(shakeX, shakeY);

    // escenario con parallax
    const sky = A.img('stage/sky'), city = A.img('stage/city'),
      near = A.img('stage/near'), floor = A.img('stage/floor');
    if (sky) ctx.drawImage(sky, -this.camX * 0.15 - 20, 0);
    if (city) ctx.drawImage(city, -this.camX * 0.4 - 30, 0);
    if (near) ctx.drawImage(near, -this.camX * 0.7 - 40, 0);
    if (floor) ctx.drawImage(floor, -this.camX - 68, 0);

    ctx.save();
    ctx.translate(-this.camX, 0);

    // sombras
    for (const f of this.fighters) {
      const airH = Math.max(0, GROUND_Y - f.y);
      const s = Math.max(0.35, 1 - airH / 320);
      ctx.fillStyle = `rgba(20,10,30,${0.4 * s})`;
      ctx.beginPath();
      ctx.ellipse(f.x, GROUND_Y + 8, 52 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const companion of this.companions) {
      if (!companion) continue;
      ctx.fillStyle = 'rgba(20,10,30,0.3)';
      ctx.beginPath();
      ctx.ellipse(companion.x, GROUND_Y + 6, 30, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Estelas visuales del desplazamiento de Rayo (sin hitbox).
    for (const trail of this.dashTrails) {
      const img = A.img(`rayo/trail_${trail.frame}`);
      if (!img) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0.18, 0.72 - trail.frame * 0.15);
      ctx.translate(trail.x, trail.y);
      if (trail.facing === -1) ctx.scale(-1, 1);
      ctx.drawImage(img, -img.width / 2, -img.height + 8);
      ctx.restore();
    }

    // Los asistentes se dibujan detrás para no confundirse con el luchador principal.
    for (const companion of this.companions) if (companion) this.drawCompanion(ctx, companion);

    // luchadores (el en el suelo por KO primero)
    const order = [...this.fighters].sort((a, b) => (a.anim === 'ko' ? -1 : 0) - (b.anim === 'ko' ? -1 : 0));
    for (const f of order) this.drawFighter(ctx, f);

    // proyectiles
    for (const p of this.projectiles) {
      const img = A.img(`${p.char}/proj_${p.frame}`);
      if (!img) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.facing === -1) ctx.scale(-1, 1);
      if (p.char === 'bruno') {
        const aura = A.img(`bruno/aura_${Math.min(4, p.frame)}`);
        const groundOffset = GROUND_Y - p.y + 6;
        if (aura) ctx.drawImage(aura, -aura.width / 2, groundOffset - aura.height);
        ctx.drawImage(img, -img.width / 2, groundOffset - img.height);
      } else {
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
      ctx.restore();
    }

    for (const effect of this.impacts) {
      const img = A.img(`${effect.char}/impact_${effect.frame}`);
      if (!img) continue;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      if (effect.facing === -1) ctx.scale(-1, 1);
      if (effect.char === 'bruno') {
        const groundOffset = GROUND_Y - effect.y + 6;
        ctx.drawImage(img, -img.width / 2, groundOffset - img.height);
        // Rocas durante el estallido y polvo durante la disipacion. Son capas
        // independientes para conservar todos los detalles de las hojas.
        const layer = effect.frame < 3
          ? A.img(`bruno/rock_${Math.min(3, effect.frame)}`)
          : A.img(`bruno/seismic_dust_${Math.min(3, effect.frame - 1)}`);
        if (layer) ctx.drawImage(layer, -layer.width / 2, groundOffset - layer.height);
      } else {
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
      }
      ctx.restore();
    }

    // FX
    for (const fx of this.fx) {
      const key = fx.type === 'hit' ? `fx/hit_${fx.frame}` : fx.type === 'block' ? `fx/block_${fx.frame}` : `fx/dust_${fx.frame}`;
      const img = A.img(key);
      if (img) {
        const size = 64 * (fx.scale ?? 1);
        ctx.drawImage(img, fx.x - size / 2, fx.y - size / 2, size, size);
      }
    }

    // Dibujar indicadores flotantes de texto
    for (const ind of this.floatingIndicators) {
      const alpha = Math.max(0, 1 - ind.timer / ind.maxTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      this.pixelText(ctx, ind.text, ind.x, ind.y, ind.size, ind.color, true);
      ctx.restore();
    }
    ctx.restore();

    // Efecto de pantalla partida (screencrack) durante Ultra Combos
    if (this.ultraScreencrackTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffe13c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Líneas quebradas simulando grietas en la pantalla
      ctx.moveTo(100, 50); ctx.lineTo(340, 260); ctx.lineTo(190, 480);
      ctx.moveTo(860, 80); ctx.lineTo(600, 240); ctx.lineTo(720, 500);
      ctx.moveTo(420, 20); ctx.lineTo(480, 540 - 20);
      ctx.stroke();
      ctx.restore();
    }

    // flash de KO o Ultra
    if (this.flash > 0) {
      const isUltraFlash = this.ultraSlowmoActive && (ULTRA_SLOWMO_DURATION - this.slowMotionTimer) < ULTRA_FLASH_DURATION;
      ctx.fillStyle = isUltraFlash ? `rgba(255, 225, 60, ${this.flash / ULTRA_FLASH_DURATION})` : `rgba(255,255,255,${this.flash / 14})`;
      ctx.fillRect(-10, -10, VIEW_W + 20, 540 + 20);
      if (this.flash === 1) this.ultraSlowmoActive = false; // reset al terminar el flash
    }

    this.drawHud(ctx);

    if (this.announcement) {
      const t = this.phase === 'intro' ? this.phaseTimer : this.phaseTimer;
      const scale = this.announcement === '¡PELEN!' && t > 45 ? 1 + (t - 45) * 0.06 : 1;
      const size = (this.announcement.startsWith('¡GANA') ? 34 : 46) * Math.min(scale, 1.6);
      const col = this.announcement === '¡K.O.!' ? '#ff4646'
        : this.announcement === '¡PELEN!' ? '#ffe13c'
        : this.announcement === '¡TIEMPO!' ? '#8fd0ff' : '#ffffff';
      this.pixelText(ctx, this.announcement, VIEW_W / 2, 240, size, col, true);
    }
    ctx.restore();
  }

  private drawFighter(ctx: CanvasRenderingContext2D, f: Fighter) {
    const visualAnim = f.anim === 'crouch' ? 'block' : f.anim;
    const img = this.assets.img(`${f.char}/${visualAnim}_${f.animFrame}`);
    if (!img) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.facing === -1) ctx.scale(-1, 1);
    if (f.burnTimer > 0) {
      const sequence = [0, 1, 2, 3, 2, 1];
      const frame = sequence[Math.floor(f.burnTimer / 5) % sequence.length];
      const burn = this.assets.img(`kenji/burn_${frame}`);
      if (burn) ctx.drawImage(burn, -burn.width / 2, -burn.height + 8);
    }
    if (f.slowTimer > 0) {
      const frost = this.assets.img(`luna/frost_${Math.floor(f.slowTimer / 7) % 4}`);
      if (frost) ctx.drawImage(frost, -frost.width / 2, -frost.height + 8);
    }
    // destello blanco al recibir golpe
    if (f.hitstun > 0 && f.anim !== 'ko' && Math.floor(f.hitstun / 2) % 2 === 0) {
      ctx.globalAlpha = 0.65;
    }
    if (f.attack?.name === 'special' && f.attack.empowered) {
      ctx.shadowColor = '#ffe13c';
      ctx.shadowBlur = 22;
    }
    // Los poderes usan lienzos anchos para no recortar fuego, hielo, tierra o sombra.
    ctx.drawImage(img, -img.width / 2, -img.height + 8);
    if (f.parryFlash > 0) {
      ctx.strokeStyle = `rgba(143,247,255,${Math.min(1, f.parryFlash / 10)})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, -78, 54 + (28 - f.parryFlash), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (f.frozenTimer > 0) {
      const elapsed = LUNA_FREEZE_DURATION - f.frozenTimer;
      let key: string;
      if (elapsed < 32) {
        // El hielo nace desde el suelo y sube por las piernas.
        key = `luna/thaw_${Math.min(3, Math.floor(elapsed / 8))}`;
      } else if (elapsed < 64) {
        // La congelacion alcanza brazos, torso y cabeza.
        key = `luna/limbs_${Math.min(3, Math.floor((elapsed - 32) / 8))}`;
      } else if (f.frozenTimer > 55) {
        // Estado completamente congelado, con una leve pulsacion visual.
        key = `luna/frozen_body_${Math.floor(f.frozenTimer / 12) % 2}`;
      } else if (f.frozenTimer > 25) {
        // El bloque comienza a abrirse antes de liberar al luchador.
        key = `luna/freeze_${Math.floor(f.frozenTimer / 10) % 2}`;
      } else {
        // Reproduce la formacion en sentido contrario para descongelar.
        key = `luna/thaw_${Math.min(3, Math.floor((f.frozenTimer - 1) / 6))}`;
      }
      const freeze = this.assets.img(key);
      if (freeze) ctx.drawImage(freeze, -freeze.width / 2, -freeze.height + 8);
    }
    ctx.restore();
  }

  private drawCompanion(ctx: CanvasRenderingContext2D, companion: Companion) {
    const anim = companion.spriteAnimation();
    const isKenjiNinja = companion.char === 'kenji';
    const spritePrefix = isKenjiNinja ? 'companion/kenji' : companion.char;
    const img = this.assets.img(`${spritePrefix}/${anim}_${companion.frame}`)
      ?? this.assets.img(`${spritePrefix}/idle_0`);
    if (!img) return;
    ctx.save();
    ctx.translate(companion.x, companion.y);
    if (companion.facing === -1) ctx.scale(-1, 1);
    ctx.scale(isKenjiNinja ? 0.62 : 0.58, isKenjiNinja ? 0.62 : 0.58);
    ctx.globalAlpha = companion.state === 'entering' || companion.state === 'retreating' ? 0.72 : 0.92;
    ctx.shadowColor = companion.owner === 0 ? '#ffe13c' : '#8ff7ff';
    ctx.shadowBlur = 12;
    ctx.drawImage(img, -img.width / 2, -img.height + 8);
    ctx.restore();

    const barW = 58;
    ctx.fillStyle = '#180c26';
    ctx.fillRect(companion.x - barW / 2 - 2, companion.y - 108, barW + 4, 9);
    ctx.fillStyle = companion.owner === 0 ? '#ffe13c' : '#8ff7ff';
    ctx.fillRect(companion.x - barW / 2, companion.y - 106, barW * companion.hp / companion.maxHp, 5);
    this.pixelText(ctx, 'ASIS', companion.x, companion.y - 116, 6,
      companion.owner === 0 ? '#ffe13c' : '#8ff7ff');
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const [a, b] = this.fighters;
    this.drawHealth(ctx, a, 34, false);
    this.drawHealth(ctx, b, VIEW_W - 34 - 380, true);

    // temporizador
    ctx.fillStyle = '#1c1030';
    ctx.strokeStyle = '#f0e6ff';
    ctx.lineWidth = 3;
    const secs = Math.ceil(this.timeLeft / 60);
    ctx.fillRect(VIEW_W / 2 - 42, 16, 84, 52);
    ctx.strokeRect(VIEW_W / 2 - 42, 16, 84, 52);
    this.pixelText(ctx, this.phase === 'fight' || this.phase === 'roundEnd' ? String(secs).padStart(2, '0') : '∞',
      VIEW_W / 2, 38, 22, secs <= 10 ? '#ff4646' : '#ffffff');

    // rondas ganadas
    for (let i = 0; i < 2; i++) {
      for (let w = 0; w < ROUNDS_TO_WIN; w++) {
        const won = this.fighters[i].wins > w;
        const x = i === 0 ? VIEW_W / 2 - 62 - w * 20 : VIEW_W / 2 + 62 + w * 20;
        ctx.beginPath();
        ctx.arc(x, 42, 7, 0, Math.PI * 2);
        ctx.fillStyle = won ? '#ffe13c' : '#3a2a55';
        ctx.fill();
        ctx.strokeStyle = '#f0e6ff'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // nombres
    this.pixelText(ctx, this.charName(0), 40, 92, 14, '#ffffff', false, 'left');
    this.pixelText(ctx, this.charName(1), VIEW_W - 40, 92, 14, '#ffffff', false, 'right');
    for (let i = 0; i < 2; i++) {
      const active = this.companions[i];
      const readyIn = Math.max(0, Math.ceil(this.companionCooldown[i] / 60));
      const label = active ? `ASISTENTE ${Math.ceil(active.hp)}` : readyIn > 0 ? `ASISTENTE ${readyIn}s` : 'ASISTENTE LISTO';
      this.pixelText(ctx, label, i === 0 ? 40 : VIEW_W - 40, 111, 7,
        active ? (i === 0 ? '#ffe13c' : '#8ff7ff') : '#8a76b8', false, i === 0 ? 'left' : 'right');
    }

    for (let i = 0; i < 2; i++) {
      if (this.comboCount[i] < 2 || this.comboTimer[i] <= 0) continue;
      const x = i === 0 ? 92 : VIEW_W - 92;
      const color = this.comboCount[i] >= 4 ? '#ffe13c' : '#ffffff';
      const f = this.fighters[i];
      const scalingPct = Math.round(COMBO_SCALING[Math.min(f.comboStep, COMBO_SCALING.length - 1)] * 100);
      this.pixelText(ctx, `${this.comboCount[i]} GOLPES`, x, 138, 14, color);
      this.pixelText(ctx, `${this.comboDamage[i]} DAÑO (${scalingPct}%)`, x, 158, 8, '#8ff7ff');
    }
  }

  private drawHealth(ctx: CanvasRenderingContext2D, f: Fighter, x: number, mirror: boolean) {
    const W = 380, y = 24, H = 20;
    ctx.fillStyle = '#180c26';
    ctx.fillRect(x - 4, y - 4, W + 8, H + 8 + 24);
    ctx.strokeStyle = '#f0e6ff'; ctx.lineWidth = 3;
    ctx.strokeRect(x - 4, y - 4, W + 8, H + 8);
    // vida
    const pct = Math.max(0, f.hp / f.stats.maxHp);
    const pctShown = Math.max(0, f.hpShown / f.stats.maxHp);
    const bw = (p: number) => mirror ? x + W * (1 - p) : x;
    ctx.fillStyle = '#7a1616';
    ctx.fillRect(x, y, W, H);
    ctx.fillStyle = '#ffe9a8'; // daño reciente
    ctx.fillRect(bw(pctShown), y, W * pctShown, H);
    const grad = ctx.createLinearGradient(x, y, x, y + H);
    grad.addColorStop(0, pct > 0.3 ? '#ffe13c' : '#ff8c3c');
    grad.addColorStop(1, pct > 0.3 ? '#ff9a3c' : '#ff4646');
    ctx.fillStyle = grad;
    ctx.fillRect(bw(pct), y, W * pct, H);
    // barra de especial
    const my = y + H + 6;
    ctx.fillStyle = '#241538';
    ctx.fillRect(x, my, W * 0.62, 8);
    const mp = f.meter / MAX_METER;
    const mw = W * 0.62 * mp;
    const mg = ctx.createLinearGradient(x, my, x, my + 8);
    mg.addColorStop(0, f.meter >= f.stats.specialCost ? '#8ff7ff' : '#4a6a9c');
    mg.addColorStop(1, f.meter >= MAX_METER ? '#ffe13c' : f.meter >= f.stats.specialCost ? '#c88fff' : '#33456b');
    ctx.fillStyle = mg;
    ctx.fillRect(mirror ? x + W * 0.62 - mw : x, my, mw, 8);
    ctx.strokeStyle = 'rgba(240,230,255,0.75)'; ctx.lineWidth = 1;
    for (let level = 1; level < 3; level++) {
      const sx = x + W * 0.62 * level / 3;
      ctx.beginPath(); ctx.moveTo(sx, my); ctx.lineTo(sx, my + 8); ctx.stroke();
    }
    if (f.meter >= f.stats.specialCost && Math.floor(performance.now() / 240) % 2 === 0) {
      const label = f.meter >= MAX_METER ? 'MAX' : `NIVEL ${Math.floor(f.meter / 50)}`;
      this.pixelText(ctx, label, mirror ? x + W * 0.62 - 6 : x + 6, my + 1, 8,
        f.meter >= MAX_METER ? '#ffe13c' : '#ffffff', false, mirror ? 'right' : 'left');
    }
    const gy = my + 11;
    const gwMax = W * 0.42;
    const gw = gwMax * Math.max(0, f.guard / 100);
    ctx.fillStyle = '#24151e';
    ctx.fillRect(x, gy, gwMax, 6);
    ctx.fillStyle = f.guard > 55 ? '#65e88b' : f.guard > 25 ? '#ffe13c' : '#ff4646';
    ctx.fillRect(mirror ? x + gwMax - gw : x, gy, gw, 6);
    ctx.strokeStyle = 'rgba(240,230,255,0.55)';
    ctx.strokeRect(x, gy, gwMax, 6);
    if (f.guardBreakTimer > 0) {
      this.pixelText(ctx, 'GUARDIA ROTA', mirror ? x + gwMax : x, gy + 13, 7, '#ff4646', false,
        mirror ? 'right' : 'left');
    } else if (f.parryFlash > 0) {
      this.pixelText(ctx, 'PARRY', mirror ? x + gwMax : x, gy + 13, 8, '#8ff7ff', false,
        mirror ? 'right' : 'left');
    } else if (f.parryTurboTimer > 0) {
      this.pixelText(ctx, 'TURBO!', mirror ? x + gwMax : x, gy + 13, 8, '#ffe13c', false,
        mirror ? 'right' : 'left');
    }
  }

  pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
    size: number, color: string, centered = true, align: 'left' | 'center' | 'right' = 'center') {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = centered ? 'center' : align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7);
    ctx.strokeStyle = '#180c26';
    ctx.strokeText(text, x + 2, y + 3);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
