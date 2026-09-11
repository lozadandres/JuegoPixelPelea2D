export type GameEventMap = {
  fighterHit: { attacker: number; defender: number; damage: number };
  attackBlocked: { attacker: number; defender: number };
  fighterKnockedOut: { fighter: number };
  roundEnded: { winner: number };
};

type Handler<T> = (payload: T) => void;

export class GameEventBus {
  private listeners = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>) {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler as Handler<never>);
    this.listeners.set(event, handlers);
    return () => handlers.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]) {
    this.listeners.get(event)?.forEach(handler => handler(payload as never));
  }
}
