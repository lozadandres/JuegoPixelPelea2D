import { useCallback, useEffect, useRef, useState } from 'react';
import { Assets, startMusic, stopMusic, setMuted, isMuted } from '../game/assets';
import { Engine } from '../game/engine';
import type { InputState } from '../game/engine';
import type { CpuDifficulty } from '../game/engine';
import { InputManager } from '../game/input';
import { CHARACTERS, VIEW_W, VIEW_H } from '../game/data';
import type { CharKey } from '../game/data';
import { AdaptiveLearningBrain } from '../game/ai/AdaptiveLearning';

type Screen = 'loading' | 'title' | 'select' | 'fight';
type Mode = 'cpu' | 'pvp' | 'demo';

const STATS: Record<CharKey, { fuerza: number; velocidad: number; alcance: number }> = {
  kenji: { fuerza: 5, velocidad: 3, alcance: 4 },
  bruno: { fuerza: 4, velocidad: 2, alcance: 4 },
  luna: { fuerza: 2, velocidad: 4, alcance: 4 },
  rayo: { fuerza: 3, velocidad: 5, alcance: 3 },
};

const PIXEL = { fontFamily: '"Press Start 2P", monospace' } as const;
const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function FightGame() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [loadPct, setLoadPct] = useState(0);
  const [mode, setMode] = useState<Mode>('cpu');
  const [difficulty, setDifficulty] = useState<CpuDifficulty>('normal');
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<{ p1: number | null; p2: number | null }>({ p1: null, p2: null });
  const [fightKey, setFightKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [result, setResult] = useState<number | null>(null);
  const [aiMemoryCleared, setAiMemoryCleared] = useState(false);

  const assetsRef = useRef<Assets | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // ---------- carga ----------
  useEffect(() => {
    const assets = new Assets();
    assetsRef.current = assets;
    assets.loadAll(setLoadPct).then(() => {
      const q = new URLSearchParams(window.location.search);
      if (q.get('demo') === '1') { startSelect('demo'); return; }
      if (q.get('select') === '1') { startSelect(q.get('mode') === 'pvp' ? 'pvp' : 'cpu'); return; }
      setScreen('title');
    });
    const input = new InputManager();
    inputRef.current = input;
    input.attach();
    input.onPause = () => setPaused(p => !p);
    return () => input.detach();
  }, []);

  // ---------- bucle de juego ----------
  useEffect(() => {
    if (screen !== 'fight') return;
    const assets = assetsRef.current!, input = inputRef.current!;
    const chars: [CharKey, CharKey] = [
      CHARACTERS[sel.p1 ?? 0].key,
      CHARACTERS[sel.p2 ?? 1].key,
    ];
    const engine = new Engine(chars, mode, assets, mode === 'demo' ? 'hard' : difficulty);
    engineRef.current = engine;
    engine.onMatchEnd = (w) => setResult(w);
    startMusic();
    const ctx = canvasRef.current!.getContext('2d')!;
    const loop = () => {
      if (!pausedRef.current) {
        engine.update(input.snapshot1(), input.snapshot2());
      }
      engine.render(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, fightKey]);

  // ---------- flujo de pantallas ----------
  const goTitle = useCallback(() => {
    setResult(null); setPaused(false);
    setSel({ p1: null, p2: null }); setCursor(0);
    setScreen('title');
  }, []);

  const startSelect = (m: Mode) => {
    setMode(m); setResult(null);
    setSel({ p1: null, p2: null }); setCursor(0);
    setScreen('select');
  };

  const confirmPick = useCallback((idx: number) => {
    setSel(prev => {
      if (prev.p1 === null) {
        if (mode !== 'pvp') {
          // la CPU elige rival distinto
          let cpu = Math.floor(Math.random() * 4);
          if (cpu === idx) cpu = (cpu + 1) % 4;
          const next = { p1: idx, p2: cpu };
          setTimeout(() => { setResult(null); setPaused(false); setScreen('fight'); }, 800);
          return next;
        }
        return { ...prev, p1: idx };
      }
      if (prev.p2 === null) {
        const next = { ...prev, p2: idx };
        setTimeout(() => { setResult(null); setPaused(false); setScreen('fight'); }, 800);
        return next;
      }
      return prev;
    });
  }, [mode]);

  // demo: dos CPU al azar
  useEffect(() => {
    if (screen === 'select' && mode === 'demo') {
      const a = Math.floor(Math.random() * 4);
      let b = Math.floor(Math.random() * 4);
      if (b === a) b = (b + 1) % 4;
      setSel({ p1: a, p2: b });
      const t = setTimeout(() => setScreen('fight'), 900);
      return () => clearTimeout(t);
    }
  }, [screen, mode]);

  // teclado en selección
  useEffect(() => {
    if (screen !== 'select' || mode === 'demo') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') setCursor(c => (c + 3) % 4);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') setCursor(c => (c + 1) % 4);
      else if (e.code === 'KeyJ' || e.code === 'Enter' || e.code === 'Space') confirmPick(cursor);
      else if (e.code === 'Escape') goTitle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, mode, cursor, confirmPick, goTitle]);

  const toggleMute = () => {
    const m = !muted; setMutedState(m); setMuted(m);
    if (!m) startMusic();
  };

  const picking = sel.p1 === null ? 1 : sel.p2 === null ? 2 : 0;
  const activeChar = CHARACTERS[cursor];

  return (
    <div className="min-h-screen w-full bg-[#0d0716] text-white flex flex-col items-center justify-center overflow-hidden relative select-none"
      style={PIXEL}>
      <Scanlines />

      {screen === 'loading' && (
        <div className="flex flex-col items-center gap-6 z-10">
          <Logo small />
          <div className="w-72 h-5 border-2 border-[#f0e6ff] bg-[#1c1030] p-0.5">
            <div className="h-full bg-[#ffe13c] transition-all" style={{ width: `${Math.round(loadPct * 100)}%` }} />
          </div>
          <p className="text-[10px] text-[#c8b8e8]">CARGANDO SPRITES… {Math.round(loadPct * 100)}%</p>
        </div>
      )}

      {screen === 'title' && (
        <div className="flex flex-col items-center gap-8 z-10 px-4 text-center">
          <div className="absolute inset-0 bg-[#0d0716]/80 -z-10" />
          <div className="absolute inset-0 -z-20" style={{ backgroundImage: 'url(sprites/stage/sky.png)', backgroundSize: 'cover', imageRendering: 'pixelated' }} />
          <Logo />
          <p className="text-[10px] md:text-xs text-[#c8b8e8] -mt-4">UN JUEGO DE PELEA 2D · SPRITES 100% PROCEDURALES</p>
          <div className="flex flex-col gap-4 mt-2">
            <MenuBtn onClick={() => startSelect('cpu')} color="#ffe13c">1 JUGADOR&nbsp;&nbsp;VS CPU</MenuBtn>
            <MenuBtn onClick={() => startSelect('pvp')} color="#8ff7ff">2 JUGADORES LOCAL</MenuBtn>
            <MenuBtn onClick={() => startSelect('demo')} color="#c88fff">DEMO CPU VS CPU</MenuBtn>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[8px] text-[#c8b8e8]">DIFICULTAD CPU</span>
            <div className="flex gap-2">
              {(['easy', 'normal', 'hard'] as CpuDifficulty[]).map(level => (
                <button key={level} onClick={() => setDifficulty(level)}
                  className={`px-3 py-2 border-2 text-[8px] transition-colors ${difficulty === level
                    ? 'border-[#ffe13c] text-[#ffe13c] bg-[#3a2a55]'
                    : 'border-[#3a2a55] text-[#c8b8e8] bg-[#1c1030]'}`}>
                  {level === 'easy' ? 'FÁCIL' : level === 'normal' ? 'NORMAL' : 'DIFÍCIL'}
                </button>
              ))}
            </div>
          </div>
          <ControlsHelp />
          <button onClick={toggleMute} className="text-[10px] text-[#c8b8e8] hover:text-white mt-1">
            SONIDO: {muted ? 'OFF 🔇' : 'ON 🔊'}
          </button>
          <button onClick={() => { AdaptiveLearningBrain.clearMemory(); setAiMemoryCleared(true); }}
            className="text-[8px] text-[#8a76b8] hover:text-[#8ff7ff] mt-1">
            {aiMemoryCleared ? 'MEMORIA IA BORRADA' : 'BORRAR MEMORIA DE APRENDIZAJE IA'}
          </button>
        </div>
      )}

      {screen === 'select' && mode !== 'demo' && (
        <div className="flex flex-col items-center gap-6 z-10 px-4 w-full max-w-3xl">
          <h2 className="text-base md:text-xl text-[#ffe13c]" style={{ textShadow: '3px 3px 0 #180c26' }}>
            {picking === 1 ? 'JUGADOR 1: ELIGE LUCHADOR' : mode === 'pvp' ? 'JUGADOR 2: ELIGE LUCHADOR' : 'LA CPU ELIGE…'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
            {CHARACTERS.map((c, i) => {
              const isP1 = sel.p1 === i, isP2 = sel.p2 === i, isCur = cursor === i && picking !== 0;
              return (
                <button key={c.key}
                  onClick={() => { setCursor(i); confirmPick(i); }}
                  onMouseEnter={() => setCursor(i)}
                  className={`relative flex flex-col items-center gap-2 p-3 border-4 transition-all bg-[#1c1030]
                    ${isCur ? 'scale-105' : 'border-[#3a2a55]'} ${isP1 || isP2 ? 'opacity-90' : ''}`}
                  style={{ borderColor: isCur ? c.color : undefined, boxShadow: isCur ? `0 0 18px ${c.color}66` : undefined }}>
                  <img src={`sprites/${c.key}/portrait.png`} alt={c.name} width={96} height={96}
                    className="[image-rendering:pixelated] w-20 h-20 md:w-24 md:h-24" />
                  <span className="text-[10px] md:text-xs" style={{ color: c.color }}>{c.name}</span>
                  <span className="text-[7px] text-[#c8b8e8]">{c.title}</span>
                  {isP1 && <Tag color="#ffe13c">P1</Tag>}
                  {isP2 && <Tag color="#8ff7ff">{mode === 'pvp' ? 'P2' : 'CPU'}</Tag>}
                </button>
              );
            })}
          </div>
          <div className="w-full bg-[#1c1030] border-2 border-[#3a2a55] p-4 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 text-center md:text-left">
              <p className="text-xs mb-1" style={{ color: activeChar.color }}>{activeChar.name} · {activeChar.title}</p>
              <p className="text-[8px] leading-relaxed text-[#c8b8e8]">{activeChar.desc}</p>
            </div>
            <div className="flex gap-4">
              {(['fuerza', 'velocidad', 'alcance'] as const).map(s => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <div key={n} className="w-2 h-3" style={{ background: n <= STATS[activeChar.key][s] ? activeChar.color : '#3a2a55' }} />
                    ))}
                  </div>
                  <span className="text-[7px] text-[#c8b8e8] uppercase">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[8px] text-[#8a76b8]">A/D o ◀▶ mover · J / ENTER confirmar · ESC volver</p>
        </div>
      )}

      {screen === 'fight' && (
        <div className="relative z-10 flex flex-col items-center w-full px-2">
          <div className="relative w-full max-w-[960px]">
            <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H}
              className="w-full h-auto border-4 border-[#3a2a55] [image-rendering:pixelated] bg-black" />
            {mode === 'demo' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] bg-[#180c26]/80 px-2 py-1 border border-[#3a2a55]">
                DEMO · ESC PARA SALIR
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-2">
              <HudBtn onClick={() => setPaused(p => !p)}>{paused ? '▶' : '⏸'}</HudBtn>
              <HudBtn onClick={toggleMute}>{muted ? '🔇' : '🔊'}</HudBtn>
            </div>

            {paused && (
              <Overlay>
                <p className="text-2xl text-[#ffe13c]" style={{ textShadow: '3px 3px 0 #180c26' }}>PAUSA</p>
                <MenuBtn onClick={() => setPaused(false)} color="#ffe13c">CONTINUAR</MenuBtn>
                <MenuBtn onClick={goTitle} color="#ff8c8c">SALIR AL MENÚ</MenuBtn>
              </Overlay>
            )}

            {result !== null && (
              <Overlay>
                <p className="text-[10px] text-[#c8b8e8]">{mode === 'demo' ? 'FIN DE LA DEMO' : 'GANADOR'}</p>
                <img src={`sprites/${CHARACTERS[result === 0 ? sel.p1! : sel.p2!].key}/portrait.png`}
                  className="[image-rendering:pixelated] w-28 h-28 border-4"
                  style={{ borderColor: CHARACTERS[result === 0 ? sel.p1! : sel.p2!].color }} alt="ganador" />
                <p className="text-xl md:text-3xl" style={{ color: CHARACTERS[result === 0 ? sel.p1! : sel.p2!].color, textShadow: '3px 3px 0 #180c26' }}>
                  {CHARACTERS[result === 0 ? sel.p1! : sel.p2!].name}
                </p>
                {mode !== 'demo' && (
                  <MenuBtn onClick={() => { setResult(null); setPaused(false); setFightKey(k => k + 1); }} color="#ffe13c">
                    REVANCHA
                  </MenuBtn>
                )}
                <MenuBtn onClick={() => { stopMusic(); startSelect(mode === 'demo' ? 'cpu' : mode); }} color="#8ff7ff">
                  CAMBIAR LUCHADOR
                </MenuBtn>
                <MenuBtn onClick={goTitle} color="#ff8c8c">MENÚ PRINCIPAL</MenuBtn>
              </Overlay>
            )}
          </div>

          {isTouch && result === null && <TouchPad input={inputRef.current!} />}
          {!isTouch && (
            <p className="text-[8px] text-[#8a76b8] mt-3 text-center leading-relaxed">
              P1: S bajo · atrás alto · Q+atrás evasión · J/J/K combo · S+J/L combo &nbsp;|&nbsp;
              {mode === 'pvp' ? 'P2: ▼ bajo · atrás alto · Shift der.+atrás evasión · ,/,/. combo' : 'Bloquea justo antes del impacto para hacer parry.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- piezas de UI ----------
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={`${small ? 'text-2xl' : 'text-3xl md:text-5xl'} text-[#ffe13c]`}
        style={{ textShadow: '4px 4px 0 #d22d2d, 8px 8px 0 #180c26' }}>PUÑOS</span>
      <span className={`${small ? 'text-sm' : 'text-lg md:text-2xl'} text-white mt-2 tracking-widest`}
        style={{ textShadow: '3px 3px 0 #180c26' }}>DE&nbsp;PÍXEL</span>
    </div>
  );
}

function MenuBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick}
      className="px-6 py-3 text-[10px] md:text-xs border-4 bg-[#1c1030] hover:scale-105 active:scale-95 transition-transform min-w-[260px]"
      style={{ borderColor: color, color, boxShadow: `0 4px 0 #180c26, inset 0 0 12px ${color}22` }}>
      {children}
    </button>
  );
}

function HudBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-8 h-8 text-xs bg-[#180c26]/80 border-2 border-[#3a2a55] hover:border-[#ffe13c] flex items-center justify-center">
      {children}
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 bg-[#0d0716]/85 flex flex-col items-center justify-center gap-4 z-20">
      {children}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="absolute top-1 right-1 text-[8px] px-1.5 py-0.5 border-2 bg-[#180c26]"
      style={{ borderColor: color, color }}>{children}</span>
  );
}

function Scanlines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 opacity-20"
      style={{ background: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 4px)' }} />
  );
}

function ControlsHelp() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-[8px] md:text-[9px] mt-2 w-full max-w-2xl">
      <div className="bg-[#1c1030]/90 border-2 border-[#ffe13c] p-3">
        <p className="text-[#ffe13c] mb-2">JUGADOR 1</p>
        <p className="text-[#c8b8e8] leading-loose">A / D — moverse&nbsp;&nbsp;W — saltar<br />S — bloqueo bajo&nbsp;&nbsp;atrás — alto&nbsp;&nbsp;Q — evasión<br />J — puño&nbsp;&nbsp;K — patada&nbsp;&nbsp;L — especial</p>
      </div>
      <div className="bg-[#1c1030]/90 border-2 border-[#8ff7ff] p-3">
        <p className="text-[#8ff7ff] mb-2">JUGADOR 2</p>
        <p className="text-[#c8b8e8] leading-loose">◀ / ▶ — moverse&nbsp;&nbsp;▲ — saltar<br />▼ — bloqueo bajo&nbsp;&nbsp;atrás — alto&nbsp;&nbsp;Shift der. — evasión<br />, — puño&nbsp;&nbsp;. — patada&nbsp;&nbsp;/ — especial</p>
      </div>
    </div>
  );
}

function TouchPad({ input }: { input: InputManager }) {
  const bind = (btn: keyof InputState) => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); input.touchPress(btn); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); input.touchRelease(btn); },
    onMouseDown: () => input.touchPress(btn),
    onMouseUp: () => input.touchRelease(btn),
  });
  const pad = "w-14 h-14 text-lg border-4 bg-[#1c1030]/90 active:scale-90 flex items-center justify-center";
  return (
    <div className="w-full max-w-[960px] flex justify-between items-end mt-3 px-1">
      <div className="flex gap-2 items-end">
        <button className={`${pad} border-[#8ff7ff] text-[#8ff7ff]`} {...bind('left')}>◀</button>
        <div className="flex flex-col gap-2">
          <button className={`${pad} border-[#8ff7ff] text-[#8ff7ff]`} {...bind('up')}>▲</button>
          <button className={`${pad} border-[#8ff7ff] text-[#8ff7ff]`} {...bind('down')}>🛡</button>
        </div>
        <button className={`${pad} border-[#8ff7ff] text-[#8ff7ff]`} {...bind('right')}>▶</button>
      </div>
      <div className="flex gap-2 items-end">
        <button className={`${pad} border-[#65e88b] text-[#65e88b] text-[8px]`} {...bind('evade')}>EVA</button>
        <button className={`${pad} border-[#ffe13c] text-[#ffe13c] text-[8px]`} {...bind('punch')}>PUÑO</button>
        <button className={`${pad} border-[#ff8c3c] text-[#ff8c3c] text-[8px]`} {...bind('kick')}>PATA</button>
        <button className={`${pad} border-[#c88fff] text-[#c88fff] text-[8px]`} {...bind('special')}>ESP</button>
      </div>
    </div>
  );
}
