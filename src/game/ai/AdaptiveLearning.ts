import type { CharKey } from '../data';
import type { Fighter } from '../fighters/Fighter';

export type LearnedStyle = 'aggressive' | 'defensive' | 'zoner' | 'adaptive';
export type ObservedAction = 'punch' | 'kick' | 'special' | 'jump' | 'lowAttack' | 'blockHigh' | 'blockLow' | 'evade';

type ActionRates = Record<ObservedAction, number>;
type StrategyScores = Record<LearnedStyle, number>;

export interface OpponentProfile {
  version: 1;
  fights: number;
  winsAgainstAI: number;
  actionRates: ActionRates;
  strategyScores: StrategyScores;
  updatedAt: number;
}

const ACTIONS: ObservedAction[] = ['punch', 'kick', 'special', 'jump', 'lowAttack', 'blockHigh', 'blockLow', 'evade'];
const STYLES: LearnedStyle[] = ['aggressive', 'defensive', 'zoner', 'adaptive'];
const STORAGE_KEY = 'punos-del-destino.ai-memory.v1';

const blankRates = (): ActionRates => ({
  punch: 0, kick: 0, special: 0, jump: 0, lowAttack: 0,
  blockHigh: 0, blockLow: 0, evade: 0,
});

const blankProfile = (): OpponentProfile => ({
  version: 1,
  fights: 0,
  winsAgainstAI: 0,
  actionRates: blankRates(),
  strategyScores: { aggressive: 0, defensive: 0, zoner: 0, adaptive: 0 },
  updatedAt: Date.now(),
});

class LearningMemory {
  private profiles: Record<string, OpponentProfile> = {};

  constructor() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) this.profiles = JSON.parse(raw) as Record<string, OpponentProfile>;
    } catch { /* modo privado o almacenamiento no disponible */ }
  }

  profile(cpu: CharKey, opponent: CharKey) {
    const key = `${cpu}:vs:${opponent}`;
    const existing = this.profiles[key];
    if (existing?.version === 1) return existing;
    return (this.profiles[key] = blankProfile());
  }

  save() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.profiles)); } catch { /* sin persistencia */ }
  }

  static clear() {
    try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* sin persistencia */ }
  }
}

export class AdaptiveLearningBrain {
  private readonly memory = new LearningMemory();
  private readonly profile: OpponentProfile;
  private session = blankRates();
  private totalObserved = 0;
  private recent: ObservedAction[] = [];
  private lastSignature = '';
  private repeatCooldown = 0;
  private styleUsage: StrategyScores = { aggressive: 0, defensive: 0, zoner: 0, adaptive: 0 };
  private finished = false;

  constructor(cpu: CharKey, opponent: CharKey) {
    this.profile = this.memory.profile(cpu, opponent);
  }

  observe(foe: Fighter) {
    if (this.repeatCooldown > 0) this.repeatCooldown--;
    let action: ObservedAction | null = null;
    if (foe.evadeTimer > 0) action = 'evade';
    else if (foe.blocking) action = foe.blockLevel === 'low' ? 'blockLow' : 'blockHigh';
    else if (foe.attack?.name === 'special') action = 'special';
    else if (foe.attackContext === 'low' && foe.attack) action = 'lowAttack';
    else if (foe.attack?.name === 'punch') action = 'punch';
    else if (foe.attack?.name === 'kick') action = 'kick';
    else if (!foe.onGround) action = 'jump';

    const signature = action ?? '';
    if (!action) { this.lastSignature = ''; return; }
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.repeatCooldown = action === 'jump' || action.startsWith('block') ? 15 : 7;
    this.session[action]++;
    this.totalObserved++;
    this.recent.push(action);
    if (this.recent.length > 24) this.recent.shift();
  }

  chooseStyle(base: LearnedStyle): LearnedStyle {
    const rate = (action: ObservedAction) => {
      const recent = this.recent.length ? this.recent.filter(a => a === action).length / this.recent.length : 0;
      return recent * 0.7 + (this.profile.actionRates[action] ?? 0) * 0.3;
    };
    const aggression = rate('punch') + rate('kick') + rate('lowAttack');
    const guarding = rate('blockHigh') + rate('blockLow');
    const scores: StrategyScores = {
      aggressive: this.profile.strategyScores.aggressive + guarding * 1.35 + rate('special') * 0.7,
      defensive: this.profile.strategyScores.defensive + aggression * 1.25,
      zoner: this.profile.strategyScores.zoner + rate('jump') * 0.9 + rate('evade') * 0.7,
      adaptive: this.profile.strategyScores.adaptive + 0.12,
    };
    scores[base] += 0.18;
    const chosen = STYLES.reduce((best, style) => scores[style] > scores[best] ? style : best, base);
    this.styleUsage[chosen]++;
    return chosen;
  }

  counters() {
    const combined = (a: ObservedAction) => {
      const recent = this.recent.length ? this.recent.filter(x => x === a).length / this.recent.length : 0;
      return recent * 0.75 + this.profile.actionRates[a] * 0.25;
    };
    return {
      expectJump: combined('jump') > 0.22,
      expectLow: combined('lowAttack') + combined('blockHigh') > 0.28,
      expectSpecial: combined('special') > 0.18,
      expectPressure: combined('punch') + combined('kick') > 0.34,
      turtle: combined('blockHigh') + combined('blockLow') > 0.3,
    };
  }

  finish(cpuWon: boolean, performance = 0) {
    if (this.finished) return;
    this.finished = true;
    const oldFights = this.profile.fights;
    this.profile.fights++;
    if (!cpuWon) this.profile.winsAgainstAI++;
    const learningRate = Math.max(0.08, 1 / Math.min(12, oldFights + 1));
    const total = Math.max(1, this.totalObserved);
    for (const action of ACTIONS) {
      const currentRate = this.session[action] / total;
      this.profile.actionRates[action] += learningRate * (currentRate - this.profile.actionRates[action]);
    }
    const reward = Math.max(-1, Math.min(1, (cpuWon ? 0.75 : -0.75) + performance * 0.25));
    const usageTotal = Math.max(1, STYLES.reduce((sum, style) => sum + this.styleUsage[style], 0));
    for (const style of STYLES) {
      if (this.styleUsage[style] <= 0) continue;
      const weightedReward = reward * (0.55 + 0.45 * this.styleUsage[style] / usageTotal);
      this.profile.strategyScores[style] += 0.14 * (weightedReward - this.profile.strategyScores[style]);
    }
    this.profile.updatedAt = Date.now();
    this.memory.save();
  }

  summary() {
    return { fights: this.profile.fights, rates: { ...this.profile.actionRates } };
  }

  static clearMemory() { LearningMemory.clear(); }
}
