/**
 * Animação das jogadas do computador: as cartas "voam" uma de cada vez,
 * do lugar de onde saem até o jogo onde entram, para dar para acompanhar.
 *
 * Técnica (chamada "FLIP"): guarda onde cada carta estava, redesenha a tela,
 * coloca a carta de volta no lugar antigo com um deslocamento e deixa o
 * navegador deslizar até o lugar novo.
 */
import type { Jogo } from '../motor/partida';

/** Guarda a posição de todas as cartas na tela. */
export function capturarPosicoes(raiz: HTMLElement): Map<string, DOMRect> {
  const mapa = new Map<string, DOMRect>();
  raiz.querySelectorAll<HTMLElement>('[data-carta]').forEach((el) => mapa.set(el.dataset.carta!, el.getBoundingClientRect()));
  return mapa;
}

/**
 * Faz as cartas deslizarem das posições antigas para as novas.
 * - "voando": a carta principal do movimento (vai mais devagar e com brilho);
 * - "origemExtra": de onde sai a carta que não estava na tela (ex.: a mão do computador).
 */
export function animarMovimento(
  raiz: HTMLElement,
  antes: Map<string, DOMRect>,
  ms: number,
  voando?: string,
  origemExtra?: DOMRect | null,
) {
  raiz.classList.add('animando');
  raiz.querySelectorAll<HTMLElement>('[data-carta]').forEach((el) => {
    const id = el.dataset.carta!;
    const novo = el.getBoundingClientRect();
    const velho = antes.get(id) ?? (id === voando ? origemExtra : null);
    if (!velho || novo.width === 0) return;
    const dx = velho.left - novo.left;
    const dy = velho.top - novo.top;
    const escala = velho.width / novo.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(escala - 1) < 0.01) return;

    const principal = id === voando;
    el.style.transition = 'none';
    el.style.transformOrigin = 'top left';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${escala})`;
    if (principal) el.classList.add('voando');
    // Espera o navegador "ver" a posição antiga e então solta a carta.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = `transform ${principal ? ms : ms * 0.6}ms ease-in-out`;
        el.style.transform = '';
      }),
    );
  });
  setTimeout(() => {
    raiz.classList.remove('animando');
    raiz.querySelectorAll('.voando').forEach((el) => el.classList.remove('voando'));
  }, ms + 50);
}

/**
 * Quebra uma mudança da mesa em movimentos de UMA carta por vez.
 * Primeiro as cartas que trocam de jogo na mesa, depois as que vêm da mão.
 * Devolve, para cada movimento, como a mesa fica e qual carta se mexeu.
 */
export function movimentosUmAUm(antes: Jogo[], depois: Jogo[]): Array<{ mesa: Jogo[]; cartaId: string }> {
  const origem = new Map<string, string>();
  for (const j of antes) for (const c of j.cartas) origem.set(c.id, j.id);
  const destino = new Map<string, string>();
  for (const j of depois) for (const c of j.cartas) destino.set(c.id, j.id);

  const todas = depois.flatMap((j) => j.cartas);
  const ordem = [
    ...todas.filter((c) => origem.has(c.id) && origem.get(c.id) !== destino.get(c.id)),
    ...todas.filter((c) => !origem.has(c.id)),
  ];

  let atual: Jogo[] = antes.map((j) => ({ ...j, cartas: [...j.cartas] }));
  const quadros: Array<{ mesa: Jogo[]; cartaId: string }> = [];
  for (const carta of ordem) {
    const para = destino.get(carta.id)!;
    atual = atual.map((j) => ({ ...j, cartas: j.cartas.filter((c) => c.id !== carta.id) }));
    if (!atual.some((j) => j.id === para)) atual.push({ id: para, cartas: [] });
    atual = atual.map((j) => (j.id === para ? { ...j, cartas: [...j.cartas, carta] } : j));
    quadros.push({ mesa: atual.filter((j) => j.cartas.length > 0), cartaId: carta.id });
  }
  return quadros;
}
