import { encaixar } from './encaixe';

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

export function ligarToque(raiz: HTMLElement, acoes: AcoesDeToque) {
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

    const alvoEm = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-destino]') ?? null;

    const mover = (e: PointerEvent) => {
      if (!fantasma) {
        if (Math.hypot(e.clientX - inicioX, e.clientY - inicioY) < DISTANCIA_ARRASTO) return;
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
        // Mostra o espaço vazio da mesa (jogo novo) e refaz o encaixe, pois a mesa ganhou um item.
        document.body.classList.add('arrastando-cartas');
        encaixar();
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
        else encaixar();
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
