// Carga de sprites y audio
const ANIM_COUNTS: Record<string, number> = {
  idle: 4, walk: 4, punch: 3, kick: 3, jump: 2, block: 1, hurt: 2, ko: 3, special: 3,
};
const CHARS = ['kenji', 'bruno', 'luna', 'rayo'];
const SFX_NAMES = ['punch', 'kick', 'block', 'jump', 'special', 'ko', 'bell'];

export class Assets {
  images = new Map<string, HTMLImageElement>();
  loaded = 0;
  total = 0;

  img(key: string): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  async loadAll(onProgress?: (pct: number) => void) {
    const jobs: Promise<void>[] = [];
    const add = (key: string, src: string) => {
      this.total++;
      jobs.push(new Promise<void>((resolve) => {
        const im = new Image();
        im.onload = () => { this.images.set(key, im); this.loaded++; onProgress?.(this.loaded / this.total); resolve(); };
        im.onerror = () => { this.loaded++; onProgress?.(this.loaded / this.total); resolve(); };
        im.src = src;
      }));
    };
    for (const c of CHARS) {
      for (const [anim, baseCount] of Object.entries(ANIM_COUNTS)) {
        const count = anim === 'special'
          ? c === 'kenji' || c === 'luna' ? 6 : c === 'bruno' ? 7 : c === 'rayo' ? 8 : baseCount
          : baseCount;
        for (let i = 0; i < count; i++) add(`${c}/${anim}_${i}`, `sprites/${c}/${anim}_${i}.png`);
      }
      const projectileFrames = c === 'kenji' || c === 'luna' ? 5 : c === 'bruno' ? 6 : 3;
      for (let i = 0; i < projectileFrames; i++) add(`${c}/proj_${i}`, `sprites/${c}/proj_${i}.png`);
      add(`${c}/portrait`, `sprites/${c}/portrait.png`);
    }
    // Asistente exclusivo de Kenji: el ninja se carga aparte para no reutilizar
    // el personaje principal reducido.
    const kenjiCompanionAnimations: Record<string, number> = {
      idle: 2, walk: 6, attack: 5, hurt: 3, ko: 5, enter: 5, vanish: 4,
    };
    for (const [anim, count] of Object.entries(kenjiCompanionAnimations)) {
      for (let i = 0; i < count; i++) {
        add(`companion/kenji/${anim}_${i}`, `sprites/companions/kenji/${anim}_${i}.png`);
      }
    }
    for (let i = 0; i < 5; i++) {
      add(`kenji/impact_${i}`, `sprites/kenji/impact_${i}.png`);
    }
    for (let i = 0; i < 4; i++) add(`kenji/burn_${i}`, `sprites/kenji/burn_${i}.png`);
    for (let i = 0; i < 5; i++) add(`luna/impact_${i}`, `sprites/luna/impact_${i}.png`);
    for (let i = 0; i < 4; i++) add(`luna/frost_${i}`, `sprites/luna/frost_${i}.png`);
    for (let i = 0; i < 2; i++) add(`luna/freeze_${i}`, `sprites/luna/freeze_${i}.png`);
    for (let i = 0; i < 2; i++) add(`luna/frozen_body_${i}`, `sprites/luna/frozen_body_${i}.png`);
    for (let i = 0; i < 4; i++) add(`luna/limbs_${i}`, `sprites/luna/limbs_${i}.png`);
    for (let i = 0; i < 4; i++) add(`luna/thaw_${i}`, `sprites/luna/thaw_${i}.png`);
    for (let i = 0; i < 5; i++) add(`bruno/impact_${i}`, `sprites/bruno/impact_${i}.png`);
    for (let i = 0; i < 5; i++) add(`bruno/aura_${i}`, `sprites/bruno/aura_${i}.png`);
    for (let i = 0; i < 4; i++) add(`bruno/rock_${i}`, `sprites/bruno/rock_${i}.png`);
    for (let i = 0; i < 4; i++) add(`bruno/seismic_dust_${i}`, `sprites/bruno/seismic_dust_${i}.png`);
    for (let i = 0; i < 5; i++) add(`rayo/impact_${i}`, `sprites/rayo/impact_${i}.png`);
    for (let i = 0; i < 4; i++) add(`rayo/trail_${i}`, `sprites/rayo/trail_${i}.png`);
    for (let i = 0; i < 3; i++) add(`fx/hit_${i}`, `sprites/fx/hit_${i}.png`);
    for (let i = 0; i < 2; i++) add(`fx/block_${i}`, `sprites/fx/block_${i}.png`);
    for (let i = 0; i < 2; i++) add(`fx/dust_${i}`, `sprites/fx/dust_${i}.png`);
    for (const s of ['sky', 'city', 'near', 'floor']) add(`stage/${s}`, `sprites/stage/${s}.png`);
    await Promise.all(jobs);
    try { await document.fonts.load('16px "Press Start 2P"'); } catch { /* noop */ }
  }
}

// ---------- audio ----------
const sfxSrc: Record<string, string> = Object.fromEntries(SFX_NAMES.map(n => [n, `audio/${n}.mp3`]));
let musicEl: HTMLAudioElement | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  if (musicEl) musicEl.muted = m;
}
export function isMuted() { return muted; }

export function playSfx(name: string) {
  if (muted) return;
  const src = sfxSrc[name];
  if (!src) return;
  const a = new Audio(src);
  a.volume = name === 'ko' || name === 'bell' ? 0.9 : 0.7;
  a.play().catch(() => { /* autoplay bloqueado hasta gesto */ });
}

export function startMusic() {
  if (!musicEl) {
    musicEl = new Audio('audio/music.mp3');
    musicEl.loop = true;
    musicEl.volume = 0.35;
  }
  musicEl.muted = muted;
  musicEl.play().catch(() => { /* espera gesto del usuario */ });
}

export function stopMusic() {
  musicEl?.pause();
}
