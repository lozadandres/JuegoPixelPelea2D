// Datos del juego PUÑOS DE PÍXEL
export const VIEW_W = 960;
export const VIEW_H = 540;
export const WORLD_W = 1400;
export const GROUND_Y = 470;
export const GRAVITY = 0.85;
export const JUMP_VY = -15.5;
export const WALK_SPEED = 3.4;
export const ROUND_TIME = 60 * 60; // 60 s a 60 fps
export const ROUNDS_TO_WIN = 2;
export const SPRITE_SCALE = 4;

export type CharKey = 'kenji' | 'bruno' | 'luna' | 'rayo';
export type MoveName = 'punch' | 'kick' | 'special';

export interface CharDef {
  key: CharKey;
  name: string;
  title: string;
  color: string;
  desc: string;
}

export const CHARACTERS: CharDef[] = [
  { key: 'kenji', name: 'KENJI', title: 'El Karateka', color: '#5a8cff',
    desc: 'Equilibrado y disciplinado. Su bola de fuego azul domina la distancia.' },
  { key: 'bruno', name: 'REBECA', title: 'La Boxeadora', color: '#5ae678',
    desc: 'Puños demoledores y aguante callejero. Su onda de choque es imparable.' },
  { key: 'luna',  name: 'LUNA',  title: 'La Kunoichi', color: '#c8aaff',
    desc: 'Rápida y letal. Su shuriken púrpura corta el aire sin avisar.' },
  { key: 'rayo',  name: 'RAYO',  title: 'El Enmascarado', color: '#ffe13c',
    desc: 'Furia de lucha libre. Su relámpago amarillo cae sin piedad.' },
];

export interface MoveDef {
  dur: number[];      // frames de juego por cuadro de animación
  active: number;     // cuadro con hitbox activa
  dmg: number;
  chip: number;       // daño al bloquear
  hitstun: number;
  blockstun: number;
  kb: number;         // empuje
  hitbox: { dx: number; dy: number; w: number; h: number } | null;
  meterCost?: number;
}

export const MOVES: Record<MoveName, MoveDef> = {
  punch: {
    dur: [6, 4, 10], active: 1, dmg: 6, chip: 1, hitstun: 16, blockstun: 8, kb: 2.6,
    hitbox: { dx: 20, dy: -116, w: 70, h: 40 },
  },
  kick: {
    dur: [7, 5, 12], active: 1, dmg: 9, chip: 2, hitstun: 21, blockstun: 10, kb: 4.2,
    hitbox: { dx: 26, dy: -100, w: 80, h: 42 },
  },
  special: {
    dur: [14, 6, 16], active: 1, dmg: 0, chip: 0, hitstun: 0, blockstun: 0, kb: 0,
    hitbox: null, meterCost: 50,
  },
};

export const PROJECTILE = {
  speed: 5.6, dmg: 12, chip: 3, hitstun: 22, blockstun: 10, kb: 3.5,
  w: 44, h: 36, life: 240,
};

export const FRAME_DUR: Record<string, number> = {
  idle: 14, walk: 8, jump: 10, block: 6, hurt: 10,
};

export const HURTBOX = { w: 56, h: 152, crouchH: 122 };

// ---------- Sistema de combos por personaje ----------
export interface ComboStep {
  move: MoveName;
  /** Multiplicador de daño para este paso (pre-scaling) */
  damageMultiplier?: number;
}

export interface ComboRoute {
  name: string;
  steps: ComboStep[];
  /** Si true, el último golpe puede cancelarse en especial */
  specialCancelOnLast?: boolean;
}

export const COMBO_ROUTES: Record<CharKey, ComboRoute> = {
  kenji: {
    name: 'Cadena del Dragón',
    steps: [
      { move: 'punch' },
      { move: 'punch', damageMultiplier: 1.1 },
      { move: 'kick', damageMultiplier: 1.2 },
    ],
    specialCancelOnLast: true,
  },
  bruno: {
    name: 'Ráfaga de Acero',
    steps: [
      { move: 'punch' },
      { move: 'punch', damageMultiplier: 1.15 },
      { move: 'punch', damageMultiplier: 1.35 },
    ],
  },
  luna: {
    name: 'Danza de Sombras',
    steps: [
      { move: 'punch' },
      { move: 'kick', damageMultiplier: 1.1 },
      { move: 'punch', damageMultiplier: 1.25 },
    ],
  },
  rayo: {
    name: 'Tormenta Eléctrica',
    steps: [
      { move: 'kick' },
      { move: 'kick', damageMultiplier: 1.1 },
      { move: 'punch', damageMultiplier: 1.4 },
    ],
  },
};

// ---------- Damage Scaling ----------
/** Multiplicador de daño por golpe sucesivo en un combo */
export const COMBO_SCALING = [1.0, 0.85, 0.70, 0.55, 0.45, 0.38];

// ---------- Dash ----------
export const DASH_FORWARD_COST = 15;
export const DASH_BACK_COST = 20;
export const DASH_FORWARD_SPEED = 11;
export const DASH_FORWARD_DURATION = 12;
export const DASH_BACK_SPEED = 9;
export const DASH_BACK_DURATION = 14;
/** Ventana de frames para detectar doble-toque direccional */
export const DOUBLE_TAP_WINDOW = 12;

// ---------- Counter-Hit ----------
export const COUNTER_HIT_DAMAGE_MULT = 1.4;
export const COUNTER_HIT_HITSTUN_BONUS = 8;

// ---------- Parry Turbo ----------
export const PARRY_TURBO_DURATION = 30;
export const PARRY_TURBO_DAMAGE_MULT = 1.2;

// ---------- Ultra Combo ----------
export const ULTRA_METER_COST = 150; // requiere MAX
export const ULTRA_HP_THRESHOLD = 0.30; // vida <= 30%
export const ULTRA_DAMAGE_MULT = 2.0;
export const ULTRA_SLOWMO_DURATION = 120;
export const ULTRA_FLASH_DURATION = 18;

export interface UltraDef {
  name: string;
  damage: number;
  hitstun: number;
  knockback: number;
}

export const ULTRA_MOVES: Record<CharKey, UltraDef> = {
  kenji: { name: 'Dragón Imperial', damage: 38, hitstun: 48, knockback: 9 },
  bruno: { name: 'Avalancha de Acero', damage: 42, hitstun: 52, knockback: 10 },
  luna:  { name: 'Absoluto Cero', damage: 35, hitstun: 56, knockback: 7 },
  rayo:  { name: 'Relámpago Definitivo', damage: 40, hitstun: 50, knockback: 11 },
};

// ---------- Indicadores Visuales ----------
export type IndicatorType = 'counter' | 'reversal' | 'combo_name' | 'ultra_name';

export interface FloatingIndicator {
  type: IndicatorType;
  text: string;
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  color: string;
  size: number;
}
