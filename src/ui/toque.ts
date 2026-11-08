/**
 * Toque e arrasto das cartas (funciona com dedo no iPad e com mouse no computador).
 *
 * - Tocar e soltar no mesmo lugar = "tocar" a carta (escolher / tirar a escolha).
 * - Encostar e arrastar = levar a carta (ou as cartas escolhidas) até um destino.
 */

export interface AcoesDeToque {
  /** Se agora a jogadora pode mexer nas cartas. */
  podeMexer(): boolean;
  tocarCarta(id: string): void;
  /** Quais cartas vão junto quando arrasta esta. */
  cartasParaArrastar(id: string): string[];
  /** Soltou as cartas. "alvo" é o elemento que estava embaixo do dedo. */
  soltar(ids: string[], alvo: Element | null, x: number, y: number): void;
}

/** Distância (em pixels) que o dedo precisa andar para virar "arrasto". */
const DISTANCIA_ARRASTO = 12;
/**
 * Mesa que rola (celular, mesa cheia): as cartas dela deixam o dedo "puxar" na vertical para rolar a mesa.
 * Para também poder ARRASTAR essas cartas em qualquer direção: segurar o dedo parado um instante e então mover.
 */
const TEMPO_SEGURAR_MS = 180;

/** Enquanto é true, o toque não rola a tela (a carta está sendo levada). */
let travarRolagem = false;

export function ligarToque(raiz: HTMLElement, acoes: AcoesDeToque) {
  // Precisa existir ANTES do toque começar (iOS) e não pode ser "passive", senão não consegue segurar a rolagem.
  window.addEventListener('touchmove', (ev) => { if (travarRolagem && ev.cancelable) ev.preventDefault(); }, { passive: false });
  raiz.addEventListener('pointerdown', (ev) => {
    const cartaEl = (ev.target as Element).closest<HTMLElement>('[data-carta]');
    if (!cartaEl || !acoes.podeMexer() || ev.button > 0) return;
    ev.preventDefault();

    const id = cartaEl.dataset.carta!;
    const inicioX = ev.clientX;
    const inicioY = ev.clientY;
    let fantasma: HTMLElement | null = null;
    let ids: string[] = [];
    let alvoAtual: Element | null = null;
    // Carta de mesa que rola, tocada com o dedo: segurar um instante libera o arrasto em qualquer direção.
    const naMesaQueRola = ev.pointerType === 'touch' && !!cartaEl.closest('.mesa.rolavel');
    let segurou = false;
    const relogio = naMesaQueRola
      ? window.setTimeout(() => { segurou = true; travarRolagem = true; navigator.vibrate?.(8); }, TEMPO_SEGURAR_MS)
      : 0;

    const alvoEm = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-destino]') ?? null;

    const mover = (e: PointerEvent) => {
      if (!fantasma) {
        if (Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < (segurou ? 4 : DISTANCIA_ARRASTO)) return;
        clearTimeout(relogio);
        travarRolagem = true;
        // Começou a arrastar: cria uma cópia das cartas que segue o dedo.
        ids = acoes.cartasParaArrastar(id);
        fantasma = document.createElement('div');
        fantasma.className = 'fantasma';
        for (const cid of ids) {
          const original = raiz.querySelector<HTMLElement>(`[data-carta="${cid}"]`);
          if (!original) continue;
          const copia = original.cloneNode(true) as HTMLElement;
          copia.classList.remove('selecionada', 'nova', 'dica', 'chegou');
          copia.style.setProperty('--w', `${original.offsetWidth}px`);
          copia.style.marginLeft = fantasma.childElementCount ? `${-original.offsetWidth * 0.5}px` : '0';
          fantasma.appendChild(copia);
          original.classList.add('arrastando');
        }
        document.body.appendChild(fantasma);
        // Mostra o espaço vazio da mesa (jogo novo); o lugar dele já está reservado, então nada se mexe.
        document.body.classList.add('arrastando-cartas');
      }
      fantasma.style.left = `${e.clientX - 30}px`;
      fantasma.style.top = `${e.clientY - 40}px`;
      const alvo = alvoEm(e.clientX, e.clientY);
      if (alvo !== alvoAtual) {
        alvoAtual?.classList.remove('alvo-arraste');
        alvo?.classList.add('alvo-arraste');
        alvoAtual = alvo;
      }
    };

    const terminar = (e: PointerEvent, cancelado: boolean) => {
      clearTimeout(relogio);
      travarRolagem = false;
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoCancelar);
      alvoAtual?.classList.remove('alvo-arraste');
      if (fantasma) {
        // Primeiro descobre onde soltou (o espaço vazio da mesa só existe enquanto arrasta).
        const alvoFinal = alvoEm(e.clientX, e.clientY);
        document.body.classList.remove('arrastando-cartas');
        fantasma.remove();
        raiz.querySelectorAll('.arrastando').forEach((el) => el.classList.remove('arrastando'));
        if (!cancelado) acoes.soltar(ids, alvoFinal, e.clientX, e.clientY);
      } else if (!cancelado) {
        acoes.tocarCarta(id);
      }
    };
    const aoSoltar = (e: PointerEvent) => terminar(e, false);
    const aoCancelar = (e: PointerEvent) => terminar(e, true);

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoCancelar);
  });
}
