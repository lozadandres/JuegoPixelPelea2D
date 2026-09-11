import type { Fighter } from './Fighter';
import type { AnimationName } from '../animation/Animator';

export abstract class FighterState {
  abstract readonly name: AnimationName;
  enter(fighter: Fighter) { fighter.animator.play(this.name); }
}

export class IdleState extends FighterState { readonly name = 'idle' as const; }
export class WalkingState extends FighterState { readonly name = 'walk' as const; }
export class CrouchingState extends FighterState { readonly name = 'crouch' as const; }
export class JumpingState extends FighterState { readonly name = 'jump' as const; }
export class BlockingState extends FighterState { readonly name = 'block' as const; }
export class HurtState extends FighterState { readonly name = 'hurt' as const; }
export class KnockoutState extends FighterState { readonly name = 'ko' as const; }

export class AttackingState extends FighterState {
  readonly name: 'punch' | 'kick' | 'special';
  constructor(name: 'punch' | 'kick' | 'special') { super(); this.name = name; }
}

export const STATES = {
  idle: new IdleState(), walk: new WalkingState(), crouch: new CrouchingState(),
  jump: new JumpingState(), block: new BlockingState(), hurt: new HurtState(), ko: new KnockoutState(),
};
