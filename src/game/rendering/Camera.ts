import { VIEW_W, WORLD_W } from '../data';

export class Camera {
  x = (WORLD_W - VIEW_W) / 2;
  shake = 0;

  follow(a: number, b: number) {
    const target = Math.max(0, Math.min(WORLD_W - VIEW_W, (a + b) / 2 - VIEW_W / 2));
    this.x += (target - this.x) * 0.12;
  }

  offset() {
    return this.shake > 0
      ? { x: (Math.random() - 0.5) * this.shake, y: (Math.random() - 0.5) * this.shake * 0.6 }
      : { x: 0, y: 0 };
  }
}
