/**
 * Som "sua vez" (um "plim" de duas notas), criado aqui mesmo: nada de arquivo de fora.
 * O iPhone só deixa tocar som depois de um toque na tela; por isso `prepararSom` é chamado nos toques.
 * Se o iPhone estiver no silencioso, o som não sai (é o próprio aparelho que corta).
 */
let ctx: AudioContext | null = null;

/** Chamar dentro de um toque: liga o som (o iPhone exige). */
export function prepararSom() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // aparelho sem som: o jogo segue sem
  }
}

function nota(c: AudioContext, freq: number, inicio: number, duracao: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + inicio;
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + duracao + 0.02);
}

/** "Plim" da sua vez. */
export function tocarSuaVez() {
  if (!ctx || ctx.state !== 'running') return;
  try {
    nota(ctx, 660, 0, 0.25);
    nota(ctx, 880, 0.12, 0.35);
  } catch {
    // sem som não é problema
  }
}
