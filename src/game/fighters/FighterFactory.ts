import type { CharKey } from '../data';
import { Fighter, Kenji, Luna, Rayo, Rebeca } from './Fighter';

export class FighterFactory {
  static create(char: CharKey, x: number, facing: 1 | -1): Fighter {
    switch (char) {
      case 'kenji': return new Kenji(x, facing);
      case 'bruno': return new Rebeca(x, facing);
      case 'luna': return new Luna(x, facing);
      case 'rayo': return new Rayo(x, facing);
    }
  }
}
