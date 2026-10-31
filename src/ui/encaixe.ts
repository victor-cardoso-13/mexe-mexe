/**
 * Faz tudo caber na tela, SEM barra de rolagem.
 * Começa com as cartas grandes e vai diminuindo até caber.
 */

const raiz = document.documentElement;

function definir(variavel: string, px: number) {
  raiz.style.setProperty(variavel, `${px}px`);
}

let ultimaChave = '';

/**
 * "chave" resume o que muda o tamanho (jogos da mesa, quantas cartas na mão, tamanho da tela).
 * Se nada disso mudou desde a última vez, não precisa recalcular (deixa as animações leves).
 */
export function encaixar(chave = '') {
  const mesa = document.querySelector<HTMLElement>('.mesa');
  const mao = document.querySelector<HTMLElement>('.mao');
  if (!mesa || !mao) return;
  const chaveCompleta = `${chave}|${window.innerWidth}x${window.innerHeight}`;
  if (chave && chaveCompleta === ultimaChave) return;
  ultimaChave = chaveCompleta;

  const largura = window.innerWidth;
  const altura = window.innerHeight;

  // 1) Mão: o maior tamanho possível, ocupando no máximo ~1/3 da altura da tela
  //    (no celular deitado, que é bem baixo, no máximo ~1/4).
  const limiteMao = altura < 500 ? 0.25 : 0.33;
  // Começa grande (no máximo ~1/5 da largura) e o laço abaixo encolhe se as filas não couberem.
  let wMao = Math.round(Math.min(largura / 5, altura * 0.135, 110));
  definir('--mao-w', wMao);
  while (mao.scrollHeight > altura * limiteMao && wMao > 30) {
    wMao -= 3;
    definir('--mao-w', wMao);
  }

  // 2) Mesa: o maior tamanho de carta em que todos os jogos cabem (busca rápida "metade-metade").
  const MESA_MAXIMA = 92;
  // Celular = tela estreita (em pé) ou baixa (deitado).
  const celular = largura <= 600 || altura <= 500;
  const MESA_CELULAR = altura <= 500 ? 36 : 40;
  mesa.classList.remove('rolavel');
  const MESA_LEGIVEL = 28;
  const MESA_MINIMA = 18;
  const transborda = () => mesa.scrollHeight > mesa.clientHeight + 1 || mesa.scrollWidth > mesa.clientWidth + 1;
  const encaixarMesa = (minimo: number): number => {
    let cabe = minimo;
    let naoCabe = MESA_MAXIMA + 1;
    definir('--mesa-w', MESA_MAXIMA);
    if (!transborda()) return MESA_MAXIMA;
    while (naoCabe - cabe > 1) {
      const meio = Math.floor((cabe + naoCabe) / 2);
      definir('--mesa-w', meio);
      if (transborda()) naoCabe = meio;
      else cabe = meio;
    }
    definir('--mesa-w', cabe);
    return cabe;
  };

  // 3) Equilíbrio: se a mesa ficou bem menor que a mão (ex.: mão com 3 cartas enormes e
  //    mesa cheia de cartas miúdas), a mão encolhe um pouco para a mesa crescer.
  //    A mão nunca fica menor que MAO_CONFORTAVEL só por isso.
  const MAO_CONFORTAVEL = Math.round(Math.min(56, altura * 0.11));
  const MAO_MINIMA = 34;
  let wMesa = encaixarMesa(MESA_LEGIVEL);
  while (wMesa < wMao * 0.8 && wMao - 4 >= MAO_CONFORTAVEL) {
    wMao -= 4;
    definir('--mao-w', wMao);
    wMesa = encaixarMesa(MESA_LEGIVEL);
  }
  // Se nem assim couber, a mão encolhe mais; e só em último caso a mesa fica bem pequena.
  while (transborda() && wMao > MAO_MINIMA) {
    wMao -= 4;
    definir('--mao-w', wMao);
    wMesa = encaixarMesa(MESA_LEGIVEL);
  }
  if (!celular) {
    if (transborda()) encaixarMesa(MESA_MINIMA);
    return;
  }
  // Celular: em vez de cartas miúdas, a mesa fica com um tamanho mínimo legível e,
  // se não couber, SÓ a área da mesa rola com o dedo (mão e botões ficam fixos).
  if (wMesa < MESA_CELULAR) {
    definir('--mesa-w', MESA_CELULAR);
    mesa.classList.add('rolavel');
  }
}
