export abstract class GameObject {
  active = true;
  x: number;
  y: number;
  vx: number;
  vy: number;

  protected constructor(
    x: number, y: number, vx = 0, vy = 0,
  ) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; }

  abstract update(): void;
  abstract render(ctx: CanvasRenderingContext2D): void;
}
