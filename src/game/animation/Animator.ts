export type AnimationName = 'idle' | 'walk' | 'crouch' | 'punch' | 'kick' | 'jump' | 'block' | 'hurt' | 'ko' | 'special';

export class Animator {
  name: AnimationName = 'idle';
  frame = 0;
  timer = 0;

  play(name: AnimationName, preserveFrame = false) {
    if (this.name === name) return;
    this.name = name;
    if (!preserveFrame) {
      this.frame = 0;
      this.timer = 0;
    }
  }

  tick(duration: number, lastFrame: number, loop = false) {
    this.timer++;
    if (this.timer < duration) return;
    this.timer = 0;
    if (this.frame < lastFrame) this.frame++;
    else if (loop) this.frame = 0;
  }
}
